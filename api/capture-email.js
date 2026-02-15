/**
 * Email Capture Edge Function
 * Stores newsletter signup emails in Upstash Redis
 */

import { getRedis } from "./_upstash-cache.js";

export const config = {
  runtime: "edge",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default async function handler(request) {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const { email, source = "direct", campaign = "" } = await request.json();

    if (!email || !EMAIL_RE.test(email)) {
      return new Response(JSON.stringify({ error: "Valid email required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const normalized = email.toLowerCase().trim();

    const r = await getRedis();
    if (!r) {
      // No Redis configured — log to console as fallback
      console.log("[Email] Captured (no Redis):", normalized, source);
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Store in a Redis hash for easy retrieval
    const entry = {
      email: normalized,
      source,
      campaign,
      timestamp: new Date().toISOString(),
    };

    // Use sorted set for chronological listing + hash for data
    const key = `em:email:${normalized}`;
    await r.set(key, JSON.stringify(entry));

    // Add to sorted set for listing all emails
    await r.zadd("em:emails", { score: Date.now(), member: normalized });

    console.log("[Email] Captured:", normalized, "source:", source);

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[Email] Error:", error.message);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
