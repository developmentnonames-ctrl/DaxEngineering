import Link from 'next/link';
import { CapabilityProvider, canDo, DaxShell, Icon } from '@dax/web-shell';
import { requireCapabilities, requireReadyUser } from '../../lib/server';

const FALLBACK_ICONS: Record<string, string> = {
  'inventory.stock': 'boxes',
  'inventory.items': 'tag',
  'inventory.locations': 'grid',
  'inventory.catalog': 'layers',
  'inventory.receiving': 'truck',
  'inventory.issuing': 'send',
  'parties.customers': 'users',
  'parties.suppliers': 'building',
};

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const me = await requireReadyUser();
  const caps = await requireCapabilities();
  const canScan =
    canDo(caps, 'inventory.item.view') ||
    canDo(caps, 'inventory.location.view');
  const nav = [
    { key: 'home', label: 'Home', path: '/', icon: 'home' },
    ...(canScan
      ? [{ key: 'scan', label: 'Scan', path: '/scan', icon: 'scan' }]
      : []),
    ...caps.menu.map(({ key, label, path, icon }) => ({
      key,
      label,
      path,
      icon: icon ?? FALLBACK_ICONS[key] ?? 'grid',
    })),
  ];
  return (
    <CapabilityProvider value={caps}>
      <DaxShell
        appLabel="Stores"
        userName={me.user.name}
        userNote={me.user.isSuperAdmin ? 'Super admin' : 'Stores'}
        nav={nav}
        actions={
          canScan ? (
            <Link href="/scan" className="dax-cta">
              <Icon name="scan" size={20} />
              Scan
            </Link>
          ) : null
        }
      >
        {children}
      </DaxShell>
    </CapabilityProvider>
  );
}
