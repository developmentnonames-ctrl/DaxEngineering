'use client';

import {
  Alert,
  Anchor,
  Button,
  PasswordInput,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { PASSWORD_MIN_LENGTH } from '@dax/platform-contract';
import { type FormEvent, useState } from 'react';
import { authClient, authErrorMessage } from './auth-client';

function passwordProblem(password: string, confirm: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH)
    return `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
  if (password !== confirm) return 'The two passwords do not match.';
  return null;
}

function NewPasswordFields({
  password,
  confirm,
  onPassword,
  onConfirm,
}: {
  password: string;
  confirm: string;
  onPassword: (v: string) => void;
  onConfirm: (v: string) => void;
}) {
  return (
    <>
      <PasswordInput
        label="New password"
        description={`At least ${PASSWORD_MIN_LENGTH} characters. A short sentence works well.`}
        autoComplete="new-password"
        required
        value={password}
        onChange={(e) => onPassword(e.currentTarget.value)}
      />
      <PasswordInput
        label="Repeat new password"
        autoComplete="new-password"
        required
        value={confirm}
        onChange={(e) => onConfirm(e.currentTarget.value)}
      />
    </>
  );
}

export function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await authClient.requestPasswordReset({
      email: email.trim(),
    });
    setBusy(false);
    if (result.error) {
      setError(authErrorMessage(result.error));
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <Stack>
        <Text size="sm">
          If that email belongs to an account, a reset link is on its way. It
          expires in 1 hour.
        </Text>
        <Anchor href="/login" size="sm">
          Back to sign in
        </Anchor>
      </Stack>
    );
  }

  return (
    <form onSubmit={submit}>
      <Stack>
        {error ? <Alert color="red">{error}</Alert> : null}
        <TextInput
          label="Email"
          type="email"
          autoComplete="email"
          autoFocus
          required
          value={email}
          onChange={(e) => setEmail(e.currentTarget.value)}
        />
        <Button type="submit" loading={busy}>
          Send reset link
        </Button>
        <Anchor href="/login" size="sm" ta="center">
          Back to sign in
        </Anchor>
      </Stack>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string | null }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!token) {
    return (
      <Stack>
        <Alert color="red">This link is incomplete. Request a new one.</Alert>
        <Anchor href="/forgot-password" size="sm">
          Request a new link
        </Anchor>
      </Stack>
    );
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const problem = passwordProblem(password, confirm);
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    const result = await authClient.resetPassword({
      newPassword: password,
      token: token as string,
    });
    setBusy(false);
    if (result.error) return setError(authErrorMessage(result.error));
    setDone(true);
  }

  if (done) {
    return (
      <Stack>
        <Text size="sm">Your password is set. Sign in with it now.</Text>
        <Button component="a" href="/login">
          Sign in
        </Button>
      </Stack>
    );
  }

  return (
    <form onSubmit={submit}>
      <Stack>
        {error ? <Alert color="red">{error}</Alert> : null}
        <NewPasswordFields
          password={password}
          confirm={confirm}
          onPassword={setPassword}
          onConfirm={setConfirm}
        />
        <Button type="submit" loading={busy}>
          Save password
        </Button>
      </Stack>
    </form>
  );
}

export function ChangePasswordForm({
  afterPath = '/',
}: {
  afterPath?: string;
}) {
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const problem = passwordProblem(password, confirm);
    if (problem) return setError(problem);
    if (password === current)
      return setError('Choose a password you have not used here before.');
    setBusy(true);
    setError(null);
    const result = await authClient.changePassword({
      currentPassword: current,
      newPassword: password,
      revokeOtherSessions: true,
    });
    setBusy(false);
    if (result.error) return setError(authErrorMessage(result.error));
    window.location.assign(afterPath);
  }

  return (
    <form onSubmit={submit}>
      <Stack>
        {error ? <Alert color="red">{error}</Alert> : null}
        <PasswordInput
          label="Current password"
          autoComplete="current-password"
          required
          value={current}
          onChange={(e) => setCurrent(e.currentTarget.value)}
        />
        <NewPasswordFields
          password={password}
          confirm={confirm}
          onPassword={setPassword}
          onConfirm={setConfirm}
        />
        <Button type="submit" loading={busy}>
          Change password
        </Button>
      </Stack>
    </form>
  );
}
