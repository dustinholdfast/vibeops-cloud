import { SignUp } from '@clerk/nextjs';
import { AuthUnavailable } from '@/src/components/AuthUnavailable';
import { isClerkConfigured } from '@/src/lib/auth';

export default function SignUpPage() {
  if (!isClerkConfigured()) return <AuthUnavailable />;

  return (
    <div className="min-h-full flex items-center justify-center px-4">
      <SignUp
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
