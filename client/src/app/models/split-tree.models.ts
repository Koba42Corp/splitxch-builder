/**
 * Models for the SplitXCH split tree system
 * Supports infinitely nested splits for complex revenue distribution
 */

/**
 * Type of address in the split tree
 */
export enum AddressType {
  /** Fixed wallet address (real XCH address) */
  FIXED_WALLET = 'FIXED_WALLET',
  /** SplitXCH placeholder address (temporary, during blueprint phase) */
  SPLITXCH_PLACEHOLDER = 'SPLITXCH_PLACEHOLDER',
  /** SplitXCH real address (created after finalization) */
  SPLITXCH_REAL = 'SPLITXCH_REAL',
}

/**
 * Represents a recipient in the split tree
 */
export interface Recipient {
  /** Unique identifier for the recipient */
  id: string;
  /** Display name of the recipient */
  name: string;
  /** XCH address or identifier for payments */
  address: string;
  /** Type of address */
  addressType: AddressType;
  /** Basis points share (0-10000, where 10000 = 100%) */
  basisPoints: number;
  /** Reference to split node ID if this recipient is a SplitXCH split */
  splitNodeId?: string;
}

/**
 * Utility functions for basis points conversion
 * Basis points: 1 bp = 0.01%, so 100% = 10,000 basis points
 */
export class BasisPointsUtils {
  /** Convert percentage (0-100) to basis points (0-10000) */
  static percentageToBasisPoints(percentage: number): number {
    return Math.round(percentage * 100);
  }

  /** Convert basis points (0-10000) to percentage (0-100) */
  static basisPointsToPercentage(basisPoints: number): number {
    return basisPoints / 100;
  }

  /** Format basis points as percentage string */
  static formatBasisPoints(basisPoints: number, decimals: number = 2): string {
    return this.basisPointsToPercentage(basisPoints).toFixed(decimals) + '%';
  }

  /** Maximum basis points (100%) */
  static readonly MAX_BASIS_POINTS = 10000;

  /** SplitXCH fee in basis points (25 bps = 0.25% per split) */
  static readonly SPLITXCH_FEE_BASIS_POINTS = 25;
}

/**
 * Represents a split node in the tree
 * Can contain either direct recipients or nested splits
 */
export interface SplitNode {
  /** Unique identifier for this split node */
  id: string;
  /** Display name for this split group */
  name: string;
  /** Direct recipients in this split (leaf nodes) */
  recipients?: Recipient[];
  /** Nested splits (allows infinite nesting) */
  children?: SplitNode[];
  /** Parent split ID (null for root) */
  parentId: string | null;
  /** Total basis points this split represents (should sum to 10000 for siblings) */
  basisPoints: number;
  /** SplitXCH address (placeholder during blueprint, real after finalization) */
  splitAddress?: string;
  /** Whether this node represents a SplitXCH split (vs just a container) */
  isSplitXCH?: boolean;
  /** SplitXCH fee in basis points (25 bps = 0.25% fee per split) */
  feeBasisPoints?: number;
  /** Net basis points after fee deduction (basisPoints - feeBasisPoints) */
  netBasisPoints?: number;
}

/**
 * Complete split tree structure
 */
export interface SplitTree {
  /** Root split node */
  root: SplitNode;
  /** Metadata about the tree */
  metadata?: {
    name?: string;
    description?: string;
    createdAt?: Date;
    updatedAt?: Date;
    /** Whether the blueprint has been finalized (all SplitXCH addresses created) */
    isFinalized?: boolean;
  };
}

/**
 * Result of finalization process
 */
export interface FinalizationResult {
  /** Success status */
  success: boolean;
  /** Created split addresses mapped by node ID */
  createdAddresses: Map<string, string>;
  /** Any errors that occurred */
  errors: string[];
  /** Finalized tree */
  finalizedTree?: SplitTree;
}

/**
 * Validation result for split tree
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Export format for SplitXCH API
 */
export interface SplitXCHMapping {
  /** Flat list of all recipients with their final basis points */
  recipients: Array<{
    address: string;
    name: string;
    basisPoints: number;
  }>;
  /** Tree structure for reference */
  tree: SplitNode;
}

