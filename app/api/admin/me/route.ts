import { NextResponse } from 'next/server';
import { requireAdmin } from '@/src/lib/admin';
import { projectErrorResponse } from '@/src/lib/project-errors';

export async function GET() {
  try {
    const { userId } = await requireAdmin();
    return NextResponse.json({ admin: true, userId });
  } catch (error) {
    return projectErrorResponse(error);
  }
}
