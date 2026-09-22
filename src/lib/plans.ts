export type PlanId = 'free' | 'pro';

export type PlanDefinition = {
  id: PlanId;
  name: string;
  description: string;
  maxProjects: number | null; // null = unlimited
  priceMonthlyLabel: string;
  priceYearlyLabel: string;
  features: string[];
};

export const PLANS: Record<PlanId, PlanDefinition> = {
  free: {
    id: 'free',
    name: 'Free',
    description: 'The daily brief and stall warnings, for up to five projects.',
    maxProjects: 5,
    priceMonthlyLabel: '$0',
    priceYearlyLabel: '$0',
    features: [
      'Up to 5 projects',
      'Daily brief and stall warnings',
      'Uptime checks in the app',
      'Import from Noxen Local',
    ],
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    description: 'Nox, alert emails, and workspaces beyond your personal one.',
    maxProjects: null,
    priceMonthlyLabel: '$12',
    priceYearlyLabel: '$120',
    features: [
      'Unlimited projects',
      'Nox, the workspace copilot',
      'Uptime alert emails',
      'Extra workspaces',
      'Everything in Free',
    ],
  },
};

export function isProStatus(status: string | null | undefined): boolean {
  return status === 'active' || status === 'trialing' || status === 'complimentary';
}

export function resolvePlan(
  plan: string | null | undefined,
  status: string | null | undefined
): PlanId {
  if (plan === 'pro' && isProStatus(status)) return 'pro';
  return 'free';
}

export function projectLimitFor(plan: PlanId): number | null {
  return PLANS[plan].maxProjects;
}

export function canCreateProject(
  plan: PlanId,
  currentCount: number
): { ok: true } | { ok: false; limit: number } {
  const limit = projectLimitFor(plan);
  if (limit === null) return { ok: true };
  if (currentCount >= limit) return { ok: false, limit };
  return { ok: true };
}
