import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import {
  SplitTree,
  SplitNode,
  Recipient,
  ValidationResult,
  SplitXCHMapping,
  BasisPointsUtils,
  AddressType,
  FinalizationResult,
} from '../models/split-tree.models';

@Injectable({
  providedIn: 'root',
})
export class SplitTreeService {
  private currentTreeSubject = new BehaviorSubject<SplitTree | null>(null);
  public currentTree$: Observable<SplitTree | null> =
    this.currentTreeSubject.asObservable();

  /**
   * Generate a unique ID for nodes/recipients
   */
  generateId(): string {
    return `id_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate a placeholder address for SplitXCH splits during blueprint phase
   */
  generatePlaceholderAddress(): string {
    return `splitxch_temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Initialize a new split tree
   * Root is always a SplitXCH address (placeholder initially)
   * Starts with two default wallet recipients (50% each)
   */
  createNewTree(name?: string): SplitTree {
    const root: SplitNode = {
      id: this.generateId(),
      name: name || 'Main Split',
      recipients: [
        {
          id: this.generateId(),
          name: 'Recipient 1',
          address: 'xch1...',
          addressType: AddressType.FIXED_WALLET,
          basisPoints: BasisPointsUtils.MAX_BASIS_POINTS / 2, // 50% = 5,000 basis points
        },
        {
          id: this.generateId(),
          name: 'Recipient 2',
          address: 'xch1...',
          addressType: AddressType.FIXED_WALLET,
          basisPoints: BasisPointsUtils.MAX_BASIS_POINTS / 2, // 50% = 5,000 basis points
        },
      ],
      children: [],
      parentId: null,
      basisPoints: BasisPointsUtils.MAX_BASIS_POINTS, // 100% = 10,000 basis points
      // Root is always a SplitXCH split (placeholder during blueprint phase)
      splitAddress: this.generatePlaceholderAddress(),
      isSplitXCH: true,
    };

    const tree: SplitTree = {
      root,
      metadata: {
        name: name || 'New Split Tree',
        createdAt: new Date(),
        updatedAt: new Date(),
        isFinalized: false,
      },
    };

    this.currentTreeSubject.next(tree);
    return tree;
  }

  /**
   * Get the current split tree
   */
  getCurrentTree(): SplitTree | null {
    return this.currentTreeSubject.value;
  }

  /**
   * Set the current split tree
   */
  setCurrentTree(tree: SplitTree): void {
    if (tree.metadata) {
      tree.metadata.updatedAt = new Date();
    }
    this.currentTreeSubject.next(tree);
  }

  /**
   * Find a node by ID in the tree
   */
  findNodeById(tree: SplitTree, nodeId: string): SplitNode | null {
    const searchNode = (node: SplitNode): SplitNode | null => {
      if (node.id === nodeId) {
        return node;
      }
      if (node.children) {
        for (const child of node.children) {
          const found = searchNode(child);
          if (found) return found;
        }
      }
      return null;
    };

    return searchNode(tree.root);
  }

  /**
   * Add a recipient to a split node (deprecated - use addFixedWalletRecipient or addSplitXCHRecipient)
   * @deprecated Use addFixedWalletRecipient or addSplitXCHRecipient instead
   */
  addRecipient(
    tree: SplitTree,
    nodeId: string,
    recipient: Omit<Recipient, 'id'>
  ): SplitTree {
    const node = this.findNodeById(tree, nodeId);
    if (!node) {
      throw new Error(`Node with id ${nodeId} not found`);
    }

    // Initialize recipients array if needed
    if (!node.recipients) {
      node.recipients = [];
    }

    // Add recipient with generated ID
    const newRecipient: Recipient = {
      ...recipient,
      id: this.generateId(),
      // Default to FIXED_WALLET if not specified
      addressType: recipient.addressType || AddressType.FIXED_WALLET,
    };

    node.recipients.push(newRecipient);
    this.setCurrentTree(tree);
    return tree;
  }

  /**
   * Remove a recipient from a split node
   */
  removeRecipient(tree: SplitTree, nodeId: string, recipientId: string): SplitTree {
    const node = this.findNodeById(tree, nodeId);
    if (!node || !node.recipients) {
      return tree;
    }

    // Create a new array to ensure reference change
    node.recipients = node.recipients.filter((r) => r.id !== recipientId);
    this.setCurrentTree(tree);
    return tree;
  }

  /**
   * Add a nested split (child) to a split node
   * Creates a new SplitXCH split with a placeholder address
   */
  addNestedSplit(
    tree: SplitTree,
    parentNodeId: string,
    splitName: string,
    basisPoints: number
  ): SplitTree {
    const parentNode = this.findNodeById(tree, parentNodeId);
    if (!parentNode) {
      throw new Error(`Parent node with id ${parentNodeId} not found`);
    }

    // Initialize children array if needed
    if (!parentNode.children) {
      parentNode.children = [];
    }

    const newSplit: SplitNode = {
      id: this.generateId(),
      name: splitName,
      recipients: [],
      children: [],
      parentId: parentNodeId,
      basisPoints,
      splitAddress: this.generatePlaceholderAddress(),
      isSplitXCH: true,
    };

    parentNode.children.push(newSplit);
    this.setCurrentTree(tree);
    return tree;
  }

  /**
   * Add a fixed wallet address as a recipient
   */
  addFixedWalletRecipient(
    tree: SplitTree,
    nodeId: string,
    name: string,
    address: string,
    basisPoints: number
  ): SplitTree {
    const node = this.findNodeById(tree, nodeId);
    if (!node) {
      throw new Error(`Node with id ${nodeId} not found`);
    }

    if (!node.recipients) {
      node.recipients = [];
    }

    const recipient: Recipient = {
      id: this.generateId(),
      name,
      address,
      addressType: AddressType.FIXED_WALLET,
      basisPoints,
    };

    node.recipients.push(recipient);
    this.setCurrentTree(tree);
    return tree;
  }

  /**
   * Add a SplitXCH split address as a recipient (references another split node)
   * This creates a link to an existing split node
   */
  addSplitXCHRecipient(
    tree: SplitTree,
    nodeId: string,
    name: string,
    targetSplitNodeId: string,
    basisPoints: number
  ): SplitTree {
    const node = this.findNodeById(tree, nodeId);
    const targetNode = this.findNodeById(tree, targetSplitNodeId);
    
    if (!node) {
      throw new Error(`Node with id ${nodeId} not found`);
    }
    if (!targetNode || !targetNode.isSplitXCH) {
      throw new Error(`Target split node with id ${targetSplitNodeId} not found or is not a SplitXCH split`);
    }

    if (!node.recipients) {
      node.recipients = [];
    }

    const recipient: Recipient = {
      id: this.generateId(),
      name,
      address: targetNode.splitAddress || this.generatePlaceholderAddress(),
      addressType: AddressType.SPLITXCH_PLACEHOLDER,
      basisPoints,
      // Reference to the split node this recipient represents
      splitNodeId: targetSplitNodeId,
    };

    node.recipients.push(recipient);
    this.setCurrentTree(tree);
    return tree;
  }

  /**
   * Remove a nested split from a split node
   */
  removeNestedSplit(tree: SplitTree, parentNodeId: string, childNodeId: string): SplitTree {
    const parentNode = this.findNodeById(tree, parentNodeId);
    if (!parentNode || !parentNode.children) {
      return tree;
    }

    // Create a new array to ensure reference change
    parentNode.children = parentNode.children.filter((c) => c.id !== childNodeId);
    
    // Also remove any recipients that reference this deleted split node
    const removeReferencesToDeletedSplit = (node: SplitNode): void => {
      if (node.recipients) {
        node.recipients = node.recipients.filter((r) => r.splitNodeId !== childNodeId);
      }
      if (node.children) {
        node.children.forEach((child) => removeReferencesToDeletedSplit(child));
      }
    };
    removeReferencesToDeletedSplit(tree.root);
    
    this.setCurrentTree(tree);
    return tree;
  }

  /**
   * Update a recipient's details
   */
  updateRecipient(
    tree: SplitTree,
    nodeId: string,
    recipientId: string,
    updates: Partial<Recipient>
  ): SplitTree {
    const node = this.findNodeById(tree, nodeId);
    if (!node || !node.recipients) {
      return tree;
    }

    const recipient = node.recipients.find((r) => r.id === recipientId);
    if (recipient) {
      Object.assign(recipient, updates);
      this.setCurrentTree(tree);
    }

    return tree;
  }

  /**
   * Update a split node's details
   */
  updateSplitNode(
    tree: SplitTree,
    nodeId: string,
    updates: Partial<SplitNode>
  ): SplitTree {
    const node = this.findNodeById(tree, nodeId);
    if (!node) {
      return tree;
    }

    Object.assign(node, updates);
    this.setCurrentTree(tree);
    return tree;
  }

  /**
   * Validate the split tree structure
   * Ensures all branches sum to exactly 10,000 basis points (100%)
   */
  validateTree(tree: SplitTree): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    const validateNode = (node: SplitNode, path: string = ''): void => {
      const nodePath = path ? `${path} > ${node.name}` : node.name;
      let totalBasisPoints = 0;

      // Validate recipients
      if (node.recipients && node.recipients.length > 0) {
        const recipientTotal = node.recipients.reduce(
          (sum, r) => sum + r.basisPoints,
          0
        );
        totalBasisPoints += recipientTotal;

        // Check for duplicate addresses (excluding placeholder addresses)
        const realAddresses = node.recipients
          .filter((r) => {
            // Only check addresses that are not placeholders and not empty
            const address = r.address?.trim().toLowerCase() || '';
            return address && 
                   !address.startsWith('splitxch_temp_') && 
                   address !== 'xch1...' &&
                   address !== '';
          })
          .map((r) => r.address.toLowerCase());
        const uniqueAddresses = new Set(realAddresses);
        if (realAddresses.length !== uniqueAddresses.size) {
          errors.push(`Duplicate addresses found in ${nodePath}`);
        }

        // Validate recipient basis points
        node.recipients.forEach((r) => {
          if (r.basisPoints < 0 || r.basisPoints > BasisPointsUtils.MAX_BASIS_POINTS) {
            errors.push(
              `Invalid basis points ${r.basisPoints} (${BasisPointsUtils.formatBasisPoints(r.basisPoints)}) for recipient ${r.name} in ${nodePath}`
            );
          }
          // Only validate address for fixed wallets (not placeholders)
          // Consider empty strings and placeholder 'xch1...' as missing addresses
          const address = r.address?.trim() || '';
          const isEmptyOrPlaceholder = !address || address === '' || address === 'xch1...';
          if (r.addressType === AddressType.FIXED_WALLET && isEmptyOrPlaceholder) {
            errors.push(`Missing address for recipient ${r.name} in ${nodePath}`);
          }
        });
      }

      // Validate nested splits
      if (node.children && node.children.length > 0) {
        const childrenTotal = node.children.reduce(
          (sum, c) => sum + c.basisPoints,
          0
        );
        totalBasisPoints += childrenTotal;

        // Recursively validate children
        node.children.forEach((child) => {
          validateNode(child, nodePath);
        });
      }

      // Validate total basis points (must sum to exactly 10,000 = 100%)
      // Allow a small tolerance for floating point errors (1 basis point = 0.01%)
      if (totalBasisPoints > 0 && Math.abs(totalBasisPoints - BasisPointsUtils.MAX_BASIS_POINTS) > 1) {
        const percentage = BasisPointsUtils.formatBasisPoints(totalBasisPoints);
        errors.push(
          `Basis points in ${nodePath} sum to ${totalBasisPoints} bp (${percentage}) instead of ${BasisPointsUtils.MAX_BASIS_POINTS} bp (100%)`
        );
      }

      // Warning for empty nodes
      const hasRecipients = node.recipients && node.recipients.length > 0;
      const hasChildren = node.children && node.children.length > 0;
      if (!hasRecipients && !hasChildren) {
        warnings.push(`Empty split node: ${nodePath}`);
      }

      // Warning for mixed nodes (both recipients and children)
      if (hasRecipients && hasChildren) {
        warnings.push(
          `Mixed node ${nodePath} has both recipients and nested splits. Ensure basis points are correctly distributed.`
        );
      }
    };

    validateNode(tree.root);

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Calculate final basis points for each recipient
   * This accounts for nested splits by multiplying basis points down the tree
   */
  calculateFinalBasisPoints(tree: SplitTree): Map<string, number> {
    const finalBasisPoints = new Map<string, number>();

    const traverseNode = (node: SplitNode, parentBasisPoints: number = BasisPointsUtils.MAX_BASIS_POINTS): void => {
      // Calculate this node's share of parent's basis points
      const nodeBasisPoints = Math.round((parentBasisPoints * node.basisPoints) / BasisPointsUtils.MAX_BASIS_POINTS);

      // Process direct recipients
      if (node.recipients) {
        node.recipients.forEach((recipient) => {
          // Calculate recipient's share of this node's basis points
          const recipientBasisPoints = Math.round((nodeBasisPoints * recipient.basisPoints) / BasisPointsUtils.MAX_BASIS_POINTS);
          const current = finalBasisPoints.get(recipient.address.toLowerCase()) || 0;
          finalBasisPoints.set(recipient.address.toLowerCase(), current + recipientBasisPoints);
        });
      }

      // Process nested splits
      if (node.children) {
        node.children.forEach((child) => {
          traverseNode(child, nodeBasisPoints);
        });
      }
    };

    traverseNode(tree.root);
    return finalBasisPoints;
  }

  /**
   * Calculate final percentages for display (converts basis points to percentages)
   */
  calculateFinalPercentages(tree: SplitTree): Map<string, number> {
    const finalBasisPoints = this.calculateFinalBasisPoints(tree);
    const finalPercentages = new Map<string, number>();

    finalBasisPoints.forEach((basisPoints, address) => {
      finalPercentages.set(address, BasisPointsUtils.basisPointsToPercentage(basisPoints));
    });

    return finalPercentages;
  }

  /**
   * Export tree to SplitXCH mapping format
   */
  exportToSplitXCH(tree: SplitTree): SplitXCHMapping {
    const finalBasisPoints = this.calculateFinalBasisPoints(tree);
    const recipientMap = new Map<string, { name: string; basisPoints: number }>();

    // Collect all recipients with their addresses and names
    const collectRecipients = (node: SplitNode): void => {
      if (node.recipients) {
        node.recipients.forEach((recipient) => {
          const address = recipient.address.toLowerCase();
          const current = recipientMap.get(address);
          if (!current || current.name === recipient.name) {
            recipientMap.set(address, {
              name: recipient.name,
              basisPoints: finalBasisPoints.get(address) || 0,
            });
          }
        });
      }

      if (node.children) {
        node.children.forEach((child) => {
          collectRecipients(child);
        });
      }
    };

    collectRecipients(tree.root);

    // Convert to array and normalize basis points to sum to 10,000 (100%)
    const totalBasisPoints = Array.from(recipientMap.values()).reduce(
      (sum, r) => sum + r.basisPoints,
      0
    );

    const recipients = Array.from(recipientMap.entries()).map(([address, data]) => ({
      address,
      name: data.name,
      basisPoints:
        totalBasisPoints > 0
          ? Math.round((data.basisPoints * BasisPointsUtils.MAX_BASIS_POINTS) / totalBasisPoints)
          : 0,
    }));

    return {
      recipients,
      tree: JSON.parse(JSON.stringify(tree.root)), // Deep copy
    };
  }

  /**
   * Import tree from JSON
   */
  importTree(json: string): SplitTree {
    const tree = JSON.parse(json) as SplitTree;
    // Validate the imported tree
    const validation = this.validateTree(tree);
    if (!validation.valid) {
      throw new Error(`Invalid tree: ${validation.errors.join(', ')}`);
    }
    this.setCurrentTree(tree);
    return tree;
  }

  /**
   * Export tree to JSON
   */
  exportToJSON(tree: SplitTree): string {
    return JSON.stringify(tree, null, 2);
  }

  /**
   * Finalize the blueprint by creating all SplitXCH addresses
   * Works backwards through the tree (bottom-up) to create splits
   * 
   * @param tree The blueprint tree to finalize
   * @param createSplitCallback Function to call SplitXCH API to create a split
   *   Should return the created split address
   */
  async finalizeBlueprint(
    tree: SplitTree,
    createSplitCallback: (recipients: Array<{ address: string; basisPoints: number }>) => Promise<string>
  ): Promise<FinalizationResult> {
    const result: FinalizationResult = {
      success: true,
      createdAddresses: new Map<string, string>(),
      errors: [],
    };

    try {
      // Collect all nodes in bottom-up order (leaves first, root last)
      const nodesInOrder: SplitNode[] = [];
      const collectNodes = (node: SplitNode): void => {
        // Process children first
        if (node.children) {
          node.children.forEach((child) => collectNodes(child));
        }
        // Then process this node
        nodesInOrder.push(node);
      };
      collectNodes(tree.root);

      // Process each node from bottom to top
      for (const node of nodesInOrder) {
        if (!node.isSplitXCH) {
          continue; // Skip non-SplitXCH nodes
        }

        // Collect recipients for this split
        const recipients: Array<{ address: string; basisPoints: number }> = [];

        // Add direct recipients (fixed wallets or already-created splits)
        if (node.recipients) {
          for (const recipient of node.recipients) {
            let address = recipient.address;

            // If this recipient is a SplitXCH split, use the created address
            if (recipient.addressType === AddressType.SPLITXCH_PLACEHOLDER && recipient.splitNodeId) {
              const createdAddress = result.createdAddresses.get(recipient.splitNodeId);
              if (!createdAddress) {
                result.errors.push(
                  `Recipient "${recipient.name}" references split node "${recipient.splitNodeId}" which hasn't been created yet`
                );
                result.success = false;
                continue;
              }
              address = createdAddress;
            }

            recipients.push({
              address,
              basisPoints: recipient.basisPoints,
            });
          }
        }

        // Add nested splits as recipients (using their created addresses)
        if (node.children) {
          for (const child of node.children) {
            if (child.isSplitXCH) {
              const childAddress = result.createdAddresses.get(child.id);
              if (!childAddress) {
                result.errors.push(
                  `Child split "${child.name}" hasn't been created yet`
                );
                result.success = false;
                continue;
              }

              recipients.push({
                address: childAddress,
                basisPoints: child.basisPoints,
              });
            }
          }
        }

        // Validate we have recipients
        if (recipients.length === 0) {
          result.errors.push(`Split "${node.name}" has no recipients`);
          result.success = false;
          continue;
        }

        // Validate basis points sum to 10000
        const totalBasisPoints = recipients.reduce((sum, r) => sum + r.basisPoints, 0);
        if (Math.abs(totalBasisPoints - BasisPointsUtils.MAX_BASIS_POINTS) > 1) {
          result.errors.push(
            `Split "${node.name}" basis points sum to ${totalBasisPoints} instead of ${BasisPointsUtils.MAX_BASIS_POINTS}`
          );
          result.success = false;
          continue;
        }

        // Create the split via SplitXCH API
        try {
          const splitAddress = await createSplitCallback(recipients);
          result.createdAddresses.set(node.id, splitAddress);

          // Update the node with the real address
          node.splitAddress = splitAddress;
          if (node.recipients) {
            // Update recipient addresses that reference this split
            node.recipients.forEach((recipient) => {
              if (recipient.splitNodeId === node.id) {
                recipient.address = splitAddress;
                recipient.addressType = AddressType.SPLITXCH_REAL;
              }
            });
          }
        } catch (error) {
          result.errors.push(`Failed to create split "${node.name}": ${(error as Error).message}`);
          result.success = false;
        }
      }

      if (result.success) {
        // Mark tree as finalized
        if (tree.metadata) {
          tree.metadata.isFinalized = true;
          tree.metadata.updatedAt = new Date();
        }
        result.finalizedTree = tree;
        this.setCurrentTree(tree);
      }

      return result;
    } catch (error) {
      result.success = false;
      result.errors.push(`Finalization failed: ${(error as Error).message}`);
      return result;
    }
  }

  /**
   * Check if tree has any placeholder addresses (not yet finalized)
   */
  hasPlaceholders(tree: SplitTree): boolean {
    const checkNode = (node: SplitNode): boolean => {
      // Check if this split node has a placeholder
      if (node.isSplitXCH && node.splitAddress?.startsWith('splitxch_temp_')) {
        return true;
      }

      // Check recipients for placeholders
      if (node.recipients) {
        for (const recipient of node.recipients) {
          if (recipient.addressType === AddressType.SPLITXCH_PLACEHOLDER) {
            return true;
          }
          if (recipient.address?.startsWith('splitxch_temp_')) {
            return true;
          }
        }
      }

      // Check children
      if (node.children) {
        for (const child of node.children) {
          if (checkNode(child)) {
            return true;
          }
        }
      }

      return false;
    };

    return checkNode(tree.root);
  }
}
