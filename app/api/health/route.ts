import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: 'vibeops-cloud',
    phase: 3,
    hasDatabase: Boolean(process.env.DATABASE_URL),
    hasClerk: Boolean(
      process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY
    ),
  });
}
