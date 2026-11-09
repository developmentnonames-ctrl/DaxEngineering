import type { Provider } from '@nestjs/common';
import { AttachmentAccessRegistry } from './access-registry';
import { FilesService, OBJECT_STORE } from './files.service';
import {
  type FilesOptions,
  type ObjectStore,
  S3ObjectStore,
} from './object-store';

export function filesProviders(
  options: FilesOptions | undefined,
  store?: ObjectStore,
): Provider[] {
  return [
    {
      provide: OBJECT_STORE,
      useValue: store ?? (options ? new S3ObjectStore(options) : null),
    },
    AttachmentAccessRegistry,
    FilesService,
  ];
}
