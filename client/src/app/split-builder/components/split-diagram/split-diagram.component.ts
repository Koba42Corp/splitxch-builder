import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  OnChanges,
  SimpleChanges,
  ViewChild,
  ElementRef,
  AfterViewInit,
  ChangeDetectorRef,
  OnDestroy,
} from '@angular/core';
import * as go from 'gojs';
import { SplitTree, SplitNode, Recipient, BasisPointsUtils, AddressType } from '../../../models/split-tree.models';
import { SplitTreeService } from '../../../services/split-tree.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-split-diagram',
  templateUrl: './split-diagram.component.html',
  styleUrls: ['./split-diagram.component.scss'],
  standalone: false,
})
export class SplitDiagramComponent implements OnInit, OnChanges, AfterViewInit, OnDestroy {
  @Input() tree: SplitTree | null = null;
  @Input() selectedNode: SplitNode | null = null;
  @Output() nodeSelected = new EventEmitter<SplitNode>();
  @Output() nodeDoubleClicked = new EventEmitter<SplitNode>();
  @Output() addRecipient = new EventEmitter<SplitNode>();
  @Output() addNestedSplit = new EventEmitter<SplitNode>();
  @Output() nodeDeleted = new EventEmitter<{ nodeId: string; isRecipient: boolean }>();
  @Output() nodeRenamed = new EventEmitter<{ nodeId: string; newName: string }>();
  @Output() removeRecipient = new EventEmitter<{ node: SplitNode; recipientId: string }>();
  @Output() removeNestedSplit = new EventEmitter<{ parentNode: SplitNode; childNodeId: string }>();
  @Output() editRecipient = new EventEmitter<{ node: SplitNode; recipient: Recipient }>();
  @Output() createNewTree = new EventEmitter<void>();
  @Output() exportToJSON = new EventEmitter<void>();
  @Output() exportToSplitXCH = new EventEmitter<void>();
  @Output() finalizeBlueprint = new EventEmitter<void>();
  @Input() showFinalizeButton: boolean = false;

  @ViewChild('diagramDiv', { static: false }) diagramDiv?: ElementRef<HTMLDivElement>;
  @ViewChild('deleteBox', { static: false }) deleteBox?: ElementRef<HTMLDivElement>;

  private diagram: go.Diagram | null = null;
  private model: go.GraphLinksModel | null = null;
  private treeSubscription?: Subscription;
  isDraggingOverDelete = false;

  constructor(
    private splitTreeService: SplitTreeService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    // Subscribe to tree changes directly from the service
    // This ensures we catch all updates even if the object reference doesn't change
    this.treeSubscription = this.splitTreeService.currentTree$.subscribe((tree) => {
      if (tree) {
        this.tree = tree;
        // Update diagram if it's already initialized, otherwise it will be updated in ngAfterViewInit
        // Use a small delay to ensure the diagram is ready
        setTimeout(() => {
          if (this.diagram && this.model) {
            this.updateDiagram();
          }
        }, 50);
      }
    });
  }

  ngAfterViewInit() {
    this.initDiagram();
    if (this.tree) {
      // Small delay to ensure diagram is fully initialized
      setTimeout(() => {
        this.updateDiagram();
      }, 100);
    }
  }

  ngOnDestroy() {
    if (this.treeSubscription) {
      this.treeSubscription.unsubscribe();
    }
  }

  ngOnChanges(changes: SimpleChanges) {
    // Also handle @Input changes as a fallback
    if (this.diagram && changes['tree']) {
      const previousTree = changes['tree'].previousValue;
      const currentTree = changes['tree'].currentValue;
      // Only update if tree actually changed
      if (previousTree !== currentTree) {
        setTimeout(() => {
          this.updateDiagram();
        }, 0);
      }
    }
    if (this.diagram && changes['selectedNode']) {
      setTimeout(() => {
        this.highlightSelectedNode();
      }, 0);
    }
  }

