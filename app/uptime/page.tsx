import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { UptimeDashboard } from '@/src/components/UptimeDashboard';
import { AuthUnavailable } from '@/src/components/AuthUnavailable';
import { isClerkConfigured } from '@/src/lib/auth';

export default async function UptimePage() {
  if (!isClerkConfigured()) return <AuthUnavailable />;

  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  return <UptimeDashboard />;
}
