import { Component, Input, Output, EventEmitter } from '@angular/core';
import { SplitNode, Recipient, BasisPointsUtils } from '../../../models/split-tree.models';

@Component({
  selector: 'app-split-node',
  templateUrl: './split-node.component.html',
  styleUrls: ['./split-node.component.scss'],
  standalone: false,
})
export class SplitNodeComponent {
  @Input() node!: SplitNode;
  @Input() selectedNode: SplitNode | null = null;
  @Input() depth: number = 0;

  @Output() nodeSelected = new EventEmitter<SplitNode>();
  @Output() addRecipient = new EventEmitter<SplitNode>();
  @Output() addNestedSplit = new EventEmitter<SplitNode>();
  @Output() removeRecipient = new EventEmitter<{ node: SplitNode; recipientId: string }>();
  @Output() removeNestedSplit = new EventEmitter<{ parentNode: SplitNode; childNodeId: string }>();
  @Output() editRecipient = new EventEmitter<{ node: SplitNode; recipient: Recipient }>();

  isSelected(): boolean {
    return this.selectedNode?.id === this.node.id;
  }

  selectNode() {
    this.nodeSelected.emit(this.node);
  }

  onAddRecipient() {
    this.addRecipient.emit(this.node);
  }

  onAddNestedSplit() {
    this.addNestedSplit.emit(this.node);
  }

  onRemoveRecipient(recipientId: string) {
    this.removeRecipient.emit({ node: this.node, recipientId });
  }

  onRemoveNestedSplit(childNodeId: string) {
    // Emit the parent node (this.node) and the child node ID to remove
    this.removeNestedSplit.emit({ parentNode: this.node, childNodeId });
  }

  onEditRecipient(recipient: Recipient) {
    this.editRecipient.emit({ node: this.node, recipient });
  }

  getTotalBasisPoints(): number {
    let total = 0;
    if (this.node.recipients) {
      total += this.node.recipients.reduce((sum, r) => sum + r.basisPoints, 0);
    }
    if (this.node.children) {
      total += this.node.children.reduce((sum, c) => sum + c.basisPoints, 0);
    }
    return total;
  }

  getTotalPercentage(): number {
    return BasisPointsUtils.basisPointsToPercentage(this.getTotalBasisPoints());
  }

  getIndentStyle(): { [key: string]: string } {
    return {
      'margin-left': `${this.depth * 24}px`,
    };
  }

  formatBasisPoints(basisPoints: number): string {
    return BasisPointsUtils.formatBasisPoints(basisPoints);
  }

  get BasisPointsUtils() {
    return BasisPointsUtils;
  }
}

