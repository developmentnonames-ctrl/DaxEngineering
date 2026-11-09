import { Badge, Group, Paper, Stack, Text, Title } from '@mantine/core';
import { ChangePasswordForm } from '@dax/web-shell';
import { requireReadyUser } from '../../../../lib/server';

export default async function SecurityPage() {
  const me = await requireReadyUser();
  const on = me.user.twoFactorEnabled;
  return (
    <Stack maw={480}>
      <Title order={2}>My security</Title>
      <Paper withBorder p="lg">
        <Stack>
          <Title order={4}>Change password</Title>
          <ChangePasswordForm afterPath="/account/security" />
        </Stack>
      </Paper>
      <Paper withBorder p="lg">
        <Stack>
          <Group justify="space-between">
            <Title order={4}>Two-step sign-in</Title>
            <Badge color={on ? 'green' : 'gray'}>{on ? 'On' : 'Off'}</Badge>
          </Group>
          <Text size="sm">
            {on
              ? 'You enter a code from your authenticator app each time you sign in.'
              : 'Your roles do not require a code from an authenticator app.'}
          </Text>
        </Stack>
      </Paper>
    </Stack>
  );
}
