import { SignUp } from '@clerk/nextjs';
import { AuthFrame } from '@/src/components/AuthFrame';

export default function SignUpPage() {
  return (
    <AuthFrame title="Create account" subtitle="GitHub is the fastest path. Email works too.">
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
