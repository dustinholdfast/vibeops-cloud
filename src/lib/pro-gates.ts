import type { PlanId } from './plans';
import { ProjectError } from './project-validation';

/** Features that cost money or are the reason to pay. The brief and stall warnings are not in this list. */
export type ProGate = 'nox' | 'uptimeAlerts' | 'extraWorkspace';

const MESSAGES: Record<ProGate, string> = {
  nox: 'Nox is a Pro feature. Upgrade to use it in this workspace.',
  uptimeAlerts: 'Uptime alert emails are a Pro feature. Checks still run on Free.',
  extraWorkspace: 'A second workspace is a Pro feature. Upgrade to add one.',
};

export function proGateAllows(plan: PlanId, _gate: ProGate): boolean {
  return plan === 'pro';
}

export function assertProGate(plan: PlanId, gate: ProGate): void {
  if (proGateAllows(plan, gate)) return;
  throw new ProjectError(402, 'PRO_REQUIRED', MESSAGES[gate]);
}
