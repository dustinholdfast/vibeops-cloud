import { auth } from '@clerk/nextjs/server';
import { env } from './env';

export function isClerkConfigured(): boolean {
  return Boolean(env('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY') && env('CLERK_SECRET_KEY'));
}

export async function getOptionalUserId(): Promise<string | null> {
  if (!isClerkConfigured()) return null;

  const { userId } = await auth();
  return userId;
}
