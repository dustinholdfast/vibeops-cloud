import { clerkClient } from '@clerk/nextjs/server';
import { sendEmail } from './email/send';
import { ProjectError } from './project-validation';
import {
  PASSWORD_RESET_META_KEY,
  PASSWORD_RESET_TTL_MS,
  hashPasswordResetToken,
  invalidResetLink,
  isPasswordResetExpired,
  maskEmail,
  parsePasswordResetMetadata,
  passwordResetMatches,
  passwordResetUrl,
  randomPasswordResetToken,
  renderPasswordResetEmail,
  validateNewPassword,
  type PasswordResetMetadata,
} from './password-reset';

type ClerkUserLike = {
  id: string;
  firstName: string | null;
  primaryEmailAddress?: { emailAddress: string } | null;
  emailAddresses: { emailAddress: string }[];
  privateMetadata: Record<string, unknown>;
};

function clerkErrorMessage(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null;
  const errors = (error as { errors?: { longMessage?: string; message?: string }[] }).errors;
  return errors?.[0]?.longMessage || errors?.[0]?.message || null;
}

function emailOf(user: ClerkUserLike): string | null {
  return user.primaryEmailAddress?.emailAddress ?? user.emailAddresses[0]?.emailAddress ?? null;
}

async function loadUser(userId: string): Promise<ClerkUserLike> {
  try {
    const client = await clerkClient();
    return (await client.users.getUser(userId)) as ClerkUserLike;
  } catch (error) {
    const message = clerkErrorMessage(error);
    if (message?.toLowerCase().includes('not found') || (error as { status?: number }).status === 404) {
      throw new ProjectError(404, 'NOT_FOUND', 'That user was not found.');
    }
    throw error;
  }
}

async function loadUserOrNull(userId: string): Promise<ClerkUserLike | null> {
  try {
    return await loadUser(userId);
  } catch (error) {
    if (error instanceof ProjectError && error.status === 404) return null;
    throw error;
  }
}

async function writeResetMetadata(userId: string, value: PasswordResetMetadata | null) {
  const client = await clerkClient();
  await client.users.updateUserMetadata(userId, {
    privateMetadata: { [PASSWORD_RESET_META_KEY]: value },
  });
}

export async function sendAdminPasswordReset(input: {
  actorUserId: string;
  targetUserId: string;
  appUrl: string;
  now?: number;
}): Promise<{ ok: true; userId: string; email: string; maskedEmail: string; expiresAt: string }> {
  const targetUserId = input.targetUserId.trim();
  if (!targetUserId) throw new ProjectError(400, 'VALIDATION', 'userId is required.');

  const user = await loadUser(targetUserId);
  const email = emailOf(user);
  if (!email) {
    throw new ProjectError(400, 'VALIDATION', 'That account has no email address to send a reset to.');
  }

  const now = input.now ?? Date.now();
  const token = randomPasswordResetToken();
  const expiresAt = now + PASSWORD_RESET_TTL_MS;
  const metadata: PasswordResetMetadata = {
    tokenHash: await hashPasswordResetToken(token),
    expiresAt,
    requestedByUserId: input.actorUserId,
    requestedAt: now,
  };

  await writeResetMetadata(targetUserId, metadata);

  const resetUrl = passwordResetUrl(input.appUrl, targetUserId, token);
  const hoursValid = Math.max(1, Math.round(PASSWORD_RESET_TTL_MS / 3_600_000));
  const rendered = renderPasswordResetEmail({
    resetUrl,
    firstName: user.firstName,
    hoursValid,
  });
  const sent = await sendEmail({
    to: email,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
  });

  if (sent.status !== 'sent') {
    await writeResetMetadata(targetUserId, null).catch(() => undefined);
    if (sent.status === 'skipped') {
      throw new ProjectError(
        503,
        'SERVICE_UNAVAILABLE',
        'Email is not configured. Set RESEND_API_KEY and EMAIL_FROM, then try again.'
      );
    }
    throw new ProjectError(502, 'UPSTREAM', 'Could not send the reset email. Try again.');
  }

  return {
    ok: true,
    userId: targetUserId,
    email,
    maskedEmail: maskEmail(email),
    expiresAt: new Date(expiresAt).toISOString(),
  };
}

export async function peekPasswordReset(input: {
  userId: string;
  token: string;
  now?: number;
}): Promise<{ ok: true }> {
  const userId = input.userId.trim();
  if (!userId) invalidResetLink();
  const user = await loadUserOrNull(userId);
  const meta = parsePasswordResetMetadata(user?.privateMetadata[PASSWORD_RESET_META_KEY]);
  if (!user || !meta || !(await passwordResetMatches(meta, input.token, input.now ?? Date.now()))) {
    invalidResetLink();
  }
  return { ok: true };
}

export async function consumePasswordReset(input: {
  userId: string;
  token: string;
  password: unknown;
  now?: number;
}): Promise<{ ok: true }> {
  const userId = input.userId.trim();
  if (!userId) invalidResetLink();
  const password = validateNewPassword(input.password);
  const user = await loadUserOrNull(userId);
  const meta = parsePasswordResetMetadata(user?.privateMetadata[PASSWORD_RESET_META_KEY]);
  if (!user || !meta || !(await passwordResetMatches(meta, input.token, input.now ?? Date.now()))) {
    invalidResetLink();
  }
  if (isPasswordResetExpired(meta, input.now ?? Date.now())) invalidResetLink();

  try {
    const client = await clerkClient();
    await client.users.updateUser(userId, {
      password,
      signOutOfOtherSessions: true,
    });
  } catch (error) {
    const message = clerkErrorMessage(error);
    if (message) throw new ProjectError(400, 'VALIDATION', message);
    throw new ProjectError(502, 'UPSTREAM', 'Could not update the password. Try again.');
  }

  await writeResetMetadata(userId, null).catch(() => undefined);
  return { ok: true };
}
