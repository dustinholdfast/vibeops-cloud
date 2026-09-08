import { SignUp } from '@clerk/nextjs';
import { AuthFrame } from '@/src/components/AuthFrame';
import { GitHubAuthButton } from '@/src/components/GitHubAuthButton';

export default function SignUpPage() {
  return (
    <AuthFrame title="Create account" subtitle="GitHub is the fastest path. Email works too.">
      <GitHubAuthButton label="Sign up with GitHub" />
      <div className="my-4 flex items-center gap-3 text-[11px] uppercase tracking-wider text-text-dim">
        <span className="h-px flex-1 bg-border" />
        or email
        <span className="h-px flex-1 bg-border" />
      </div>
      <SignUp
        routing="path"
        path="/sign-up"
        signInUrl="/sign-in"
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
