'use client';

import {
  Alert,
  Button,
  Code,
  CopyButton,
  Group,
  PasswordInput,
  PinInput,
  SimpleGrid,
  Stack,
  Text,
} from '@mantine/core';
import { type FormEvent, useState } from 'react';
import QRCode from 'react-qr-code';
import { authClient, authErrorMessage } from './auth-client';

type Step =
  | { name: 'password' }
  | { name: 'scan'; uri: string; secret: string; backupCodes: string[] };

function secretFrom(uri: string): string {
  try {
    return new URL(uri).searchParams.get('secret') ?? '';
  } catch {
    return '';
  }
}

export function TwoFactorSetup({ afterPath = '/' }: { afterPath?: string }) {
  const [step, setStep] = useState<Step>({ name: 'password' });
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function start(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await authClient.twoFactor.enable({ password });
    setBusy(false);
    setPassword('');
    if (result.error || !result.data || !('totpURI' in result.data)) {
      return setError(authErrorMessage(result.error));
    }
    setStep({
      name: 'scan',
      uri: result.data.totpURI,
      secret: secretFrom(result.data.totpURI),
      backupCodes: result.data.backupCodes,
    });
  }

  async function confirm(event?: FormEvent) {
    event?.preventDefault();
    setBusy(true);
    setError(null);
    const result = await authClient.twoFactor.verifyTotp({ code });
    setBusy(false);
    if (result.error) {
      setCode('');
      return setError(authErrorMessage(result.error));
    }
    window.location.assign(afterPath);
  }

  if (step.name === 'password') {
    return (
      <form onSubmit={start}>
        <Stack>
          <Text size="sm">
            You need an authenticator app on your phone, such as Google
            Authenticator or Microsoft Authenticator. Confirm your password to
            begin.
          </Text>
          {error ? <Alert color="red">{error}</Alert> : null}
          <PasswordInput
            label="Password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.currentTarget.value)}
          />
          <Button type="submit" loading={busy}>
            Continue
          </Button>
        </Stack>
      </form>
    );
  }

  return (
    <form onSubmit={confirm}>
      <Stack>
        <Text size="sm">1. Scan this code with your authenticator app.</Text>
        <Group justify="center" p="sm" bg="white">
          <QRCode value={step.uri} size={180} />
        </Group>
        <Text size="xs" c="dimmed">
          Can't scan? Enter this key instead: <Code>{step.secret}</Code>
        </Text>
        <Text size="sm">
          2. Save these backup codes somewhere safe. Each works once if you lose
          your phone.
        </Text>
        <SimpleGrid cols={2} spacing={4}>
          {step.backupCodes.map((c) => (
            <Code key={c}>{c}</Code>
          ))}
        </SimpleGrid>
        <CopyButton value={step.backupCodes.join('\n')}>
          {({ copied, copy }) => (
            <Button variant="light" size="xs" onClick={copy}>
              {copied ? 'Copied' : 'Copy backup codes'}
            </Button>
          )}
        </CopyButton>
        <Text size="sm">3. Enter the 6-digit code the app shows.</Text>
        {error ? <Alert color="red">{error}</Alert> : null}
        <PinInput
          length={6}
          type="number"
          oneTimeCode
          value={code}
          onChange={setCode}
          onComplete={() => void confirm()}
          aria-label="Authenticator code"
        />
        <Button type="submit" loading={busy} disabled={code.length !== 6}>
          Turn on two-step sign-in
        </Button>
      </Stack>
    </form>
  );
}

export function SignOutButton() {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="default"
      loading={busy}
      onClick={async () => {
        setBusy(true);
        await authClient.signOut();
        window.location.assign('/login');
      }}
    >
      Sign out
    </Button>
  );
}
