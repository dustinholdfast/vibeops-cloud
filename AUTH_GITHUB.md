# GitHub sign-in and repo push

Cloud authenticates with Clerk. GitHub is an OAuth strategy on that instance.

## Enable the provider

1. [dashboard.clerk.com](https://dashboard.clerk.com) → the **same instance** whose `pk_` / `sk_` keys are on Vercel → **SSO connections**.
2. **Add connection** → **For all users** → GitHub. "For specific users" will not show on the public login page.
3. Turn on **Enable for sign-up and sign-in**.
4. Development can use Clerk's shared GitHub app. Production should use a GitHub OAuth App whose callback URL is the one Clerk displays.
5. Confirm the Vercel env keys belong to that instance. Enabling GitHub on a different Clerk application than `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` will still fail.

The OAuth return path is `/sso-callback`. Add the production origin under Clerk **Allowed redirect URLs** if the dashboard asks for it.

## Push a project snapshot

The project drawer can commit `.vibeops/<project-id>.md` to the GitHub repo linked on that project.

1. In Clerk → GitHub SSO, enable **Use custom credentials** and add the `repo` scope so Cloud can write files.
2. Users must sign in with GitHub (or connect GitHub under Manage account). Email-only sessions have no token to push with.
3. Set the project's repo URL to `https://github.com/owner/repo`.
4. Open the drawer → **Push snapshot**.

The commit uses that user's GitHub token. They need write access on the repository.
