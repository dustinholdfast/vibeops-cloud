type SocialEntry = {
  enabled?: boolean;
  authenticatable?: boolean;
  strategy?: string;
};

type ClerkLike = {
  client?: {
    environment?: {
      userSettings?: {
        social?: Record<string, SocialEntry | undefined>;
        authenticatableSocialStrategies?: string[];
      };
    };
  } | null;
};

function entriesFromSocial(social: Record<string, SocialEntry | undefined> | undefined) {
  if (!social) return [];
  return Object.entries(social)
    .filter(([, value]) => value && value.enabled !== false && value.authenticatable !== false)
    .map(([key, value]) => value?.strategy || key);
}

export function clerkSocialStrategies(clerk: ClerkLike): string[] {
  const settings = clerk.client?.environment?.userSettings;
  const fromList = settings?.authenticatableSocialStrategies ?? [];
  const fromMap = entriesFromSocial(settings?.social);
  return [...new Set([...fromList, ...fromMap])].filter((strategy) => strategy.startsWith('oauth_'));
}

export function clerkGitHubStrategy(clerk: ClerkLike): string | null {
  const strategies = clerkSocialStrategies(clerk);
  return (
    strategies.find((strategy) => strategy === 'oauth_github') ??
    strategies.find((strategy) => /github/i.test(strategy)) ??
    null
  );
}
