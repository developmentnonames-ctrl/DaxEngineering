import { assertCatalog, type ModuleManifest } from '@dax/contracts';
import { inventoryManifest } from '@dax/inventory-contract';
import { partiesManifest } from '@dax/parties-contract';

export const INSTALLED_MODULES: readonly ModuleManifest[] = assertCatalog([
  partiesManifest,
  inventoryManifest,
]);
