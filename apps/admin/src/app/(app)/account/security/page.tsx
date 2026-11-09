import { Paper, Stack, Text, Title } from '@mantine/core';
import { ChangePasswordForm } from '@dax/web-shell';

export default function SecurityPage() {
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
          <Title order={4}>Two-step sign-in</Title>
          <Text size="sm">
            On. Administrator accounts always need a code from the authenticator
            app.
          </Text>
        </Stack>
      </Paper>
    </Stack>
  );
}
