import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { requireDb } from '@/src/db';
import { projects } from '@/src/db/schema';
import { getUserPlan } from '@/src/lib/subscription';
import { PLANS, projectLimitFor } from '@/src/lib/plans';

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const billing = await getUserPlan(userId);
    const db = requireDb();
    const rows = await db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.userId, userId));

    const limit = projectLimitFor(billing.plan);

    return NextResponse.json({
      ...billing,
      planMeta: PLANS[billing.plan],
      projectCount: rows.length,
      projectLimit: limit,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Status failed';
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