  private initDiagram() {
    if (!this.diagramDiv) return;

    const $ = go.GraphObject.make;

    this.diagram = $(go.Diagram, this.diagramDiv.nativeElement, {
      initialAutoScale: go.Diagram.Uniform,
      contentAlignment: go.Spot.Center,
      layout: $(go.TreeLayout, {
        angle: 0, // Horizontal layout (left to right)
        layerSpacing: 200, // Spacing between layers (horizontal distance)
        nodeSpacing: 80, // Spacing between siblings (vertical distance)
        alignment: go.TreeAlignment.CenterChildren,
        arrangement: go.TreeArrangement.Horizontal,
        sorting: go.TreeSorting.Forwards,
        compaction: go.TreeCompaction.None,
      }),
      'undoManager.isEnabled': true,
      allowDrop: true,
      'toolManager.mouseWheelBehavior': go.ToolManager.WheelZoom,
      padding: new go.Margin(40, 40, 100, 40), // Extra padding at bottom for delete box
      'draggingTool.dragsTree': true,
      'commandHandler.copiesTree': true,
      'commandHandler.copiesParentKey': false,
      'commandHandler.deletesTree': true,
    });

    // Setup drag-over delete box
    this.setupDeleteBox();

    // Define node template
    this.diagram.nodeTemplate = $(
      go.Node,
      'Auto',
      {
        defaultAlignment: go.Spot.Center,
        selectionObjectName: 'SHAPE',
        // Ensure content is centered for circular nodes
        desiredSize: new go.Size(NaN, NaN),
        selectionChanged: (thisPart: go.Part) => {
          if (thisPart instanceof go.Node && thisPart.isSelected) {
            const data = thisPart.data;
            if (data && data.nodeId) {
              this.onNodeSelected(data.nodeId);
            }
          }
        },
        doubleClick: (e: go.InputEvent, obj: go.GraphObject) => {
          const node = obj.part;
          if (node instanceof go.Node) {
            const data = node.data;
            if (data && data.nodeId) {
              this.onNodeDoubleClicked(data.nodeId);
            }
          }
        },
        contextMenu: $(
          go.Adornment,
          'Vertical',
          $(
            go.Panel,
            'Horizontal',
            // Only show context menu items for SplitXCH nodes (not recipients/wallets)
            $(
              'ContextMenuButton',
              $(go.TextBlock, 'Add Wallet'),
              {
                click: (e: go.InputEvent, obj: go.GraphObject) => {
                  const adornedPart = (obj.part as go.Adornment)?.adornedPart;
                  if (adornedPart instanceof go.Node) {
                    const data = adornedPart.data;
                    // Only allow adding recipients to SplitXCH nodes
                    if (data && data.nodeId && !data.isRecipient) {
                      this.onAddRecipient(data.nodeId);
                    }
                  }
                },
              },
              new go.Binding('visible', '', function(data) {
                // Only show for SplitXCH nodes (not recipients)
                return !data.isRecipient;
              })
            ),
            $(
              'ContextMenuButton',
              $(go.TextBlock, 'Add Nested Split'),
              {
                click: (e: go.InputEvent, obj: go.GraphObject) => {
                  const adornedPart = (obj.part as go.Adornment)?.adornedPart;
                  if (adornedPart instanceof go.Node) {
                    const data = adornedPart.data;
                    // Only allow adding nested splits to SplitXCH nodes
                    if (data && data.nodeId && !data.isRecipient) {
                      this.onAddNestedSplit(data.nodeId);
                    }
                  }
                },
              },
              new go.Binding('visible', '', function(data) {
                // Only show for SplitXCH nodes (not recipients)
                return !data.isRecipient;
              })
            )
          )
        ),
      },
      $(
        go.Shape,
        {
          name: 'SHAPE',
          figure: 'RoundedRectangle',
          fill: '#ffffff',
          stroke: '#667eea',
          strokeWidth: 2,
        },
        new go.Binding('figure', 'isRecipient', (isRecipient) =>
          isRecipient ? 'Circle' : 'RoundedRectangle'
        ),
        new go.Binding('fill', '', function(data, obj) {
          const isSelected = data?.isSelected;
          const isRecipient = data?.isRecipient;
          if (isRecipient) {
            return '#f0f4ff';
          }
          return isSelected ? '#f0f4ff' : '#ffffff';
        }),
        new go.Binding('stroke', '', function(data, obj) {
          // Red border for recipients with empty addresses
          if (data?.isRecipient && data?.hasEmptyAddress) {
            return '#f5576c'; // Red color
          }
          // Highlight selected nodes
          if (data?.isSelected) {
            return '#667eea'; // Blue color
          }
          return '#667eea'; // Default blue
        }),
        new go.Binding('strokeWidth', '', function(data) {
          // Thicker border for empty addresses or selected nodes
          if ((data?.isRecipient && data?.hasEmptyAddress) || data?.isSelected) {
            return 3;
          }
          return 2;
        }),
        // For circular recipient nodes, ensure square dimensions for perfect circles
        new go.Binding('width', 'isRecipient', (isRecipient) =>
          isRecipient ? 140 : NaN
        ),
        new go.Binding('height', 'isRecipient', (isRecipient) =>
          isRecipient ? 140 : NaN
        ),
        new go.Binding('minSize', 'isRecipient', (isRecipient) =>
          isRecipient ? new go.Size(140, 140) : new go.Size(180, 100)
        ),
        new go.Binding('maxSize', 'isRecipient', (isRecipient) =>
          isRecipient ? new go.Size(140, 140) : new go.Size(220, 130)
        )
      ),
      $(
        go.Panel,
        'Vertical',
        {
          defaultAlignment: go.Spot.Center,
          alignment: go.Spot.Center,
          margin: 12,
          alignmentFocus: go.Spot.Center,
        },
        $(
          go.TextBlock,
          {
            font: 'bold 14px sans-serif',
            textAlign: 'center',
            alignment: go.Spot.Center,
            wrap: go.TextBlock.WrapFit,
            maxLines: 2,
            editable: true, // Make name editable like flow builder
            stroke: '#000000',
          },
          new go.Binding('text', 'name').makeTwoWay(),
          {
            textEdited: (tb: go.TextBlock, oldStr: string, newStr: string) => {
              if (tb.part && tb.part.data) {
                const data = tb.part.data;
                if (data && data.nodeId) {
                  this.nodeRenamed.emit({ nodeId: data.nodeId, newName: newStr });
                }
              }
              return true;
            },
          }
        ),
        $(
          go.TextBlock,
          {
            font: '12px sans-serif',
            textAlign: 'center',
            alignment: go.Spot.Center,
            margin: new go.Margin(4, 0, 0, 0),
            stroke: '#000000',
            editable: false, // Basis points not directly editable
          },
          new go.Binding('text', 'basisPoints', (bp) =>
            BasisPointsUtils.formatBasisPoints(bp)
          )
        ),
        $(
          go.TextBlock,
          {
            font: '10px sans-serif',
            textAlign: 'center',
            alignment: go.Spot.Center,
            margin: new go.Margin(2, 0, 0, 0),
            stroke: '#666666',
          },
          new go.Binding('text', 'recipientCount', (count) =>
            count > 0 ? `${count} recipient${count > 1 ? 's' : ''}` : 'Empty split'
          )
        ),
        // Show split address if finalized
        $(
          go.TextBlock,
          {
            font: '9px monospace',
            textAlign: 'center',
            alignment: go.Spot.Center,
            margin: new go.Margin(4, 0, 0, 0),
            stroke: '#667eea',
            maxLines: 1,
            editable: false,
            visible: false, // Hidden by default, shown via binding
          },
          new go.Binding('text', 'splitAddress', (addr) => {
            if (!addr) return '';
            // Show shortened address: first 8 chars + ... + last 6 chars
            if (addr.length > 20) {
              return addr.substring(0, 8) + '...' + addr.substring(addr.length - 6);
            }
            return addr;
          }),
          new go.Binding('visible', 'splitAddress', (addr) => !!addr && addr.startsWith('xch1'))
        )
      ),
      // Add "+" button for adding children (only on SplitXCH nodes, not wallets/recipients)
      $(
        'Button',
        {
          alignment: go.Spot.Bottom,
          alignmentFocus: go.Spot.Center,
          click: (e: go.InputEvent, obj: go.GraphObject) => {
            const node = obj.part;
            if (node instanceof go.Node) {
              const data = node.data;
              // Only allow adding to SplitXCH nodes, not recipients/wallets
              if (data && data.nodeId && !data.isRecipient) {
                this.onAddRecipient(data.nodeId);
              }
            }
          },
        },
        $(go.Shape, 'PlusLine', {
          width: 16,
          height: 16,
          stroke: '#667eea',
          strokeWidth: 3,
          background: '#ffffff',
          fill: '#ffffff',
        }),
        new go.Binding('visible', '', function(data) {
          // Only show "+" button on SplitXCH nodes, not on recipients/wallets
          return !data.isRecipient;
        })
      )
    );

    // Define link template - cleaner style
    this.diagram.linkTemplate = $(
      go.Link,
      {
        routing: go.Routing.Orthogonal,
        corner: 8,
        selectable: false,
        fromEndSegmentLength: 20,
        toEndSegmentLength: 20,
      },
      $(go.Shape, {
        stroke: '#86868b',
        strokeWidth: 2,
      })
    );

    // Initialize model
    this.model = $(go.GraphLinksModel, {
      linkKeyProperty: 'key',
      nodeKeyProperty: 'key',
    });
    this.diagram.model = this.model;
  }

