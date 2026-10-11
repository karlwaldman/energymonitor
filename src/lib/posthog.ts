/** Cookieless pageview delivery for the shared portfolio project (filter by hostname). */
export interface PageviewContext {
  hostname: string;
  pathname: string;
  referrer: string;
  doNotTrack?: string | null;
  globalPrivacyControl?: boolean;
  automation?: boolean;
  distinctId: string;
}

export async function capturePublicPageview(
  key: string | undefined,
  context: PageviewContext,
  send: typeof fetch = fetch,
): Promise<'sent' | 'disabled' | 'failed'> {
  if (
    !key?.trim() || context.doNotTrack === '1' || context.globalPrivacyControl ||
    !['energy-monitor.app', 'www.energy-monitor.app'].includes(context.hostname) ||
    context.pathname !== '/'
  ) return 'disabled';

  let referrerHost = '$direct';
  try { referrerHost = new URL(context.referrer).hostname; } catch { /* No referrer. */ }
  // Never send queries, fragments, form contents, email addresses, or account IDs.
  const pathname = context.pathname.split(/[?#]/)[0];
  try {
    const result = await send('https://us.i.posthog.com/i/v0/e/', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      credentials: 'omit',
      keepalive: true,
      body: JSON.stringify({
        api_key: key.trim(),
        event: '$pageview',
        distinct_id: context.distinctId,
        timestamp: new Date().toISOString(),
        properties: {
          $host: context.hostname,
          $pathname: pathname,
          $current_url: `https://${context.hostname}${pathname}`,
          $referring_domain: referrerHost,
          $process_person_profile: false,
          $lib: 'energymonitor-lite',
          traffic_type: context.automation ? 'automation' : 'unclassified',
          instrumentation_version: '2026-10-11',
        },
      }),
    });
    return result.ok ? 'sent' : 'failed';
  } catch { return 'failed'; }
}
