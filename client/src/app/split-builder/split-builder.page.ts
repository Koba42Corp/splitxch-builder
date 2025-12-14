import { Component, OnInit } from '@angular/core';
import { SplitTreeService } from '../services/split-tree.service';
import { SplitXCHApiService } from '../services/splitxch-api.service';
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
import { AlertController, LoadingController } from '@ionic/angular';

@Component({
  selector: 'app-split-builder',
  templateUrl: './split-builder.page.html',
  styleUrls: ['./split-builder.page.scss'],
  standalone: false,
})
export class SplitBuilderPage implements OnInit {
  tree: SplitTree | null = null;
  validation: ValidationResult | null = null;
  selectedNode: SplitNode | null = null;
  showAddRecipientModal = false;
  showAddNestedSplitModal = false;
  showEditRecipientModal = false;
  showExportModal = false;
  showNewTreeModal = false;
  
  viewMode: 'diagram' | 'tree' = 'diagram'; // Toggle between visual diagram and tree view

  // Form data for adding recipients
  newRecipient = {
    name: '',
    address: '',
    percentage: 0,
    isFixedWallet: true, // true = fixed wallet, false = new split
  };

  // Form data for nested splits
  newNestedSplit = {
    name: '',
    percentage: 0,
  };

  // Form data for new tree
  newTreeName = 'Main Split';

  // Edit recipient data
  editingRecipient: Recipient | null = null;
  showFinalizeModal = false;
  finalizationResult: FinalizationResult | null = null;

  constructor(
    private splitTreeService: SplitTreeService,
    private splitXCHApi: SplitXCHApiService,
    private alertController: AlertController,
    private loadingController: LoadingController
  ) {}

  ngOnInit() {
    this.splitTreeService.currentTree$.subscribe((tree) => {
      this.tree = tree;
      if (tree) {
        this.validation = this.splitTreeService.validateTree(tree);
        this.getFinalPercentages(); // Update final percentages when tree changes
      }
    });

    // Initialize with a new tree if none exists
    if (!this.tree) {
      this.tree = this.splitTreeService.createNewTree('Main Split');
      this.selectedNode = this.tree.root;
    }
  }

  openNewTreeModal() {
    this.newTreeName = 'Main Split';
    this.showNewTreeModal = true;
  }

  createNewTree() {
    if (!this.newTreeName || this.newTreeName.trim() === '') {
      this.showAlert('Error', 'Please enter a name for the split tree.');
      return;
    }
    
    this.tree = this.splitTreeService.createNewTree(this.newTreeName.trim());
    this.selectedNode = this.tree.root;
    this.showNewTreeModal = false;
  }

  selectNode(node: SplitNode) {
    this.selectedNode = node;
  }

  getRootNode(): SplitNode | null {
    return this.tree?.root || null;
  }

  // Recipient management
  async openAddRecipientModal(node: SplitNode) {
    // Only allow adding recipients to SplitXCH nodes
    if (!node.isSplitXCH) {
      this.showAlert('Error', 'You can only add recipients to SplitXCH nodes, not to wallet addresses.');
      return;
    }

    this.selectedNode = node;
    this.newRecipient = {
      name: '',
      address: '',
      percentage: 0,
      isFixedWallet: true,
    };
    this.showAddRecipientModal = true;
  }

  addRecipient() {
    if (!this.tree || !this.selectedNode) return;

    if (!this.newRecipient.name || !this.newRecipient.percentage) {
      this.showAlert('Error', 'Please fill in name and percentage');
      return;
    }

    // Convert percentage to basis points
    const basisPoints = BasisPointsUtils.percentageToBasisPoints(
      this.newRecipient.percentage
    );

    try {
      if (this.newRecipient.isFixedWallet) {
        // Add fixed wallet address
        if (!this.newRecipient.address) {
          this.showAlert('Error', 'Please enter a wallet address');
          return;
        }
        this.splitTreeService.addFixedWalletRecipient(
          this.tree,
          this.selectedNode.id,
          this.newRecipient.name,
          this.newRecipient.address,
          basisPoints
        );
      } else {
        // Add new SplitXCH split branch
        this.splitTreeService.addNestedSplit(
          this.tree,
          this.selectedNode.id,
          this.newRecipient.name,
          basisPoints
        );
      }

      this.showAddRecipientModal = false;
      this.newRecipient = { name: '', address: '', percentage: 0, isFixedWallet: true };
    } catch (error) {
      this.showAlert('Error', (error as Error).message);
    }
  }

