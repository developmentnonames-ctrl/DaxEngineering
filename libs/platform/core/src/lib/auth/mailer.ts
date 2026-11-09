export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export class MailError extends Error {
  constructor(
    readonly status: number,
    readonly reason: string,
  ) {
    super(`Resend responded ${status}: ${reason}`);
  }
}

export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

type FetchFn = typeof fetch;

export class ResendMailer implements Mailer {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly fetchFn: FetchFn = fetch,
  ) {}

  async send(message: MailMessage): Promise<void> {
    const res = await this.fetchFn('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: this.from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        html: message.html,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as {
        message?: unknown;
      } | null;
      const reason =
        typeof body?.message === 'string'
          ? body.message.slice(0, 300)
          : 'unknown error';
      throw new MailError(res.status, reason);
    }
  }
}

export class LogMailer implements Mailer {
  constructor(
    private readonly log: (fields: object, message: string) => void,
  ) {}

  async send(message: MailMessage): Promise<void> {
    this.log(
      { subject: message.subject, body: message.text },
      'Email not sent (no RESEND_API_KEY); development copy',
    );
  }
}

export type PasswordLinkKind = 'reset' | 'invite';

const COPY: Record<
  PasswordLinkKind,
  { subject: string; intro: string; action: string }
> = {
  reset: {
    subject: 'Reset your DAX password',
    intro: 'Someone asked to reset the password for your DAX account.',
    action: 'Choose a new password',
  },
  invite: {
    subject: 'Your DAX account is ready',
    intro: 'An administrator created a DAX account for you.',
    action: 'Set your password',
  },
};

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ] as string,
  );
}

export function passwordLinkEmail(
  kind: PasswordLinkKind,
  to: { email: string; name: string },
  link: string,
  validFor: string,
): MailMessage {
  const copy = COPY[kind];
  const ignore =
    kind === 'reset'
      ? 'If you did not ask for this, ignore this email; your password stays the same.'
      : 'If you were not expecting this, ignore this email.';
  const text = [
    `Hello ${to.name},`,
    '',
    copy.intro,
    `${copy.action}: ${link}`,
    '',
    `The link works once and expires in ${validFor}.`,
    ignore,
  ].join('\n');
  const html = `<p>Hello ${escapeHtml(to.name)},</p>
<p>${copy.intro}</p>
<p><a href="${escapeHtml(link)}">${copy.action}</a></p>
<p>The link works once and expires in ${validFor}.<br>${ignore}</p>`;
  return { to: to.email, subject: copy.subject, text, html };
}
