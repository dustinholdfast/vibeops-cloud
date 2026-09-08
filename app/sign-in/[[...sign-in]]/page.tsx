import { SignIn } from '@clerk/nextjs';
import { AuthFrame } from '@/src/components/AuthFrame';
import { GitHubAuthButton } from '@/src/components/GitHubAuthButton';

export default function SignInPage() {
  return (
    <AuthFrame title="Sign in" subtitle="Use GitHub, or the email already on this account.">
      <GitHubAuthButton mode="sign-in" />
      <div className="my-4 flex items-center gap-3 text-[11px] uppercase tracking-wider text-text-dim">
        <span className="h-px flex-1 bg-border" />
        or email
        <span className="h-px flex-1 bg-border" />
      </div>
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
            footer: 'hidden',
            socialButtons: 'hidden',
          },
        }}
      />
    </AuthFrame>
  );
}