  private updateDiagram() {
    if (!this.diagram || !this.model || !this.tree) {
      console.log('Update diagram skipped:', {
        hasDiagram: !!this.diagram,
        hasModel: !!this.model,
        hasTree: !!this.tree,
      });
      return;
    }

    try {
      // Start a transaction for better performance
      this.diagram.startTransaction('Update Diagram');

      const nodeDataArray: go.ObjectData[] = [];
      const linkDataArray: go.ObjectData[] = [];

      let nodeKeyCounter = 0;
      let linkKeyCounter = 0;

      const traverseNode = (node: SplitNode, parentKey?: number) => {
        const key = nodeKeyCounter++;
        const recipientCount =
          (node.recipients?.length || 0) + (node.children?.length || 0);

        // Add the split node itself
        nodeDataArray.push({
          key,
          nodeId: node.id,
          name: node.name,
          basisPoints: node.basisPoints,
          recipientCount,
          isSelected: this.selectedNode?.id === node.id,
          isRecipient: false,
          isSplitXCH: node.isSplitXCH || false,
          splitAddress: node.splitAddress,
        });

        if (parentKey !== undefined) {
          linkDataArray.push({
            key: linkKeyCounter++,
            from: parentKey,
            to: key,
          });
        }

        // Process children first (these are nested splits)
        if (node.children && node.children.length > 0) {
          node.children.forEach((child) => {
            traverseNode(child, key);
          });
        }

        // Process recipients as leaf nodes (fixed wallets or SplitXCH references)
        if (node.recipients && node.recipients.length > 0) {
          node.recipients.forEach((recipient) => {
            const recipientKey = nodeKeyCounter++;
            const address = recipient.address?.trim() || '';
            const isEmptyAddress = recipient.addressType === AddressType.FIXED_WALLET && 
                                  (address === '' || address === 'xch1...' || address === 'xch1');
            
            nodeDataArray.push({
              key: recipientKey,
              nodeId: recipient.id,
              name: recipient.name,
              basisPoints: recipient.basisPoints,
              recipientCount: 0,
              isRecipient: true,
              address: recipient.address,
              addressType: recipient.addressType,
              isSelected: false,
              hasEmptyAddress: isEmptyAddress,
            });

            linkDataArray.push({
              key: linkKeyCounter++,
              from: key,
              to: recipientKey,
            });
          });
        }
      };

      traverseNode(this.tree.root);

      // Update model data - replace arrays completely to ensure deleted nodes are removed
      // Using model.setDataProperty to ensure proper change detection
      this.model.startTransaction('Update Diagram');
      this.model.nodeDataArray = nodeDataArray;
      this.model.linkDataArray = linkDataArray;
      this.model.commitTransaction('Update Diagram');

      // Commit the diagram transaction
      this.diagram.commitTransaction('Update Diagram');
      
      // Force layout update to ensure diagram refreshes
      this.diagram.layout.invalidateLayout();

      // Highlight selected node after a brief delay
      setTimeout(() => {
        this.highlightSelectedNode();
      }, 50);
    } catch (error) {
      console.error('Error updating diagram:', error);
      if (this.diagram) {
        this.diagram.rollbackTransaction();
      }
    }
  }

