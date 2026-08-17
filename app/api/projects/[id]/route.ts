import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { requireDb } from '@/src/db';
import { projects } from '@/src/db/schema';
import { dbProjectToDomain } from '@/src/db/map';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await ctx.params;

  try {
    const db = requireDb();
    const [row] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, id), eq(projects.userId, userId)))
      .limit(1);

    if (!row) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({ project: dbProjectToDomain(row) });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Database error';
    return NextResponse.json({ error: message }, { status: 503 });
  }
}

export async function PATCH(req: Request, ctx: Ctx) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await ctx.params;

  try {
    const body = await req.json();
    const db = requireDb();

    const [existing] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, id), eq(projects.userId, userId)))
      .limit(1);

    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const updates: Record<string, unknown> = {
      updatedAt: new Date(),
      lastTouched: new Date(),
    };

    const allowed = [
      'name',
      'nextAction',
      'stage',
      'priority',
      'health',
      'targetDate',
      'liveUrl',
      'repoUrl',
      'progress',
      'activity',
    ] as const;

    for (const key of allowed) {
      if (key in body) {
        updates[key] = body[key];
      }
    }

    const [row] = await db
      .update(projects)
      .set(updates)
      .where(and(eq(projects.id, id), eq(projects.userId, userId)))
      .returning();

    return NextResponse.json({ project: dbProjectToDomain(row) });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Database error';
    return NextResponse.json({ error: message }, { status: 503 });
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await ctx.params;

  try {
    const db = requireDb();
    const deleted = await db
      .delete(projects)
      .where(and(eq(projects.id, id), eq(projects.userId, userId)))
      .returning({ id: projects.id });

    if (deleted.length === 0) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Database error';
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
