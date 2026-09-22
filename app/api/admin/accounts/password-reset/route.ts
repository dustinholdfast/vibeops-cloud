import { NextResponse } from 'next/server';
import { requireAdmin } from '@/src/lib/admin';
import { sendAdminPasswordReset } from '@/src/lib/admin-password-reset';
import { projectErrorResponse } from '@/src/lib/project-errors';
import { ProjectError } from '@/src/lib/project-validation';
import { publicAppOrigin } from '@/src/lib/public-url';

export async function POST(req: Request) {
  try {
    const { userId: actorUserId } = await requireAdmin();
    const body = (await req.json()) as { userId?: string };
    const userId = body.userId?.trim();
    if (!userId) throw new ProjectError(400, 'VALIDATION', 'userId is required.');
    const appUrl = publicAppOrigin(req.url);
    const result = await sendAdminPasswordReset({
      actorUserId,
      targetUserId: userId,
      appUrl,
    });
    return NextResponse.json({
      ok: true,
      userId: result.userId,
      email: result.maskedEmail,
      expiresAt: result.expiresAt,
    });
  } catch (error) {
    return projectErrorResponse(error, 'Could not send the password reset. Please try again.');
  }
}
