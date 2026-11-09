import { canDo, PageHead, SectionCard } from '@dax/web-shell';
import { requirePermission } from '../../../../lib/server';
import { getCatalog } from '../_lib/data';
import {
  AddBrandForm,
  AddModelForm,
  BrandList,
  ModelList,
} from './catalog-editor';

export default async function CatalogPage() {
  const caps = await requirePermission('inventory.catalog.view');
  const { brands, machineModels } = await getCatalog();
  const canManage = canDo(caps, 'inventory.catalog.manage');
  const brandOptions = brands
    .filter((b) => b.active)
    .map((b) => ({ value: b.id, label: b.name }));

  return (
    <>
      <PageHead
        back={{ href: '/inventory/items', label: 'Items' }}
        eyebrow="Inventory"
        title="Brands and machine models"
        lede="Items pick their brand and the machines they fit from these lists. Turn an entry off instead of deleting it; items keep it."
      />
      <div className="dax-grid2">
        <SectionCard
          title="Brands"
          note={`${brands.length} ${brands.length === 1 ? 'brand' : 'brands'}`}
        >
          <div className="dax-stack" style={{ gap: 16 }}>
            {canManage ? <AddBrandForm /> : null}
            <BrandList brands={brands} canManage={canManage} />
          </div>
        </SectionCard>
        <SectionCard
          title="Machine models"
          note={`${machineModels.length} ${machineModels.length === 1 ? 'model' : 'models'}`}
        >
          <div className="dax-stack" style={{ gap: 16 }}>
            {canManage ? <AddModelForm brands={brandOptions} /> : null}
            <ModelList
              models={machineModels}
              brands={brandOptions}
              canManage={canManage}
            />
          </div>
        </SectionCard>
      </div>
    </>
  );
}
