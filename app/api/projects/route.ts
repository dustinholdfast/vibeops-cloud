import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { eq, desc } from 'drizzle-orm';
import { requireDb } from '@/src/db';
import { projects } from '@/src/db/schema';
import { dbProjectToDomain, domainToDbInsert } from '@/src/db/map';
import type { Project } from '@/src/types';
import { generateId } from '@/src/lib/utils';
import { assertCanCreateProject, getUserPlan } from '@/src/lib/subscription';
import { canCreateProject } from '@/src/lib/plans';

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const db = requireDb();
    const rows = await db
      .select()
      .from(projects)
      .where(eq(projects.userId, userId))
      .orderBy(desc(projects.lastTouched));

    return NextResponse.json({
      projects: rows.map(dbProjectToDomain),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Database error';
    return NextResponse.json({ error: message }, { status: 503 });
  }
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const gate = await assertCanCreateProject(userId);
    if (!gate.allowed) {
      return NextResponse.json(
        {
          error: `Free plan allows ${gate.limit} projects. Upgrade to Pro for unlimited.`,
          code: 'PLAN_LIMIT',
          limit: gate.limit,
          count: gate.count,
        },
        { status: 402 }
      );
    }

    const body = await req.json();
    const now = new Date().toISOString();

    const project: Project = {
      id: typeof body.id === 'string' ? body.id : generateId(),
      name: String(body.name || '').trim() || 'Untitled',
      nextAction:
        typeof body.nextAction === 'string'
          ? body.nextAction
          : 'Define the first slice',
      stage: body.stage || 'Exploring',
      priority: body.priority || 'Later',
      health: body.health || 'On track',
      targetDate: body.targetDate ?? null,
      lastTouched: now,
      createdAt: now,
      liveUrl: body.liveUrl,
      repoUrl: body.repoUrl,
      progress: typeof body.progress === 'number' ? body.progress : 0,
      activity: [
        {
          id: generateId(),
          type: 'created',
          message: 'Project created',
          timestamp: now,
          author: 'You',
        },
      ],
    };

    const db = requireDb();
    const [row] = await db
      .insert(projects)
      .values(domainToDbInsert(userId, project))
      .returning();

    return NextResponse.json(
      { project: dbProjectToDomain(row) },
      { status: 201 }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Database error';
    return NextResponse.json({ error: message }, { status: 503 });
  }
}

/** Replace all projects for the current user (import from Local export). */
export async function PUT(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const list: Project[] = Array.isArray(body)
      ? body
      : Array.isArray(body?.projects)
        ? body.projects
        : [];

    const { plan } = await getUserPlan(userId);
    const gate = canCreateProject(plan, list.length);
    // For import, limit applies to the resulting set size (0 is always ok)
    if (list.length > 0 && !gate.ok) {
      return NextResponse.json(
        {
          error: `Import has ${list.length} projects; Free plan allows ${gate.limit}. Upgrade to Pro or import fewer.`,
          code: 'PLAN_LIMIT',
          limit: gate.limit,
          count: list.length,
        },
        { status: 402 }
      );
    }

    const db = requireDb();

    await db.delete(projects).where(eq(projects.userId, userId));

    if (list.length > 0) {
      const values = list.map((p) =>
        domainToDbInsert(userId, {
          ...p,
          id: p.id || generateId(),
          activity: Array.isArray(p.activity) ? p.activity : [],
        })
      );
      await db.insert(projects).values(values);
    }

    const rows = await db
      .select()
      .from(projects)
      .where(eq(projects.userId, userId))
      .orderBy(desc(projects.lastTouched));

    return NextResponse.json({
      projects: rows.map(dbProjectToDomain),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Database error';
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
