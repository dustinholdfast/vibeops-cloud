import { NextResponse } from 'next/server';
import { ProjectError } from './project-validation';
export function projectErrorResponse(error: unknown) {
  if (error instanceof ProjectError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  if (error instanceof SyntaxError) return NextResponse.json({ error: 'Invalid JSON body.', code: 'VALIDATION' }, { status: 400 });
  console.error('[projects] request failed', error);
  return NextResponse.json({ error: 'Could not save or load your projects. Please try again.', code: 'SERVICE_UNAVAILABLE' }, { status: 503 });
}
