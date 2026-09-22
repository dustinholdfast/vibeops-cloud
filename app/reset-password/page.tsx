import { AuthUnavailable } from '@/src/components/AuthUnavailable';
import { isClerkConfigured } from '@/src/lib/auth';
import { ResetPasswordClient } from './ResetPasswordClient';

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ user?: string | string[]; token?: string | string[] }>;
}) {
  if (!isClerkConfigured()) return <AuthUnavailable />;

  const params = await searchParams;
  const userId = Array.isArray(params.user) ? params.user[0] : params.user;
  const token = Array.isArray(params.token) ? params.token[0] : params.token;

  return <ResetPasswordClient userId={userId ?? ''} token={token ?? ''} />;
}
