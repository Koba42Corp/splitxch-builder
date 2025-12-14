import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface SplitXCHRecipient {
  name: string;
  address: string;
  points: number; // basis points (0-10000)
  id: number;
}

export interface CreateSplitRequest {
  recipients: SplitXCHRecipient[];
}

export interface CreateSplitResponse {
  id: string;
  message: string;
  pctProgress: number;
  address: string;
}

export interface ComputeStatusResponse {
  address: string;
  error: boolean;
  id: string;
  message: string;
  pctProgress: number;
}

@Injectable({
  providedIn: 'root',
})
export class SplitXCHApiService {
  private apiUrl = environment.splitXCHApiUrl;
  
  constructor(private http: HttpClient) {}

  /**
   * Create a split using the SplitXCH API
   * POST https://splitxch.com/api/compute/fast
   * 
   * The API automatically adds a fee (150 bps = 1.5% based on the example).
   * Recipient points + API fee must equal 10,000.
   * So we need to scale down recipient points proportionally.
   * 
   * @param recipients Array of recipients with addresses and basis points
   * @returns Promise of the split address
   */
  async createSplitAsync(recipients: Array<{ address: string; basisPoints: number; name?: string }>): Promise<string> {
    const url = `${this.apiUrl}/compute/fast`;
    
    // Calculate total recipient points
    const totalRecipientPoints = recipients.reduce((sum, r) => sum + r.basisPoints, 0);
    
    // The API adds a 150 bps fee (1.5%), so recipient points should be 9850/10000 = 0.985 of total
    // Scale recipient points proportionally so recipient_points + 150 fee = 10,000
    const apiFeeBasisPoints = 150; // API fee from documentation example
    const targetTotal = 10000 - apiFeeBasisPoints; // 9850
    
    // Scale all points proportionally, then adjust the last recipient to ensure exact total
    const scaledRecipients = recipients.map((r, index) => ({
      name: r.name || `Recipient ${index + 1}`,
      address: r.address,
      points: Math.round((r.basisPoints * targetTotal) / totalRecipientPoints), // Scale proportionally
      originalBasisPoints: r.basisPoints,
      id: index + 1,
    }));
    
    // Calculate actual total and adjust the last recipient to ensure exact sum
    const actualTotal = scaledRecipients.reduce((sum, r) => sum + r.points, 0);
    const difference = targetTotal - actualTotal;
    
    // Adjust the last recipient to make the total exactly 9850
    if (difference !== 0 && scaledRecipients.length > 0) {
      scaledRecipients[scaledRecipients.length - 1].points += difference;
    }
    
    // Convert to request format
    const request: CreateSplitRequest = {
      recipients: scaledRecipients.map(r => ({
        name: r.name,
        address: r.address,
        points: r.points,
        id: r.id,
      })),
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = `HTTP error! status: ${response.status}`;
        
        try {
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.message || errorData.error || errorMessage;
        } catch {
          errorMessage = errorText || errorMessage;
        }
        
        throw new Error(errorMessage);
      }

      const data: CreateSplitResponse = await response.json();
      
      if (!data.address) {
        throw new Error(data.message || 'Failed to create split: No address returned');
      }

      return data.address;
    } catch (error) {
      console.error('SplitXCH API Error:', error);
      throw error;
    }
  }

  /**
   * Get the status of a compute operation
   * GET https://splitxch.com/api/compute/{id}
   * 
   * @param computeId The ID returned from createSplitAsync
   * @returns Promise of the compute status
   */
  async getComputeStatus(computeId: string): Promise<ComputeStatusResponse> {
    const url = `${this.apiUrl}/compute/${computeId}`;

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error! status: ${response.status}: ${errorText}`);
      }

      const data: ComputeStatusResponse = await response.json();
      return data;
    } catch (error) {
      console.error('SplitXCH API Status Error:', error);
      throw error;
    }
  }
}

