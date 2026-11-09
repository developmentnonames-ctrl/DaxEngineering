import { canDo, PageHead } from '@dax/web-shell';
import { getCatalog } from '../../../lib/data';
import { requirePermission } from '../../../lib/server';
import { ModuleCard } from './module-card';

export default async function ModulesPage() {
  const caps = await requirePermission('core.modules.view');
  const { modules } = await getCatalog();
  const canManage = canDo(caps, 'core.modules.manage');
  const names = new Map(modules.map((m) => [m.key, m.name]));
  const nameOf = (key: string) => names.get(key) ?? key;

  return (
    <>
      <PageHead
        eyebrow="Admin · Settings"
        title="Modules"
        lede="A module that is off disappears from menus and its permissions stop working. Its data is kept. Modules that others depend on must stay on."
      />
      <div className="dax-grid2">
        {modules.map((m) => (
          <ModuleCard
            key={m.key}
            moduleKey={m.key}
            name={m.name}
            description={m.description}
            enabled={m.enabled}
            toggleable={m.toggleable && canManage}
            locked={!m.toggleable}
            dependsOn={m.dependsOn.map(nameOf)}
            requiredBy={modules
              .filter((other) => other.dependsOn.includes(m.key))
              .map((other) => other.name)}
          />
        ))}
      </div>
    </>
  );
}
