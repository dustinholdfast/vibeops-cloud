# GitHub sign-in

Cloud authenticates with Clerk. GitHub is an OAuth strategy on that instance —
the app cannot turn the provider on by itself.

## Enable the provider

1. [dashboard.clerk.com](https://dashboard.clerk.com) → the VibeOps instance → **SSO connections** → **GitHub**.
2. Use Clerk's shared GitHub credentials for development, or create a GitHub OAuth App:
   - Homepage URL: your Cloud origin (`http://localhost:3001` locally, the custom domain in production)
   - Authorization callback URL: the callback Clerk shows in that panel (copy it exactly)
3. Toggle **Enable for sign-up and sign-in**.
4. Repeat on the **production** Clerk instance before cutover. Development and production instances do not share SSO settings.

After that, `/sign-in` and `/sign-up` show **Continue with GitHub**. Clerk still owns the session; project rows keep using the Clerk user id.

## What the app does

`GitHubAuthButton` calls `authenticateWithRedirect({ strategy: 'oauth_github' })`.
The catch-all routes `/sign-in/[[...sign-in]]` and `/sign-up/[[...sign-up]]` handle `/sso-callback`. Successful auth lands on `/dashboard`.

If GitHub is not enabled, the button explains that instead of sending the user into a broken Clerk error page.
