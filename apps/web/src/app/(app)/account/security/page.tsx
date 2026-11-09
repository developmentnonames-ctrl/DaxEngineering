import { Anchor, Container, Paper, Stack, Text, Title } from '@mantine/core';
import { ChangePasswordForm, TwoFactorSetup } from '@dax/web-shell';
import { requireReadyUser } from '../../../../lib/server';

export default async function SecurityPage() {
  const me = await requireReadyUser();
  return (
    <Container size={480} py="xl">
      <Stack>
        <Anchor href="/" size="sm">
          Back
        </Anchor>
        <Title order={2}>Password and two-step sign-in</Title>
        <Paper withBorder p="lg">
          <Stack>
            <Title order={4}>Change password</Title>
            <ChangePasswordForm afterPath="/account/security" />
          </Stack>
        </Paper>
        <Paper withBorder p="lg">
          <Stack>
            <Title order={4}>Two-step sign-in</Title>
            {me.user.twoFactorEnabled ? (
              <Text size="sm">
                On. You enter a code from your authenticator app at every
                sign-in.
              </Text>
            ) : (
              <TwoFactorSetup afterPath="/account/security" />
            )}
          </Stack>
        </Paper>
      </Stack>
    </Container>
  );
}
