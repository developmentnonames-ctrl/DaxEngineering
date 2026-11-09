import { Anchor, Container, Group, Stack, Text, Title } from '@mantine/core';
import { SignOutButton } from '@dax/web-shell';
import { PRODUCT, requireReadyUser } from '../../lib/server';

export default async function HomePage() {
  const me = await requireReadyUser();
  return (
    <Container size="sm" py="xl">
      <Stack>
        <Group justify="space-between">
          <Title order={2}>{PRODUCT}</Title>
          <SignOutButton />
        </Group>
        <Text>Signed in as {me.user.name}.</Text>
        <Text c="dimmed" size="sm">
          Stores screens arrive in the next milestones.
        </Text>
        <Anchor href="/account/security">Password and two-step sign-in</Anchor>
      </Stack>
    </Container>
  );
}
