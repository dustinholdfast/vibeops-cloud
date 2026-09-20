import { SignIn } from '@clerk/nextjs';
import { AuthFrame } from '@/src/components/AuthFrame';
import { AuthUnavailable } from '@/src/components/AuthUnavailable';
import { isClerkConfigured } from '@/src/lib/auth';
import { safeAuthRedirect } from '@/src/lib/sign-in-redirect';

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect_url?: string | string[] }>;
}) {
  if (!isClerkConfigured()) return <AuthUnavailable />;

  const params = await searchParams;
  const after = safeAuthRedirect(params.redirect_url);

  return (
    <AuthFrame title="Sign in" subtitle="GitHub or the email already on this account.">
      <SignIn
        routing="path"
        path="/sign-in"
        signUpUrl="/sign-up"
        forceRedirectUrl={after}
        fallbackRedirectUrl={after}
        appearance={{
          elements: {
            rootBox: 'w-full',
            card: 'bg-transparent shadow-none border-0 p-0',
            header: 'hidden',
            footerAction: 'pt-4',
          },
        }}
      />
    </AuthFrame>
  );
}
