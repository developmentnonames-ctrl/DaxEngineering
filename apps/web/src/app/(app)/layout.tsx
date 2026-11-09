import { requireReadyUser } from '../../lib/server';

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireReadyUser();
  return children;
}
