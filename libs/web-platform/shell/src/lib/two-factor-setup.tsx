'use client';

import {
  Alert,
  Button,
  Code,
  CopyButton,
  Group,
  PasswordInput,
  PinInput,
  Stack,
  Text,
} from '@mantine/core';
import { type FormEvent, type ReactNode, useState } from 'react';
import QRCode from 'react-qr-code';
import { authClient, authErrorMessage } from './auth-client';
import { clearOfflineData } from './pwa';

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

function StepHeading({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="dax-2fa-step">
      <span className="dax-2fa-num">{n}</span>
      <div>
        <div className="dax-2fa-title">{title}</div>
        <Text size="xs" c="dimmed">
          {children}
        </Text>
      </div>
    </div>
  );
}

function downloadCodes(codes: string[]) {
  const text = `DAX Engineering backup codes\nEach code works once.\n\n${codes.join('\n')}\n`;
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'dax-backup-codes.txt';
  link.click();
  URL.revokeObjectURL(url);
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

  async function confirm(event?: FormEvent, typed?: string) {
    event?.preventDefault();
    setBusy(true);
    setError(null);
    const result = await authClient.twoFactor.verifyTotp({
      code: typed ?? code,
    });
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
    <form onSubmit={confirm} className="dax-2fa">
      <div className="dax-2fa-cols">
        <section className="dax-2fa-panel">
          <StepHeading n={1} title="Scan the QR code">
            Open your authenticator app and add a new account.
          </StepHeading>
          <div className="dax-2fa-qr">
            <QRCode value={step.uri} size={164} />
          </div>
          <Text size="xs" c="dimmed" ta="center">
            Can't scan? Enter this key instead
          </Text>
          <Group gap={6} wrap="nowrap">
            <Code className="dax-2fa-key">{step.secret}</Code>
            <CopyButton value={step.secret}>
              {({ copied, copy }) => (
                <Button variant="light" size="compact-sm" onClick={copy}>
                  {copied ? 'Copied' : 'Copy'}
                </Button>
              )}
            </CopyButton>
          </Group>
        </section>

        <section className="dax-2fa-panel">
          <StepHeading n={2} title="Save your backup codes">
            Each code works once if you lose your phone. Keep them somewhere
            safe.
          </StepHeading>
          <ol className="dax-2fa-codes">
            {step.backupCodes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ol>
          <Group gap="xs" grow>
            <CopyButton value={step.backupCodes.join('\n')}>
              {({ copied, copy }) => (
                <Button variant="light" size="sm" onClick={copy}>
                  {copied ? 'Copied' : 'Copy codes'}
                </Button>
              )}
            </CopyButton>
            <Button
              variant="default"
              size="sm"
              onClick={() => downloadCodes(step.backupCodes)}
            >
              Download
            </Button>
          </Group>
        </section>
      </div>

      <section className="dax-2fa-confirm">
        <StepHeading n={3} title="Enter the 6-digit code">
          Type the code your app shows now to finish.
        </StepHeading>
        {error ? <Alert color="red">{error}</Alert> : null}
        <div className="dax-2fa-confirm-row">
          <div className="dax-2fa-pin">
            <PinInput
              length={6}
              type="number"
              oneTimeCode
              value={code}
              onChange={setCode}
              onComplete={(value) => void confirm(undefined, value)}
              aria-label="Authenticator code"
            />
          </div>
          <Button
            type="submit"
            size="md"
            loading={busy}
            disabled={code.length !== 6}
          >
            Turn on two-step sign-in
          </Button>
        </div>
      </section>
    </form>
  );
}

export function SignOutButton({ fullWidth = false }: { fullWidth?: boolean }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="default"
      fullWidth={fullWidth}
      loading={busy}
      onClick={async () => {
        setBusy(true);
        await authClient.signOut();
        await clearOfflineData();
        window.location.assign('/login');
      }}
    >
      Sign out
    </Button>
  );
}
