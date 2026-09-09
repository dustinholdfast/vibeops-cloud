type SocialEntry = {
  enabled?: boolean;
  authenticatable?: boolean;
  strategy?: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

export function socialStrategiesFromEnvironment(environment: unknown): {
  strategies: string[];
  githubStrategy: string | null;
} {
  const root = asRecord(environment);
  const settings = asRecord(root?.user_settings) ?? asRecord(root?.userSettings);
  const social = asRecord(settings?.social) ?? {};
  const listed =
    (settings?.authenticatable_social_strategies as unknown) ??
    settings?.authenticatableSocialStrategies;

  const fromList = Array.isArray(listed)
    ? listed.filter((item): item is string => typeof item === 'string')
    : [];

  const fromMap = Object.entries(social).flatMap(([key, value]) => {
    const entry = asRecord(value) as SocialEntry | null;
    if (!entry) return [];
    if (entry.enabled === false || entry.authenticatable === false) return [];
    return [entry.strategy || key];
  });

  const strategies = [...new Set([...fromList, ...fromMap])].filter((strategy) =>
    strategy.startsWith('oauth_')
  );
  const githubStrategy =
    strategies.find((strategy) => strategy === 'oauth_github') ??
    strategies.find((strategy) => /github/i.test(strategy)) ??
    null;

  return { strategies, githubStrategy };
}