  private findNodeByKey(key: number): go.ObjectData | null {
    if (!this.model) return null;
    const nodeData = this.model.findNodeDataForKey(key);
    return nodeData as go.ObjectData;
  }

  private highlightSelectedNode() {
    if (!this.diagram || !this.selectedNode) return;

    this.diagram.clearSelection();

    if (this.model) {
      const nodeData = this.model.nodeDataArray.find(
        (nd: any) => nd.nodeId === this.selectedNode?.id
      );
      if (nodeData) {
        const node = this.diagram.findPartForData(nodeData);
        if (node) {
          this.diagram.select(node);
          this.diagram.centerRect(node.actualBounds);
        }
      }
    }
  }

  private onNodeSelected(nodeId: string) {
    if (!this.tree) return;
    // Find the node in the tree
    const node = this.findNodeById(this.tree.root, nodeId);
    if (node) {
      this.nodeSelected.emit(node);
    }
  }

  private onNodeDoubleClicked(nodeId: string) {
    if (!this.tree) return;
    const node = this.findNodeById(this.tree.root, nodeId);
    if (node) {
      this.nodeDoubleClicked.emit(node);
    }
  }

  private onAddRecipient(nodeId: string) {
    if (!this.tree) return;
    const node = this.findNodeById(this.tree.root, nodeId);
    if (node) {
      this.addRecipient.emit(node);
    }
  }

