import { NextResponse } from 'next/server';
import { consumePasswordReset, peekPasswordReset } from '@/src/lib/admin-password-reset';
import { projectErrorResponse } from '@/src/lib/project-errors';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    await peekPasswordReset({
      userId: url.searchParams.get('user') ?? '',
      token: url.searchParams.get('token') ?? '',
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return projectErrorResponse(error, 'This reset link is invalid or has expired.');
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      userId?: string;
      token?: string;
      password?: string;
    };
    await consumePasswordReset({
      userId: body.userId ?? '',
      token: body.token ?? '',
      password: body.password,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return projectErrorResponse(error, 'Could not reset that password. Please try again.');
  }
}
