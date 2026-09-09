import { SignIn } from '@clerk/nextjs';
import { AuthFrame } from '@/src/components/AuthFrame';
import { AuthUnavailable } from '@/src/components/AuthUnavailable';
import { isClerkConfigured } from '@/src/lib/auth';

export default function SignInPage() {
  if (!isClerkConfigured()) return <AuthUnavailable />;

  return (
    <AuthFrame title="Sign in" subtitle="GitHub or the email already on this account.">
      <SignIn
        routing="path"
        path="/sign-in"
        signUpUrl="/sign-up"
        forceRedirectUrl="/dashboard"
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
