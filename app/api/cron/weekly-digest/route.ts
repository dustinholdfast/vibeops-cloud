import { NextResponse } from 'next/server';
import { clerkClient } from '@clerk/nextjs/server';
import {
  buildDigestFor,
  digestStorageReady,
  findDigestRecipients,
  getOrCreatePreferences,
  recordDigestSent,
} from '@/src/db/digest-service';
import { hasSomethingToSay, renderDigest } from '@/src/lib/email/render-digest';
import { isEmailConfigured, sendEmail } from '@/src/lib/email/send';

/**
 * Sends the weekly digest.
 *
 * Deliberately safe by default: this only sends when called with `?send=1`.
 * Without it the run is a dry run that reports exactly who *would* be mailed and
 * with what subject, so the job can be scheduled, inspected and trusted before
 * it is allowed to reach anyone.
 */

export const maxDuration = 60;

/** How many recipients one invocation will process. */
const BATCH_LIMIT = 200;

type Outcome = {
  userId: string;
  email?: string;
  subject?: string;
  result: string;
};

function authorised(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  // Refuse rather than run unauthenticated if no secret is configured.
  if (!secret) return false;
  const header = req.headers.get('authorization');
  return header === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!authorised(req)) {
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  const url = new URL(req.url);
  const send = url.searchParams.get('send') === '1';

  let storageReady: boolean;
  try {
    storageReady = await digestStorageReady();
  } catch (error) {
    // Distinguished from a missing table on purpose: a digest that mails
    // nobody every week because the database is unreachable should say so.
    console.error('[digest] database unreachable', error);
    return NextResponse.json(
      {
        error: 'The database could not be reached. This is not a missing migration.',
        code: 'DATABASE_UNAVAILABLE',
      },
      { status: 503 }
    );
  }

  if (!storageReady) {
    return NextResponse.json(
      {
        error: 'email_preferences is missing. Apply scripts/email-preferences.sql.',
        code: 'MIGRATION_REQUIRED',
      },
      { status: 503 }
    );
  }

  const now = new Date();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? url.origin;

  try {
    const recipients = (await findDigestRecipients(now)).slice(0, BATCH_LIMIT);
    const outcomes: Outcome[] = [];

    // Addresses live in Clerk, not in our database.
    const client = await clerkClient();
    const { data: users } = recipients.length
      ? await client.users.getUserList({ userId: recipients, limit: recipients.length })
      : { data: [] };
    const byId = new Map(users.map((user) => [user.id, user]));

    for (const userId of recipients) {
      const user = byId.get(userId);
      const address = user?.primaryEmailAddress;

      if (!address?.emailAddress) {
        outcomes.push({ userId, result: 'skipped: no email address on the account' });
        continue;
      }
      if (address.verification?.status !== 'verified') {
        outcomes.push({ userId, result: 'skipped: email address is not verified' });
        continue;
      }

      const digest = await buildDigestFor(userId, now);
      if (!hasSomethingToSay(digest.workspaces)) {
        outcomes.push({ userId, result: 'skipped: nothing to report this week' });
        continue;
      }

      const prefs = await getOrCreatePreferences(userId);
      const unsubscribeUrl = `${appUrl}/api/email/unsubscribe?token=${prefs.unsubscribeToken}`;
      const email = renderDigest({
        workspaces: digest.workspaces,
        appUrl,
        unsubscribeUrl,
        firstName: user?.firstName ?? undefined,
      });

      if (!send) {
        outcomes.push({
          userId,
          email: address.emailAddress,
          subject: email.subject,
          result: 'dry run: would send',
        });
        continue;
      }

      const sent = await sendEmail({
        to: address.emailAddress,
        subject: email.subject,
        html: email.html,
        text: email.text,
        unsubscribeUrl,
      });

      // Only a confirmed send is recorded, so a failure is retried next run
      // rather than silently skipped for a week.
      if (sent.status === 'sent') await recordDigestSent(userId, now);

      outcomes.push({
        userId,
        email: address.emailAddress,
        subject: email.subject,
        result: sent.status === 'sent' ? 'sent' : `${sent.status}: ${'error' in sent ? sent.error : sent.reason}`,
      });
    }

    return NextResponse.json({
      ok: true,
      mode: send ? 'send' : 'dry-run',
      emailConfigured: isEmailConfigured(),
      considered: recipients.length,
      sent: outcomes.filter((o) => o.result === 'sent').length,
      outcomes,
    });
  } catch (error) {
    console.error('[weekly-digest] run failed', error);
    return NextResponse.json(
      { error: 'The digest run failed.', code: 'DIGEST_FAILED' },
      { status: 500 }
    );
  }
}
