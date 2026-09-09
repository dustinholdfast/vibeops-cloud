type SocialEntry = {
  enabled?: boolean;
  authenticatable?: boolean;
  strategy?: string;
};

type UserSettings = {
  social?: Record<string, SocialEntry | undefined>;
  authenticatableSocialStrategies?: string[];
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function readEnvironment(clerk: unknown): Record<string, unknown> | null {
  const root = asRecord(clerk);
  if (!root) return null;
  return (
    asRecord(root.environment) ??
    asRecord(root.__unstable__environment) ??
    asRecord(asRecord(root.client)?.environment) ??
    null
  );
}

function userSettingsFrom(clerk: unknown): UserSettings | undefined {
  const environment = readEnvironment(clerk);
  const settings = asRecord(environment?.userSettings);
  if (!settings) return undefined;

  const socialRaw = asRecord(settings.social);
  const social = socialRaw
    ? Object.fromEntries(
        Object.entries(socialRaw).map(([key, value]) => {
          const entry = asRecord(value);
          return [
            key,
            entry
              ? {
                  enabled: typeof entry.enabled === 'boolean' ? entry.enabled : undefined,
                  authenticatable:
                    typeof entry.authenticatable === 'boolean' ? entry.authenticatable : undefined,
                  strategy: typeof entry.strategy === 'string' ? entry.strategy : undefined,
                }
              : undefined,
          ];
        })
      )
    : undefined;

  const list = settings.authenticatableSocialStrategies;
  return {
    social,
    authenticatableSocialStrategies: Array.isArray(list)
      ? list.filter((item): item is string => typeof item === 'string')
      : undefined,
  };
}

function entriesFromSocial(social: Record<string, SocialEntry | undefined> | undefined) {
  if (!social) return [];
  return Object.entries(social)
    .filter(([, value]) => value && value.enabled !== false && value.authenticatable !== false)
    .map(([key, value]) => value?.strategy || key);
}

export function clerkSocialStrategies(clerk: unknown): string[] {
  const settings = userSettingsFrom(clerk);
  const fromList = settings?.authenticatableSocialStrategies ?? [];
  const fromMap = entriesFromSocial(settings?.social);
  return [...new Set([...fromList, ...fromMap])].filter((strategy) => strategy.startsWith('oauth_'));
}

export function clerkGitHubStrategy(clerk: unknown): string {
  const strategies = clerkSocialStrategies(clerk);
  return (
    strategies.find((strategy) => strategy === 'oauth_github') ??
    strategies.find((strategy) => /github/i.test(strategy)) ??
    'oauth_github'
  );
}
