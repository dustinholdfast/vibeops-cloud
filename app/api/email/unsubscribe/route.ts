import { NextResponse } from 'next/server';
import { unsubscribeByToken } from '@/src/db/digest-service';

/**
 * Unsubscribe by token. Public by design: a link in an email has to work
 * without signing in, possibly in a different browser to the one that is signed
 * in. The token grants nothing except turning this one setting off.
 */

function page(title: string, message: string, status: number) {
  const html = `<!doctype html>
<html>
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
  <body style="margin:0;background:#fafafa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
    <div style="max-width:440px;margin:80px auto;padding:28px;background:#fff;border:1px solid #e4e4e7;border-radius:12px;">
      <h1 style="margin:0 0 8px;font-size:17px;color:#18181b;">${title}</h1>
      <p style="margin:0 0 18px;font-size:14px;color:#52525b;line-height:1.5;">${message}</p>
      <a href="/dashboard" style="font-size:14px;color:#8b7cf6;">Back to your dashboard</a>
    </div>
  </body>
</html>`;
  return new NextResponse(html, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get('token') ?? '';
  try {
    const done = await unsubscribeByToken(token);
    return done
      ? page(
          'Unsubscribed',
          'You will not receive the weekly review email again. You can turn it back on any time from your dashboard.',
          200
        )
      : page(
          'That link did not work',
          'It may already have been used, or the address may have changed. You can change this setting from your dashboard instead.',
          404
        );
  } catch {
    return page(
      'Something went wrong',
      'We could not update your preferences just now. Please try again shortly.',
      503
    );
  }
}

/** RFC 8058 one-click: mail clients POST here without loading the page. */
export async function POST(req: Request) {
  const url = new URL(req.url);
  let token = url.searchParams.get('token') ?? '';

  if (!token) {
    const body = await req.text().catch(() => '');
    token = new URLSearchParams(body).get('token') ?? '';
  }

  const done = await unsubscribeByToken(token).catch(() => false);
  return NextResponse.json({ ok: done }, { status: done ? 200 : 400 });
}
