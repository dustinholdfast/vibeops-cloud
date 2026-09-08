import { auth, currentUser } from '@clerk/nextjs/server';
import { ProjectError } from './project-validation';

export function parseAdminList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(/[,\s]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function adminIdsFromEnv(env: NodeJS.Dict<string> = process.env): string[] {
  return parseAdminList(env.ADMIN_USER_IDS);
}

export function adminEmailsFromEnv(env: NodeJS.Dict<string> = process.env): string[] {
  return parseAdminList(env.ADMIN_EMAILS).map((email) => email.toLowerCase());
}

export function isAdminUser(
  userId: string,
  emails: string[],
  env: NodeJS.Dict<string> = process.env
): boolean {
  if (adminIdsFromEnv(env).includes(userId)) return true;
  const allowed = adminEmailsFromEnv(env);
  if (allowed.length === 0) return false;
  return emails.some((email) => allowed.includes(email.toLowerCase()));
}

export async function requireAdmin(): Promise<{ userId: string }> {
  const { userId } = await auth();
  if (!userId) throw new ProjectError(401, 'UNAUTHORIZED', 'Please sign in again.');

  const ids = adminIdsFromEnv();
  const emails = adminEmailsFromEnv();
  if (ids.length === 0 && emails.length === 0) {
    throw new ProjectError(403, 'FORBIDDEN', 'Admin access is not configured.');
  }

  if (ids.includes(userId)) return { userId };

  if (emails.length > 0) {
    const user = await currentUser();
    const held =
      user?.emailAddresses.map((address) => address.emailAddress.toLowerCase()) ?? [];
    if (held.some((email) => emails.includes(email))) return { userId };
  }

  throw new ProjectError(403, 'FORBIDDEN', 'Admin only.');
}
