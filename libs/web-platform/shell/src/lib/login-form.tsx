'use client';

import {
  Alert,
  Anchor,
  Button,
  PasswordInput,
  PinInput,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { type FormEvent, useState } from 'react';
import { authClient, authErrorMessage, safeNextPath } from './auth-client';

type Step = 'password' | 'totp' | 'backup';

export function LoginForm({ next }: { next?: string }) {
  const [step, setStep] = useState<Step>('password');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function finish() {
    window.location.assign(safeNextPath(next));
  }

  async function signIn(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const id = identifier.trim();
    const result = id.includes('@')
      ? await authClient.signIn.email({ email: id, password })
      : await authClient.signIn.username({ username: id, password });
    setBusy(false);
    if (result.error) {
      setError(authErrorMessage(result.error));
      return;
    }
    if ((result.data as { twoFactorRedirect?: boolean })?.twoFactorRedirect) {
      setPassword('');
      setStep('totp');
      return;
    }
    finish();
  }

  async function verify(event?: FormEvent) {
    event?.preventDefault();
    setBusy(true);
    setError(null);
    const result =
      step === 'totp'
        ? await authClient.twoFactor.verifyTotp({ code })
        : await authClient.twoFactor.verifyBackupCode({ code: code.trim() });
    setBusy(false);
    if (result.error) {
      setError(authErrorMessage(result.error));
      setCode('');
      return;
    }
    finish();
  }

  if (step !== 'password') {
    return (
      <form onSubmit={verify}>
        <Stack>
          <Text size="sm">
            {step === 'totp'
              ? 'Enter the 6-digit code from your authenticator app.'
              : 'Enter one of your backup codes.'}
          </Text>
          {error ? <Alert color="red">{error}</Alert> : null}
          {step === 'totp' ? (
            <PinInput
              length={6}
              type="number"
              oneTimeCode
              autoFocus
              value={code}
              onChange={setCode}
              onComplete={() => void verify()}
              aria-label="Authenticator code"
            />
          ) : (
            <TextInput
              label="Backup code"
              autoComplete="one-time-code"
              autoFocus
              value={code}
              onChange={(e) => setCode(e.currentTarget.value)}
              required
            />
          )}
          <Button type="submit" loading={busy} disabled={!code}>
            Verify
          </Button>
          <Anchor
            component="button"
            type="button"
            size="sm"
            onClick={() => {
              setCode('');
              setError(null);
              setStep(step === 'totp' ? 'backup' : 'totp');
            }}
          >
            {step === 'totp'
              ? 'Use a backup code instead'
              : 'Use the authenticator app instead'}
          </Anchor>
        </Stack>
      </form>
    );
  }

  return (
    <form onSubmit={signIn}>
      <Stack>
        {error ? <Alert color="red">{error}</Alert> : null}
        <TextInput
          label="Username or email"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          autoFocus
          required
          value={identifier}
          onChange={(e) => setIdentifier(e.currentTarget.value)}
        />
        <PasswordInput
          label="Password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.currentTarget.value)}
        />
        <Button type="submit" loading={busy}>
          Sign in
        </Button>
        <Anchor href="/forgot-password" size="sm" ta="center">
          Forgot your password?
        </Anchor>
      </Stack>
    </form>
  );
}
