import { clerkClient } from '@clerk/nextjs/server';
import { getOrCreatePreferences } from '../../db/digest-service';
import { renderAlert, type AlertKind } from '../email/render-alert';
import { sendEmail } from '../email/send';

/**
 * Delivers a monitor state change to the people who should hear about it.
 *
 * Shared by the scheduled sweep and the manual "check now" button so both
 * alert on exactly the same terms — a transition discovered by a person
 * clicking a button is the same event as one discovered by the cron.
 *
 * Recipients are resolved by the caller (`alertRecipients` in
 * `monitor-service`), keeping this free of database concerns.
 */

export type AlertDelivery = {
  recipients: string[];
  kind: AlertKind;
  projectName: string;
  url: string;
  error: string | null;
  /** How long it had been down, for a recovery message. */
  downForMs: number | null;
  appUrl: string;
};

/**
 * Returns the addresses actually mailed. Failures are logged rather than
 * thrown: one undeliverable address must not stop a sweep, and must not turn a
 * successful check into a failed request.
 */
export async function sendAlerts(input: AlertDelivery): Promise<string[]> {
  if (input.recipients.length === 0) return [];

  // Addresses live in Clerk, not in our database.
  const client = await clerkClient();
  const { data: users } = await client.users.getUserList({
    userId: input.recipients,
    limit: input.recipients.length,
  });

  const notified: string[] = [];

  for (const user of users) {
    const address = user.primaryEmailAddress;
    if (!address?.emailAddress || address.verification?.status !== 'verified') continue;

    const prefs = await getOrCreatePreferences(user.id);
    const unsubscribeUrl = `${input.appUrl}/api/email/unsubscribe?token=${prefs.unsubscribeToken}&kind=uptime`;

    const email = renderAlert({
      kind: input.kind,
      projectName: input.projectName,
      url: input.url,
      error: input.error,
      downForMs: input.downForMs,
      appUrl: input.appUrl,
      unsubscribeUrl,
    });

    const sent = await sendEmail({
      to: address.emailAddress,
      subject: email.subject,
      html: email.html,
      text: email.text,
      unsubscribeUrl,
    });

    if (sent.status === 'sent') notified.push(address.emailAddress);
    else console.warn('[uptime] alert not delivered', user.id, sent);
  }

  return notified;
}
