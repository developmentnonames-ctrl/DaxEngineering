import { Anchor, Container, Group, Stack, Text } from '@mantine/core';
import { SignOutButton } from '@dax/web-shell';
import { PRODUCT, requireReadyUser } from '../../lib/server';

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const me = await requireReadyUser();
  return (
    <Container size="lg" py="md">
      <Stack gap="lg">
        <Group justify="space-between">
          <Group gap="lg">
            <Text fw={700}>{PRODUCT}</Text>
            <Anchor href="/users">Users</Anchor>
            <Anchor href="/account/security">My security</Anchor>
          </Group>
          <Group gap="sm">
            <Text size="sm" c="dimmed">
              {me.user.name}
            </Text>
            <SignOutButton />
          </Group>
        </Group>
        {children}
      </Stack>
    </Container>
  );
}