  removeRecipient(node: SplitNode, recipientId: string) {
    if (!this.tree) return;
    this.splitTreeService.removeRecipient(this.tree, node.id, recipientId);
  }

  editingRecipientBasisPoints: number = 0; // Store basis points separately for editing

  async editRecipient(node: SplitNode, recipient: Recipient) {
    this.selectedNode = node;
    this.editingRecipient = { ...recipient };
    // Convert basis points to percentage for UI
    this.editingRecipientBasisPoints = recipient.basisPoints;
    this.showEditRecipientModal = true;
  }

  get editingRecipientPercentage(): number {
    return BasisPointsUtils.basisPointsToPercentage(this.editingRecipientBasisPoints);
  }

  set editingRecipientPercentage(value: number) {
    this.editingRecipientBasisPoints = BasisPointsUtils.percentageToBasisPoints(value);
  }

  saveRecipientEdit() {
    if (!this.tree || !this.selectedNode || !this.editingRecipient) return;

    this.splitTreeService.updateRecipient(this.tree, this.selectedNode.id, this.editingRecipient.id, {
      ...this.editingRecipient,
      basisPoints: this.editingRecipientBasisPoints,
    });
    this.showEditRecipientModal = false;
    this.editingRecipient = null;
    this.editingRecipientBasisPoints = 0;
  }

  // Nested split management
  async openAddNestedSplitModal(node: SplitNode) {
    // Only allow adding nested splits to SplitXCH nodes
    if (!node.isSplitXCH) {
      this.showAlert('Error', 'You can only add nested splits to SplitXCH nodes, not to wallet addresses.');
      return;
    }

    this.selectedNode = node;
    this.newNestedSplit = { name: '', percentage: 0 };
    this.showAddNestedSplitModal = true;
  }

  addNestedSplit() {
    if (!this.tree || !this.selectedNode) return;

    // Double-check that we're adding to a SplitXCH node
    if (!this.selectedNode.isSplitXCH) {
      this.showAlert('Error', 'You can only add nested splits to SplitXCH nodes.');
      return;
    }

    if (!this.newNestedSplit.name || !this.newNestedSplit.percentage) {
      this.showAlert('Error', 'Please fill in all fields');
      return;
    }

    // Convert percentage to basis points
    const basisPoints = BasisPointsUtils.percentageToBasisPoints(
      this.newNestedSplit.percentage
    );

    try {
      this.splitTreeService.addNestedSplit(
        this.tree,
        this.selectedNode.id,
        this.newNestedSplit.name,
        basisPoints
      );
      this.showAddNestedSplitModal = false;
      this.newNestedSplit = { name: '', percentage: 0 };
    } catch (error) {
      this.showAlert('Error', (error as Error).message);
    }
  }

  removeNestedSplit(event: { parentNode: SplitNode; childNodeId: string }) {
    if (!this.tree) return;
    // The parentNode in the event is the node that contains the child to remove
    this.splitTreeService.removeNestedSplit(
      this.tree,
      event.parentNode.id,
      event.childNodeId
    );
  }

  // Export functionality
  exportMapping: SplitXCHMapping | null = null;

  async exportToSplitXCH() {
    if (!this.tree) return;

    const validation = this.splitTreeService.validateTree(this.tree);
    if (!validation.valid) {
      this.showAlert(
        'Validation Error',
        `Please fix errors before exporting:\n${validation.errors.join('\n')}`
      );
      return;
    }

    this.exportMapping = this.splitTreeService.exportToSplitXCH(this.tree);
    this.showExportModal = true;
    return this.exportMapping;
  }

  async copyToClipboard() {
    if (!this.exportMapping) return;

    const json = JSON.stringify(this.exportMapping, null, 2);
    try {
      await navigator.clipboard.writeText(json);
      this.showAlert('Success', 'Copied to clipboard!');
    } catch (error) {
      this.showAlert('Error', 'Failed to copy to clipboard');
    }
  }

