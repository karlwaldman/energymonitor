# energymonitor public pageview measurement

PostHog project 271538 is shared with OilPriceAPI and filtered by `$host = 'energy-monitor.app'` or `'www.energy-monitor.app'`. A dedicated-project creation attempt was rejected by the plan's project limit on 2026-10-11; no plan upgrade was made. Set the public write-only token in production VITE_POSTHOG_KEY (never commit it). Missing config disables tracking.

Public routes are allowlisted, production hostnames required, URLs exclude queries/fragments, referrers keep only hostname, DNT/GPC disable capture. There are no cookies, persistent IDs, person profiles or replay. Full reload resets the random memory-only ID. Internal/private/payment pages and newly introduced unlisted routes cannot capture. Smoke automation is marked; unclassified traffic is not proof of human demand.

Valid from first observed production delivery after release. Acceptance: fresh visitor homepage and client navigation each arrive once with correct host/path; a private route and DNT/GPC visitor produce no POST. Query PostHog after the real browser smoke and exclude automation/bots/internal traffic for behavioral readouts. GSC remains organic click/impression truth source; pageview counts are not unique visitors or conversion.

Run `node --test tests/posthog.check.mjs` for sanitized outbound HTTP and negative-path checks. Until production rows are observed, implementation/tests do not mean deployed or verified.
