import { AuthenticateWithRedirectCallback } from '@clerk/nextjs';

export default function SSOCallbackPage() {
  return (
    <div className="min-h-full flex items-center justify-center text-sm text-text-muted">
      <AuthenticateWithRedirectCallback />
    </div>
  );
}
