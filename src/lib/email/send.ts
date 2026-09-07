/**
 * A very small mail port.
 *
 * The digest does not care who delivers it, so the provider lives behind one
 * function. Resend is the default because it needs nothing but an API key and a
 * fetch call; swapping it means rewriting `deliver` and nothing else.
 *
 * With no API key configured this reports every send as skipped rather than
 * failing. That keeps development, preview and test runs from mailing real
 * people just because a cron happened to fire.
 */

export type OutgoingEmail = {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Surfaced as List-Unsubscribe so mail clients can offer one-click opt-out. */
  unsubscribeUrl?: string;
};

export type SendResult =
  | { status: 'sent'; id: string | null }
  | { status: 'skipped'; reason: string }
  | { status: 'failed'; error: string };

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

async function deliver(email: OutgoingEmail): Promise<SendResult> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
    'Content-Type': 'application/json',
  };

  const body: Record<string, unknown> = {
    from: process.env.EMAIL_FROM,
    to: [email.to],
    subject: email.subject,
    html: email.html,
    text: email.text,
  };

  // RFC 8058: let the mail client unsubscribe without opening the message.
  if (email.unsubscribeUrl) {
    body.headers = {
      'List-Unsubscribe': `<${email.unsubscribeUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    };
  }

  const response = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    return { status: 'failed', error: `${response.status} ${detail}`.trim() };
  }

  const data = (await response.json().catch(() => ({}))) as { id?: string };
  return { status: 'sent', id: data.id ?? null };
}

export async function sendEmail(email: OutgoingEmail): Promise<SendResult> {
  if (!isEmailConfigured()) {
    return { status: 'skipped', reason: 'RESEND_API_KEY or EMAIL_FROM is not configured' };
  }
  try {
    return await deliver(email);
  } catch (error) {
    return {
      status: 'failed',
      error: error instanceof Error ? error.message : 'Unknown mail transport failure',
    };
  }
}
