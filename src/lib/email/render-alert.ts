/**
 * Turns a monitor state change into a sendable email.
 *
 * Pure and provider-agnostic, like `render-digest.ts`: it takes a described
 * event and returns strings, so the wording can be tested without a mail
 * provider and without a database.
 */

export type AlertKind = 'down' | 'up';

export type AlertInput = {
  kind: AlertKind;
  projectName: string;
  url: string;
  /** Why the last check failed. Absent on a recovery. */
  error?: string | null;
  /** How long it had been down, in ms. Absent when not known. */
  downForMs?: number | null;
  appUrl: string;
  unsubscribeUrl: string;
};

export type AlertEmail = {
  subject: string;
  html: string;
  text: string;
};

/** Escapes text before it is placed in HTML. Names and URLs are user input. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** "4 minutes", "2 hours", "3 days" — one unit is enough in a subject line. */
export function formatDuration(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return 'less than a minute';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'}`;

  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'}`;
}

export function subjectFor(input: AlertInput): string {
  return input.kind === 'down'
    ? `${input.projectName} is down`
    : `${input.projectName} is back up`;
}

function textFor(input: AlertInput): string {
  const lines: string[] = [];

  if (input.kind === 'down') {
    lines.push(`${input.projectName} stopped responding.`);
    lines.push('');
    lines.push(`URL: ${input.url}`);
    if (input.error) lines.push(`Error: ${input.error}`);
  } else {
    lines.push(`${input.projectName} is responding again.`);
    lines.push('');
    lines.push(`URL: ${input.url}`);
    if (typeof input.downForMs === 'number') {
      lines.push(`It was down for ${formatDuration(input.downForMs)}.`);
    }
  }

  lines.push('');
  lines.push(`See the history: ${input.appUrl}/dashboard`);
  lines.push('');
  lines.push(`Turn these alerts off: ${input.unsubscribeUrl}`);

  return lines.join('\n');
}

const COLORS = {
  down: { accent: '#ef4444', label: 'DOWN' },
  up: { accent: '#22c55e', label: 'RECOVERED' },
} as const;

function htmlFor(input: AlertInput): string {
  const tone = COLORS[input.kind];
  const name = escapeHtml(input.projectName);
  const url = escapeHtml(input.url);

  const detail =
    input.kind === 'down'
      ? input.error
        ? `<p style="margin:0 0 6px;font-size:14px;color:#52525b;">${escapeHtml(input.error)}</p>`
        : ''
      : typeof input.downForMs === 'number'
        ? `<p style="margin:0 0 6px;font-size:14px;color:#52525b;">Down for ${escapeHtml(
            formatDuration(input.downForMs)
          )}.</p>`
        : '';

  return `<!doctype html>
<html>
  <body style="margin:0;background:#fafafa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
    <div style="max-width:520px;margin:32px auto;padding:24px;background:#fff;border:1px solid #e4e4e7;border-radius:12px;">
      <span style="display:inline-block;padding:3px 8px;border-radius:999px;background:${
        tone.accent
      };color:#fff;font-size:11px;font-weight:600;letter-spacing:0.06em;">${tone.label}</span>
      <h1 style="margin:14px 0 4px;font-size:18px;color:#18181b;">${name} ${
        input.kind === 'down' ? 'is down' : 'is back up'
      }</h1>
      <p style="margin:0 0 6px;font-size:14px;color:#52525b;word-break:break-all;">${url}</p>
      ${detail}
      <a href="${escapeHtml(input.appUrl)}/dashboard"
         style="display:inline-block;margin-top:16px;padding:9px 14px;border-radius:8px;background:#8b7cf6;color:#fff;font-size:14px;text-decoration:none;">
        See the history
      </a>
      <p style="margin:22px 0 0;font-size:12px;color:#a1a1aa;">
        <a href="${escapeHtml(
          input.unsubscribeUrl
        )}" style="color:#a1a1aa;">Turn off uptime alerts</a>
      </p>
    </div>
  </body>
</html>`;
}

export function renderAlert(input: AlertInput): AlertEmail {
  return {
    subject: subjectFor(input),
    html: htmlFor(input),
    text: textFor(input),
  };
}