  exportToJSON() {
    if (!this.tree) return;

    const json = this.splitTreeService.exportToJSON(this.tree);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'split-tree.json';
    link.click();
    URL.revokeObjectURL(url);
  }

  async importTree(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    const text = await file.text();

    try {
      this.splitTreeService.importTree(text);
      this.showAlert('Success', 'Tree imported successfully');
    } catch (error) {
      this.showAlert('Import Error', (error as Error).message);
    }
  }

  // Utility methods
  async showAlert(header: string, message: string) {
    const alert = await this.alertController.create({
      header,
      message,
      buttons: ['OK'],
    });
    await alert.present();
  }

  finalPercentagesArray: Array<{ address: string; percentage: number }> = [];

  getFinalPercentages() {
    if (!this.tree) {
      this.finalPercentagesArray = [];
      return this.finalPercentagesArray;
    }
    const map = this.splitTreeService.calculateFinalPercentages(this.tree);
    this.finalPercentagesArray = Array.from(map.entries()).map(([address, percentage]) => ({
      address,
      percentage,
    }));
    return this.finalPercentagesArray;
  }

  formatPercentage(value: number): string {
    return value.toFixed(2) + '%';
  }

  formatBasisPoints(basisPoints: number): string {
    return BasisPointsUtils.formatBasisPoints(basisPoints);
  }

  // Finalization
  async finalizeBlueprint() {
    if (!this.tree) return;

    // Validate tree first
    const validation = this.splitTreeService.validateTree(this.tree);
    if (!validation.valid) {
      this.showAlert(
        'Validation Error',
        `Please fix errors before finalizing:\n${validation.errors.join('\n')}`
      );
      return;
    }

    const loading = await this.loadingController.create({
      message: 'Finalizing blueprint and creating SplitXCH addresses...',
      duration: 0,
    });
    await loading.present();

    try {
      // Call finalization using the SplitXCH API
      const result = await this.splitTreeService.finalizeBlueprint(
        this.tree,
        async (recipients) => {
          console.log('Creating split via SplitXCH API with recipients:', recipients);
          
          try {
            // Call the actual SplitXCH API
            const splitAddress = await this.splitXCHApi.createSplitAsync(recipients);
            console.log('Split created successfully:', splitAddress);
            return splitAddress;
          } catch (error) {
            console.error('Failed to create split via SplitXCH API:', error);
            throw new Error(`Failed to create split: ${(error as Error).message}`);
          }
        }
      );

      await loading.dismiss();

      this.finalizationResult = result;
      
      if (result.success && result.finalizedTree) {
        // Update the tree with finalized addresses
        this.tree = result.finalizedTree;
        this.selectedNode = this.tree.root;
        this.showFinalizeModal = true;
      } else {
        this.showAlert(
          'Finalization Errors',
          `Some errors occurred:\n${result.errors.join('\n')}`
        );
      }
    } catch (error) {
      await loading.dismiss();
      this.showAlert('Error', `Finalization failed: ${(error as Error).message}`);
    }
  }

  hasPlaceholders(): boolean {
    if (!this.tree) return false;
    return this.splitTreeService.hasPlaceholders(this.tree);
  }

  isFinalized(): boolean {
    return this.tree?.metadata?.isFinalized || false;
  }

  getAddressTypeDisplay(recipient: Recipient): string {
    switch (recipient.addressType) {
      case AddressType.FIXED_WALLET:
        return 'Wallet';
      case AddressType.SPLITXCH_PLACEHOLDER:
        return 'Split (Pending)';
      case AddressType.SPLITXCH_REAL:
        return 'Split';
      default:
        return 'Unknown';
    }
  }

  isPlaceholderAddress(address: string): boolean {
    return address.startsWith('splitxch_temp_');
  }

