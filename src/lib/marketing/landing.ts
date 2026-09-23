/**
 * Marketing landing copy and the product-preview state machine.
 * Kept pure so wording and scene timing can be tested without React.
 */

export const LANDING_COPY = {
  eyebrow: 'Command center',
  headline: 'Know what deserves today.',
  subhead:
    'For builders juggling more than one project. Three Now slots, a daily brief, and work that went quiet comes back on its own.',
  freeNote: 'Free for up to 5 projects · No credit card required',
  explainerTitle: 'What is Noxen Cloud?',
  explainer:
    'Noxen Cloud is a focused project tracker for builders who keep more than one thing in flight. It surfaces what is moving, what is stalling, and the next action that deserves you right now — instead of another place to store tasks.',
  localPrompt: 'Prefer offline?',
  localLabel: 'Noxen Local',
  localHref: 'https://github.com/dustinholdfast/vibeops',
  previewCaption: 'A morning in the command center',
  tiles: [
    {
      title: 'Cap today at three',
      body: 'Only three projects get a Now slot. Everything else waits its turn.',
    },
    {
      title: 'Silence surfaces itself',
      body: 'If a build has not moved in a week, it comes back without you hunting for it.',
    },
    {
      title: 'One recommended next',
      body: 'Each visit, a brief names the project that deserves you — and the next action on it.',
    },
  ],
} as const;

export const LANDING_META = {
  title: 'Noxen Cloud — Know what deserves today',
  description:
    'A daily brief for builders juggling more than one project. Three Now slots, stall warnings, and the next action that deserves you today.',
} as const;

export type PreviewNowCard = {
  name: string;
  stage: string;
  health: string;
  nextAction: string;
  progress: number;
  rotting?: string;
};

export type PreviewNowSlot = PreviewNowCard | { empty: true; claim?: string };

export type PreviewSceneId = 'portfolio' | 'compose' | 'brief';

export type PreviewScene = {
  id: PreviewSceneId;
  durationMs: number;
  claimedLabel: string;
  brief: { name: string; why: string; nextAction: string };
  now: PreviewNowSlot[];
  attention: { label: string; name: string; detail: string };
  compose?: { name: string; nextAction: string };
};

const BILLING: PreviewNowCard = {
  name: 'Billing portal',
  stage: 'Building',
  health: 'On track',
  nextAction: 'Ship the invoice PDF',
  progress: 62,
};

const CLIENT: PreviewNowCard = {
  name: 'Client portal',
  stage: 'Testing',
  health: 'At risk',
  nextAction: 'Fix the SSO callback',
  progress: 81,
};

const STATUS: PreviewNowCard = {
  name: 'Status page',
  stage: 'Exploring',
  health: 'On track',
  nextAction: 'Write the incident banner',
  progress: 8,
};

const DOCS_ATTENTION = {
  label: 'Rotting',
  name: 'Docs site',
  detail: 'quiet 11d',
} as const;

export const PREVIEW_SCENES: PreviewScene[] = [
  {
    id: 'portfolio',
    durationMs: 5000,
    claimedLabel: '2 projects claimed for today',
    brief: {
      name: 'Billing portal',
      why: 'Due this week',
      nextAction: 'Ship the invoice PDF',
    },
    now: [BILLING, CLIENT, { empty: true, claim: 'Docs site' }],
    attention: DOCS_ATTENTION,
  },
  {
    id: 'compose',
    durationMs: 8000,
    claimedLabel: '2 projects claimed for today',
    brief: {
      name: 'Billing portal',
      why: 'Due this week',
      nextAction: 'Ship the invoice PDF',
    },
    now: [BILLING, CLIENT, { empty: true }],
    attention: DOCS_ATTENTION,
    compose: {
      name: STATUS.name,
      nextAction: STATUS.nextAction,
    },
  },
  {
    id: 'brief',
    durationMs: 5000,
    claimedLabel: '3 projects claimed for today',
    brief: {
      name: STATUS.name,
      why: 'Just added',
      nextAction: STATUS.nextAction,
    },
    now: [BILLING, CLIENT, STATUS],
    attention: DOCS_ATTENTION,
  },
];

export const PREVIEW_LOOP_MS = PREVIEW_SCENES.reduce((sum, scene) => sum + scene.durationMs, 0);

export const COMPOSE_MS_PER_CHAR = 70;
export const COMPOSE_PAUSE_MS = 400;

export type PreviewClock = {
  scene: PreviewScene;
  elapsedInScene: number;
  loopMs: number;
};

export function previewClock(elapsedMs: number, scenes: PreviewScene[] = PREVIEW_SCENES): PreviewClock {
  const loopMs = scenes.reduce((sum, scene) => sum + scene.durationMs, 0);
  if (loopMs <= 0) {
    return { scene: scenes[0], elapsedInScene: 0, loopMs: 0 };
  }
  let t = ((elapsedMs % loopMs) + loopMs) % loopMs;
  for (const scene of scenes) {
    if (t < scene.durationMs) return { scene, elapsedInScene: t, loopMs };
    t -= scene.durationMs;
  }
  const last = scenes[scenes.length - 1];
  return { scene: last, elapsedInScene: last.durationMs, loopMs };
}

export type ComposeProgress = {
  name: string;
  nextAction: string;
  phase: 'name' | 'action' | 'done';
};

export function composeProgress(elapsedInSceneMs: number, compose: { name: string; nextAction: string }): ComposeProgress {
  const nameTime = compose.name.length * COMPOSE_MS_PER_CHAR;
  const actionTime = compose.nextAction.length * COMPOSE_MS_PER_CHAR;
  if (elapsedInSceneMs < nameTime) {
    const n = Math.max(0, Math.floor(elapsedInSceneMs / COMPOSE_MS_PER_CHAR));
    return { name: compose.name.slice(0, n), nextAction: '', phase: 'name' };
  }
  if (elapsedInSceneMs < nameTime + COMPOSE_PAUSE_MS) {
    return { name: compose.name, nextAction: '', phase: 'action' };
  }
  const intoAction = elapsedInSceneMs - nameTime - COMPOSE_PAUSE_MS;
  if (intoAction < actionTime) {
    const n = Math.max(0, Math.floor(intoAction / COMPOSE_MS_PER_CHAR));
    return { name: compose.name, nextAction: compose.nextAction.slice(0, n), phase: 'action' };
  }
  return { name: compose.name, nextAction: compose.nextAction, phase: 'done' };
}

export function isNowCard(slot: PreviewNowSlot): slot is PreviewNowCard {
  return !('empty' in slot);
}
