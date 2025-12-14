import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { SplitBuilderPage } from './split-builder.page';
import { SplitNodeComponent } from './components/split-node/split-node.component';
import { SplitDiagramComponent } from './components/split-diagram/split-diagram.component';

import { SplitBuilderPageRoutingModule } from './split-builder-routing.module';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    SplitBuilderPageRoutingModule,
  ],
  declarations: [SplitBuilderPage, SplitNodeComponent, SplitDiagramComponent],
})
export class SplitBuilderPageModule {}