  handleNodeDeleted(event: { nodeId: string; isRecipient: boolean }) {
    if (!this.tree) return;

    if (event.isRecipient) {
      // Delete recipient - need to find which node contains this recipient
      const findParentAndRemoveRecipient = (node: SplitNode): boolean => {
        if (node.recipients) {
          const recipient = node.recipients.find((r) => r.id === event.nodeId);
          if (recipient) {
            // Found the parent node, remove the recipient
            this.splitTreeService.removeRecipient(this.tree!, node.id, event.nodeId);
            // Clear selection if the deleted recipient was selected
            if (this.selectedNode && this.selectedNode.id === event.nodeId) {
              this.selectedNode = null;
            }
            return true;
          }
        }
        // Search in children
        if (node.children) {
          for (const child of node.children) {
            if (findParentAndRemoveRecipient(child)) return true;
          }
        }
        return false;
      };

      findParentAndRemoveRecipient(this.tree.root);
    } else {
      // Delete split node - need to find parent and remove child
      // Special case: if deleting the root, we can't do that
      if (this.tree.root.id === event.nodeId) {
        this.showAlert('Error', 'Cannot delete the root split node');
        return;
      }

      const findParentAndRemove = (parent: SplitNode): boolean => {
        if (parent.children) {
          const index = parent.children.findIndex((c) => c.id === event.nodeId);
          if (index !== -1) {
            // Found the parent, remove the child
            this.splitTreeService.removeNestedSplit(this.tree!, parent.id, event.nodeId);
            // Clear selection if the deleted node was selected
            if (this.selectedNode && this.selectedNode.id === event.nodeId) {
              this.selectedNode = null;
            }
            return true;
          }
          // Search recursively in children
          for (const child of parent.children) {
            if (findParentAndRemove(child)) return true;
          }
        }
        return false;
      };

      findParentAndRemove(this.tree.root);
    }

    // Force tree update to ensure diagram refreshes
    // Create a new tree reference to trigger change detection
    this.tree = { ...this.tree };
    if (this.tree.metadata) {
      this.tree.metadata.updatedAt = new Date();
    }
    this.splitTreeService.setCurrentTree(this.tree);
  }

  handleNodeRenamed(event: { nodeId: string; newName: string }) {
    if (!this.tree) return;

    const node = this.splitTreeService.findNodeById(this.tree, event.nodeId);
    if (node) {
      this.splitTreeService.updateSplitNode(this.tree, event.nodeId, { name: event.newName });
    } else {
      // Might be a recipient
      const findAndUpdateRecipient = (n: SplitNode): boolean => {
        if (n.recipients) {
          const recipient = n.recipients.find((r) => r.id === event.nodeId);
          if (recipient) {
            this.splitTreeService.updateRecipient(this.tree!, n.id, event.nodeId, {
              name: event.newName,
            });
            return true;
          }
        }
        if (n.children) {
          for (const child of n.children) {
            if (findAndUpdateRecipient(child)) return true;
          }
        }
        return false;
      };

      findAndUpdateRecipient(this.tree.root);
    }
  }

  /**
   * Check if a node is a SplitXCH node (can have children)
   * Recipients/wallets cannot have children
   */
  isSplitXCHNode(node: SplitNode): boolean {
    return node.isSplitXCH === true;
  }

  copyAddressToClipboard(address: string) {
    navigator.clipboard.writeText(address).then(() => {
      this.showAlert('Success', 'Address copied to clipboard!');
    }).catch(() => {
      this.showAlert('Error', 'Failed to copy address');
    });
  }

  getFinalizationAddresses(): Array<{ name: string; address: string }> {
    if (!this.finalizationResult || !this.tree) return [];
    
    const addresses: Array<{ name: string; address: string }> = [];
    
    // Add root address
    if (this.tree.root.splitAddress) {
      addresses.push({
        name: this.tree.root.name,
        address: this.tree.root.splitAddress
      });
    }
    
    // Collect all split node addresses
    const collectAddresses = (node: SplitNode): void => {
      if (node.children) {
        node.children.forEach(child => {
          if (child.isSplitXCH && child.splitAddress) {
            addresses.push({
              name: child.name,
              address: child.splitAddress
            });
            collectAddresses(child);
          }
        });
      }
    };
    
    collectAddresses(this.tree.root);
    return addresses;
  }

  downloadFinalizedTree() {
    if (!this.tree) return;
    
    const json = this.splitTreeService.exportToJSON(this.tree);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `split-tree-finalized-${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    this.showAlert('Success', 'Finalized tree downloaded!');
  }
}

