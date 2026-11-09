import { Alert, Title } from '@mantine/core';
import { redirect } from 'next/navigation';
import { requireCapabilities } from '../../lib/server';

export default async function AdminHome() {
  const caps = await requireCapabilities();
  const first = caps.menu[0];
  if (first) redirect(first.path);
  return (
    <>
      <Title order={2}>Welcome</Title>
      <Alert color="gray">
        Your account has no admin screens yet. Ask a super admin to give one of
        your roles access.
      </Alert>
    </>
  );
}
