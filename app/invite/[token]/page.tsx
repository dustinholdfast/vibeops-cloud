import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { AcceptInvite } from './AcceptInvite';

type Props = { params: Promise<{ token: string }> };

export default async function InvitePage({ params }: Props) {
  const { token } = await params;
  const { userId } = await auth();

  // Redemption is tied to the signed-in account's verified email, so sign-in
  // has to happen before the token can be used.
  if (!userId) redirect(`/sign-in?redirect_url=${encodeURIComponent(`/invite/${token}`)}`);

  return <AcceptInvite token={token} />;
}
