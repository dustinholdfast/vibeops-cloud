import { NextResponse } from 'next/server';
import { isConnectError } from '../db';
import { ProjectError } from './project-validation';

const PROJECTS_FALLBACK = 'Could not save or load your projects. Please try again.';
const DATABASE_FALLBACK = 'Could not reach the project database. Please try again.';

export function errorDetail(error: unknown): string {
  if (error instanceof Error) {
    const message = error.message || error.stack?.split('\n').find((line) => line.trim()) || 'unknown';
    return `${error.name}: ${message}`.slice(0, 300);
  }
  return String(error).slice(0, 300);
}

export function projectErrorResponse(error: unknown, fallback = PROJECTS_FALLBACK) {
  if (error instanceof ProjectError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  if (error instanceof SyntaxError) return NextResponse.json({ error: 'Invalid JSON body.', code: 'VALIDATION' }, { status: 400 });
  console.error('[projects] request failed', error);
  const connect = isConnectError(error);
  return NextResponse.json(
    {
      error: connect ? DATABASE_FALLBACK : fallback,
      code: 'SERVICE_UNAVAILABLE',
      detail: errorDetail(error),
    },
    { status: 503 }
  );
}
