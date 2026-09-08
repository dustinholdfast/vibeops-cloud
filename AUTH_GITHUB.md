# GitHub sign-in

Cloud authenticates with Clerk. GitHub is an OAuth strategy on that instance.

## Enable the provider

1. [dashboard.clerk.com](https://dashboard.clerk.com) → the **same instance** whose `pk_` / `sk_` keys are on Vercel → **SSO connections**.
2. **Add connection** → **For all users** → GitHub. "For specific users" will not show on the public login page.
3. Turn on **Enable for sign-up and sign-in**.
4. Development can use Clerk's shared GitHub app. Production should use a GitHub OAuth App whose callback URL is the one Clerk displays.
5. Confirm the Vercel env keys belong to that instance. Enabling GitHub on a different Clerk application than `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` will still fail.

The OAuth return path is `/sso-callback`. Add the production origin under Clerk **Allowed redirect URLs** if the dashboard asks for it.
