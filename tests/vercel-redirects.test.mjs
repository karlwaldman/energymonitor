import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const config = JSON.parse(
  readFileSync(new URL("../vercel.json", import.meta.url), "utf8"),
);
const CANONICAL_ORIGIN = "https://energy-monitor.app";
const WWW_HOST = "www.energy-monitor.app";

function wwwRule() {
  return (config.redirects ?? []).find((rule) =>
    (rule.has ?? []).some(
      (cond) => cond.type === "host" && cond.value === WWW_HOST,
    ),
  );
}

// Vercel anchors `source` and substitutes $1 with the first capture group.
function resolve(rule, path) {
  const match = new RegExp(`^${rule.source}$`).exec(path);
  return match ? rule.destination.replace("$1", match[1]) : null;
}

test("www host has a permanent redirect to the canonical apex", () => {
  const rule = wwwRule();
  assert.ok(rule, "vercel.json needs a redirect scoped to the www host");
  assert.equal(rule.permanent, true);
  assert.ok(rule.destination.startsWith(`${CANONICAL_ORIGIN}/`));
});

test("www redirect keeps the path", () => {
  const rule = wwwRule();
  assert.ok(rule);
  assert.equal(resolve(rule, "/"), `${CANONICAL_ORIGIN}/`);
  assert.equal(resolve(rule, "/settings.html"), `${CANONICAL_ORIGIN}/settings.html`);
  assert.equal(resolve(rule, "/robots.txt"), `${CANONICAL_ORIGIN}/robots.txt`);
  assert.equal(resolve(rule, "/apidocs"), `${CANONICAL_ORIGIN}/apidocs`);
});

test("www redirect leaves /api/* alone so API callers on www keep working", () => {
  const rule = wwwRule();
  assert.ok(rule);
  assert.equal(resolve(rule, "/api/opa-prices"), null);
  assert.equal(resolve(rule, "/api/youtube/embed"), null);
});

test("no redirect applies to the apex host itself", () => {
  for (const rule of config.redirects ?? []) {
    const hosts = (rule.has ?? []).filter((cond) => cond.type === "host");
    assert.ok(hosts.length > 0, "every redirect must be host-scoped");
    for (const cond of hosts) assert.notEqual(cond.value, "energy-monitor.app");
  }
});
