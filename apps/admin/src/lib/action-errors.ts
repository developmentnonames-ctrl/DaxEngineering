import 'server-only';
import { redirect } from 'next/navigation';
import type { z } from 'zod';
import { ApiError } from '@dax/web-data-access/server';
import type { ActionState } from './action-state';

const CODE_MESSAGES: Record<string, string> = {
  STALE: 'Someone else changed this. Reload to see their changes.',
  PERMISSION_DENIED: "You don't have permission to do that.",
};

function issueMessage(issue: z.core.$ZodIssue): string {
  switch (issue.code) {
    case 'too_small':
      return issue.minimum === 1
        ? 'Required'
        : `At least ${String(issue.minimum)}`;
    case 'too_big':
      return `At most ${String(issue.maximum)}`;
    case 'invalid_format':
      return issue.format === 'email' ? 'Enter a valid email' : issue.message;
    case 'custom':
      return issue.message;
    default:
      return 'Check this field';
  }
}

export function invalid(error: z.ZodError): ActionState {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.map(String).join('.') || 'form';
    fields[key] ??= issueMessage(issue);
  }
  return { ok: false, error: 'Check the highlighted fields.', fields };
}

export function failure(
  error: unknown,
  fallback: string,
  codeMessages: Record<string, string> = {},
): ActionState {
  if (!(error instanceof ApiError)) throw error;
  if (error.status === 401) redirect('/login');
  if (error.status >= 500) return { ok: false, error: fallback };
  const { code, message, fields } = error.body;
  const known = code ? (codeMessages[code] ?? CODE_MESSAGES[code]) : undefined;
  return {
    ok: false,
    error: known ?? message ?? fallback,
    fields: fields?.length
      ? Object.fromEntries(fields.map((f) => [f, 'Check this field']))
      : undefined,
  };
}
