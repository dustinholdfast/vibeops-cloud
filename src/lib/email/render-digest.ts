import type { PortfolioReview } from '../review';
import type { Project } from '../../types';

/**
 * Turns review data into a sendable email. Pure and provider-agnostic: it takes
 * already-computed reviews and returns strings, so the wording and the
 * "is this worth sending" rule can be tested without a mail provider.
 */

export type WorkspaceDigest = {
  workspaceId: string;
  name: string;
  personal: boolean;
  review: PortfolioReview;
};

export type DigestEmail = {
  subject: string;
  html: string;
  text: string;
};

export type DigestInput = {
  workspaces: WorkspaceDigest[];
  appUrl: string;
  unsubscribeUrl: string;
  /** Shown in the greeting when the account has a name. */
  firstName?: string;
};

/** Escapes text before it is placed in HTML. Project names are user input. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * A digest is worth sending when at least one workspace has something to report.
 * A week where nothing moved anywhere is not worth an email — except that
 * stalled work IS something to report, which is the whole point of the product.
 */
export function hasSomethingToSay(workspaces: WorkspaceDigest[]): boolean {
  return workspaces.some(
    ({ review }) =>
      review.shipped.length > 0 ||
      review.advanced.length > 0 ||
      review.slipped.length > 0 ||
      review.stalled.length > 0
  );
}

function subjectFor(workspaces: WorkspaceDigest[]): string {
  const shipped = workspaces.reduce((n, w) => n + w.review.shipped.length, 0);
  const stalled = workspaces.reduce((n, w) => n + w.review.stalled.length, 0);
  const slipped = workspaces.reduce((n, w) => n + w.review.slipped.length, 0);

  if (shipped > 0) {
    return `You shipped ${shipped} project${shipped === 1 ? '' : 's'} last week`;
  }
  if (slipped > 0) {
    return `${slipped} project${slipped === 1 ? '' : 's'} need${slipped === 1 ? 's' : ''} attention`;
  }
  if (stalled > 0) {
    return `${stalled} project${stalled === 1 ? '' : 's'} ${stalled === 1 ? 'has' : 'have'} gone quiet`;
  }
  return 'Your week in review';
}

const SECTIONS = [
  { key: 'shipped', label: 'Shipped', color: '#22c55e' },
  { key: 'advanced', label: 'Advanced', color: '#8b7cf6' },
  { key: 'slipped', label: 'Slipped', color: '#f59e0b' },
] as const;

function projectNames(projects: Project[]): string[] {
  return projects.map((project) => project.name);
}

function textFor(input: DigestInput): string {
  const lines: string[] = [];
  lines.push(input.firstName ? `Morning, ${input.firstName}.` : 'Morning.');
  lines.push('');

  for (const workspace of input.workspaces) {
    if (input.workspaces.length > 1) lines.push(`## ${workspace.name}`);
    lines.push(workspace.review.headline);
    lines.push('');

    for (const section of SECTIONS) {
      const names = projectNames(workspace.review[section.key]);
      if (names.length) lines.push(`${section.label}: ${names.join(', ')}`);
    }
    const stalled = workspace.review.stalled;
    if (stalled.length) {
      lines.push(
        `Stalled: ${stalled
          .map((entry) => `${entry.project.name} (${entry.staleDays}d)`)
          .join(', ')}`
      );
    }
    lines.push('');
  }

  lines.push(`Open your dashboard: ${input.appUrl}/dashboard`);
  lines.push(`Unsubscribe: ${input.unsubscribeUrl}`);
  return lines.join('\n');
}

function htmlFor(input: DigestInput): string {
  const blocks = input.workspaces
    .map((workspace) => {
      const rows: string[] = [];

      for (const section of SECTIONS) {
        const names = projectNames(workspace.review[section.key]);
        if (!names.length) continue;
        rows.push(
          `<tr>
             <td style="padding:6px 0;vertical-align:top;white-space:nowrap;">
               <span style="color:${section.color};font-weight:600;font-size:13px;">${section.label}</span>
             </td>
             <td style="padding:6px 0 6px 14px;color:#3f3f46;font-size:14px;">
               ${names.map(escapeHtml).join(', ')}
             </td>
           </tr>`
        );
      }

      if (workspace.review.stalled.length) {
        const stalled = workspace.review.stalled
          .map((entry) => `${escapeHtml(entry.project.name)} <span style="color:#a1a1aa;">${entry.staleDays}d</span>`)
          .join(', ');
        rows.push(
          `<tr>
             <td style="padding:6px 0;vertical-align:top;white-space:nowrap;">
               <span style="color:#71717a;font-weight:600;font-size:13px;">Stalled</span>
             </td>
             <td style="padding:6px 0 6px 14px;color:#3f3f46;font-size:14px;">${stalled}</td>
           </tr>`
        );
      }

      const heading =
        input.workspaces.length > 1
          ? `<p style="margin:0 0 4px;font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:#a1a1aa;">${escapeHtml(
              workspace.name
            )}</p>`
          : '';

      return `<div style="margin:0 0 28px;">
                ${heading}
                <p style="margin:0 0 10px;font-size:15px;color:#18181b;font-weight:600;">${escapeHtml(
                  workspace.review.headline
                )}</p>
                <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;">${rows.join(
                  ''
                )}</table>
              </div>`;
    })
    .join('');

  const greeting = input.firstName ? `Morning, ${escapeHtml(input.firstName)}.` : 'Morning.';

  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#fafafa;">
    <div style="display:none;max-height:0;overflow:hidden;">${escapeHtml(
      subjectFor(input.workspaces)
    )}</div>
    <table cellpadding="0" cellspacing="0" style="width:100%;background:#fafafa;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table cellpadding="0" cellspacing="0" style="width:100%;max-width:520px;background:#ffffff;border:1px solid #e4e4e7;border-radius:12px;">
            <tr>
              <td style="padding:28px 28px 8px;">
                <p style="margin:0 0 18px;font-size:13px;color:#71717a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
                  <strong style="color:#18181b;">Noxen</strong> · week in review
                </p>
                <p style="margin:0 0 20px;font-size:15px;color:#3f3f46;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">${greeting}</p>
                <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">${blocks}</div>
                <a href="${input.appUrl}/dashboard"
                   style="display:inline-block;background:#8b7cf6;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:14px;font-weight:600;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
                  Open your dashboard
                </a>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 28px 26px;">
                <p style="margin:0;font-size:12px;color:#a1a1aa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
                  <a href="${input.unsubscribeUrl}" style="color:#a1a1aa;">Unsubscribe from this weekly email</a>
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function renderDigest(input: DigestInput): DigestEmail {
  return {
    subject: subjectFor(input.workspaces),
    html: htmlFor(input),
    text: textFor(input),
  };
}
