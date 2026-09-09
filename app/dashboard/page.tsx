import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { DashboardClient } from './DashboardClient';
import { AuthUnavailable } from '@/src/components/AuthUnavailable';
import { isClerkConfigured } from '@/src/lib/auth';

export default async function DashboardPage() {
  if (!isClerkConfigured()) return <AuthUnavailable />;

  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  return <DashboardClient userId={userId} />;
}
