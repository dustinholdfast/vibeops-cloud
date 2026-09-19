import { NextResponse } from 'next/server';
import { ProjectError } from './project-validation';

const PROJECTS_FALLBACK = 'Could not save or load your projects. Please try again.';

export function projectErrorResponse(error: unknown, fallback = PROJECTS_FALLBACK) {
  if (error instanceof ProjectError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  if (error instanceof SyntaxError) return NextResponse.json({ error: 'Invalid JSON body.', code: 'VALIDATION' }, { status: 400 });
  console.error('[projects] request failed', error);
  return NextResponse.json({ error: fallback, code: 'SERVICE_UNAVAILABLE' }, { status: 503 });
}
