import { SignIn } from '@clerk/nextjs';
import { AuthUnavailable } from '@/src/components/AuthUnavailable';
import { isClerkConfigured } from '@/src/lib/auth';

export default function SignInPage() {
  if (!isClerkConfigured()) return <AuthUnavailable />;

  return (
    <div className="min-h-full flex items-center justify-center px-4">
      <SignIn
        appearance={{
          elements: {
            rootBox: 'mx-auto',
            card: 'bg-surface border border-border shadow-xl',
          },
        }}
      />
    </div>
  );
}
