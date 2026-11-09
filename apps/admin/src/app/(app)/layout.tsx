import { CapabilityProvider } from '@dax/web-shell';
import {
  PRODUCT,
  requireCapabilities,
  requireReadyUser,
} from '../../lib/server';
import { AdminShell } from './admin-shell';

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const me = await requireReadyUser();
  const caps = await requireCapabilities();
  return (
    <CapabilityProvider value={caps}>
      <AdminShell
        product={PRODUCT}
        userName={me.user.name}
        menu={caps.menu.map(({ key, label, path }) => ({ key, label, path }))}
      >
        {children}
      </AdminShell>
    </CapabilityProvider>
  );
}
