import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { SplitBuilderPage } from './split-builder.page';

const routes: Routes = [
  {
    path: '',
    component: SplitBuilderPage,
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class SplitBuilderPageRoutingModule {}