  private onAddNestedSplit(nodeId: string) {
    if (!this.tree) return;
    const node = this.findNodeById(this.tree.root, nodeId);
    if (node) {
      this.addNestedSplit.emit(node);
    }
  }

  private onNodeRenamed(nodeId: string, newName: string) {
    this.nodeRenamed.emit({ nodeId, newName });
  }

  private setupDeleteBox() {
    if (!this.deleteBox || !this.diagram) return;

    // Setup drop detection for deletion
    this.diagram.addDiagramListener('ExternalObjectsDropped', (e: go.DiagramEvent) => {
      const diagram = e.diagram;
      const parts = diagram.selection;
      
      // Check if dropped over delete box area (bottom 100px of diagram)
      const viewPoint = diagram.lastInput.viewPoint;
      const div = diagram.div as HTMLDivElement;
      if (!div) return;
      const diagramRect = div.getBoundingClientRect();
      
      const pointInDiagram = new go.Point(
        viewPoint.x - diagramRect.left,
        viewPoint.y - diagramRect.top
      );
      
      // Check if point is over delete box area (bottom of diagram)
      if (pointInDiagram.y > diagramRect.height - 100) {
        // Delete selected parts
        parts.each((part: go.Part) => {
          if (part instanceof go.Node && part.data) {
            const data = part.data;
            if (data && data.nodeId) {
              this.nodeDeleted.emit({
                nodeId: data.nodeId,
                isRecipient: data.isRecipient || false,
              });
            }
          }
        });
      }
      
      this.isDraggingOverDelete = false;
      this.cdr.detectChanges();
    });
  }

  private findNodeById(node: SplitNode, nodeId: string): SplitNode | null {
    if (node.id === nodeId) return node;
    if (node.children) {
      for (const child of node.children) {
        const found = this.findNodeById(child, nodeId);
        if (found) return found;
      }
    }
    // Also check recipients (they have IDs but aren't SplitNodes)
    if (node.recipients) {
      const recipient = node.recipients.find((r) => r.id === nodeId);
      if (recipient) return node; // Return parent node for recipients
    }
    return null;
  }

  public zoomToFit() {
    if (this.diagram) {
      this.diagram.commandHandler.zoomToFit();
    }
  }

  public resetZoom() {
    if (this.diagram) {
      this.diagram.commandHandler.resetZoom();
    }
  }

  // Helper methods for sidebar
  formatBasisPoints(basisPoints: number): string {
    return BasisPointsUtils.formatBasisPoints(basisPoints);
  }

  isSplitXCHNode(node: SplitNode): boolean {
    return node.isSplitXCH === true;
  }

  isPlaceholderAddress(address: string): boolean {
    return address.startsWith('splitxch_temp_');
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

  onSelectNode(node: SplitNode) {
    this.nodeSelected.emit(node);
  }

  onEditRecipient(node: SplitNode, recipient: Recipient) {
    this.editRecipient.emit({ node, recipient });
  }

  onRemoveRecipient(node: SplitNode, recipientId: string) {
    this.removeRecipient.emit({ node, recipientId });
  }

  onRemoveNestedSplit(parentNode: SplitNode, childNodeId: string) {
    this.removeNestedSplit.emit({ parentNode, childNodeId });
  }
}

