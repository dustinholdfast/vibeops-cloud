import { auth } from '@clerk/nextjs/server';

export function isClerkConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY
  );
}

export async function getOptionalUserId(): Promise<string | null> {
  if (!isClerkConfigured()) return null;

  const { userId } = await auth();
  return userId;
}
