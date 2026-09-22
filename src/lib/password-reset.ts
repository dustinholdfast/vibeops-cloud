import { ProjectError } from './project-validation';

export const PASSWORD_RESET_META_KEY = 'noxenPasswordReset';
export const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;
export const PASSWORD_RESET_TOKEN_BYTES = 32;

export type PasswordResetMetadata = {
  tokenHash: string;
  expiresAt: number;
  requestedByUserId: string;
  requestedAt: number;
};

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Web Crypto only, so this behaves the same on Node and on Workers. */
export function randomPasswordResetToken(): string {
  const bytes = new Uint8Array(PASSWORD_RESET_TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  return toHex(bytes);
}

export async function hashPasswordResetToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return toHex(new Uint8Array(digest));
}

export function timingSafeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let out = 0;
  for (let i = 0; i < left.length; i++) {
    out |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return out === 0;
}

export function isPasswordResetTokenShape(token: string): boolean {
  return new RegExp(`^[0-9a-f]{${PASSWORD_RESET_TOKEN_BYTES * 2}}$`).test(token);
}

export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at <= 0) return '***';
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const visible = local.slice(0, 1);
  return `${visible}***@${domain}`;
}

export function validateNewPassword(value: unknown): string {
  if (typeof value !== 'string' || value.length < MIN_PASSWORD_LENGTH) {
    throw new ProjectError(
      400,
      'VALIDATION',
      `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`
    );
  }
  if (value.length > MAX_PASSWORD_LENGTH) {
    throw new ProjectError(
      400,
      'VALIDATION',
      `Password must be at most ${MAX_PASSWORD_LENGTH} characters.`
    );
  }
  if (!value.trim()) {
    throw new ProjectError(400, 'VALIDATION', 'Password cannot be only whitespace.');
  }
  return value;
}

export function passwordResetUrl(appUrl: string, userId: string, token: string): string {
  const url = new URL('/reset-password', appUrl.replace(/\/$/, ''));
  url.searchParams.set('user', userId);
  url.searchParams.set('token', token);
  return url.toString();
}

export function parsePasswordResetMetadata(value: unknown): PasswordResetMetadata | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.tokenHash !== 'string' || record.tokenHash.length === 0) return null;
  if (typeof record.expiresAt !== 'number' || !Number.isFinite(record.expiresAt)) return null;
  if (typeof record.requestedByUserId !== 'string') return null;
  if (typeof record.requestedAt !== 'number' || !Number.isFinite(record.requestedAt)) return null;
  return {
    tokenHash: record.tokenHash,
    expiresAt: record.expiresAt,
    requestedByUserId: record.requestedByUserId,
    requestedAt: record.requestedAt,
  };
}

export function isPasswordResetExpired(meta: PasswordResetMetadata, now = Date.now()): boolean {
  return now >= meta.expiresAt;
}

export async function passwordResetMatches(
  meta: PasswordResetMetadata,
  token: string,
  now = Date.now()
): Promise<boolean> {
  if (!isPasswordResetTokenShape(token)) return false;
  if (isPasswordResetExpired(meta, now)) return false;
  return timingSafeEqual(meta.tokenHash, await hashPasswordResetToken(token));
}

export function invalidResetLink(): never {
  throw new ProjectError(400, 'VALIDATION', 'This reset link is invalid or has expired.');
}

export type PasswordResetEmail = {
  subject: string;
  html: string;
  text: string;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&' + 'amp;')
    .replace(/</g, '&' + 'lt;')
    .replace(/>/g, '&' + 'gt;')
    .replace(/"/g, '&' + 'quot;')
    .replace(/'/g, '&' + '#39;');
}

export function renderPasswordResetEmail(input: {
  resetUrl: string;
  firstName?: string | null;
  hoursValid: number;
}): PasswordResetEmail {
  const greeting = input.firstName?.trim() ? `Hi ${input.firstName.trim()},` : 'Hi,';
  const subject = 'Reset your Noxen password';
  const text = [
    greeting,
    '',
    'An admin sent you a link to choose a new password for your Noxen account.',
    '',
    input.resetUrl,
    '',
    `This link expires in ${input.hoursValid} hour${input.hoursValid === 1 ? '' : 's'} and can only be used once.`,
    'If you did not ask for this, you can ignore the email — your password stays the same.',
  ].join('\n');

  const html = `<!doctype html>
<html>
  <body style="margin:0;background:#fafafa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
    <div style="max-width:520px;margin:32px auto;padding:24px;background:#fff;border:1px solid #e4e4e7;border-radius:12px;">
      <p style="margin:0 0 12px;font-size:14px;color:#52525b;">${escapeHtml(greeting)}</p>
      <h1 style="margin:0 0 8px;font-size:18px;color:#18181b;">Reset your Noxen password</h1>
      <p style="margin:0 0 16px;font-size:14px;color:#52525b;line-height:1.5;">
        An admin sent you a link to choose a new password for your Noxen account.
      </p>
      <a href="${escapeHtml(input.resetUrl)}"
         style="display:inline-block;padding:9px 14px;border-radius:8px;background:#8b7cf6;color:#fff;font-size:14px;text-decoration:none;">
        Choose a new password
      </a>
      <p style="margin:18px 0 0;font-size:12px;color:#a1a1aa;line-height:1.5;">
        This link expires in ${input.hoursValid} hour${input.hoursValid === 1 ? '' : 's'} and can only be used once.
        If you did not ask for this, ignore the email — your password stays the same.
      </p>
    </div>
  </body>
</html>`;

  return { subject, html, text };
}
