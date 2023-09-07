import { CUSTOM_ELEMENTS_SCHEMA, NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { PreviewPhotoPageRoutingModule } from './preview-photo-routing.module';

import { PreviewPhotoPage } from './preview-photo.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    PreviewPhotoPageRoutingModule
  ],
  declarations: [PreviewPhotoPage],
  // TODO: Try to add declearation for preview-photo as a component not a page
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class PreviewPhotoPageModule {}