/**
 * contact-worker  (save as index.js on the `worker` branch)
 *
 * Route:     pramishpaudel.com.np/api/*
 * Env vars:  RESEND_API_KEY          (secret)
 *            TURNSTILE_SECRET_KEY    (secret)
 * KV binding: RATE_LIMIT             (KV namespace, for the 1-per-day limit)
 */

const SITE_ORIGIN = "https://pramishpaudel.com.np";
const ALLOWED_ORIGINS = [SITE_ORIGIN, "https://www.pramishpaudel.com.np"];
const TO_EMAIL = "harutokutoda8@gmail.com";
const FROM_EMAIL = "Portfolio Contact <onboarding@resend.dev>";
const DAY_SECONDS = 60 * 60 * 24;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";
    const cors = {
      "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : SITE_ORIGIN,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Vary": "Origin",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    if (url.pathname !== "/api/contact") {
      return json({ error: "Not found." }, 404, cors);
    }
    if (request.method !== "POST") {
      return json({ error: "Method not allowed." }, 405, cors);
    }

    // ---- Parse body ----
    let body;
    try {
      const raw = await request.text();
      if (raw.length > 10000) {
        return json({ error: "Request too large." }, 413, cors);
      }
      body = JSON.parse(raw);
    } catch {
      return json({ error: "Invalid request." }, 400, cors);
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return json({ error: "Invalid request." }, 400, cors);
    }

    // ---- Honeypot: bots fill this hidden field. Pretend success. ----
    if (typeof body.company === "string" && body.company.trim() !== "") {
      return json({ ok: true }, 200, cors);
    }

    // ---- Validate ----
    const name = str(body.name);
    const email = str(body.email);
    const message = str(body.message);
    const token = str(body.turnstileToken);

    if (!name || !email || !message) {
      return json({ error: "Name, email and message are required." }, 400, cors);
    }
    if (name.length < 2 || name.length > 100) {
      return json({ error: "Please enter a valid name." }, 400, cors);
    }
    if (email.length > 254 || !EMAIL_RE.test(email)) {
      return json({ error: "Please enter a valid email address." }, 400, cors);
    }
    if (message.length < 10 || message.length > 2000) {
      return json({ error: "Message must be between 10 and 2000 characters." }, 400, cors);
    }

    // ---- One message per day, per IP (checked first: cheap, saves a Turnstile call) ----
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    const limitKey = "rl:" + (await sha256(ipKey(ip)));

    if (env.RATE_LIMIT) {
      const already = await env.RATE_LIMIT.get(limitKey);
      if (already) {
        return json(
          { error: "You've already sent a message today. Please try again tomorrow." },
          429,
          cors
        );
      }
    }

    // ---- Turnstile verification ----
    if (!token) {
      return json({ error: "Please complete the verification check." }, 400, cors);
    }
    const verified = await verifyTurnstile(token, ip, env.TURNSTILE_SECRET_KEY);
    if (!verified) {
      return json({ error: "Verification failed. Please try again." }, 403, cors);
    }

    // ---- Send via Resend ----
    const safeName = name.replace(/[\r\n]+/g, " ");
    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [TO_EMAIL],
        reply_to: email,
        subject: `New portfolio message from ${safeName}`,
        text: `Name: ${safeName}\nEmail: ${email}\n\n${message}`,
        html:
          `<p><strong>Name:</strong> ${escapeHtml(safeName)}</p>` +
          `<p><strong>Email:</strong> ${escapeHtml(email)}</p>` +
          `<p style="white-space:pre-wrap">${escapeHtml(message)}</p>`,
      }),
    });

    if (!resendRes.ok) {
      console.error("Resend error:", resendRes.status, await resendRes.text());
      return json(
        { error: "Couldn't send your message right now. Please try again later." },
        502,
        cors
      );
    }

    // Only lock the sender out after the email actually went through
    if (env.RATE_LIMIT) {
      await env.RATE_LIMIT.put(limitKey, "1", { expirationTtl: DAY_SECONDS });
    }

    return json({ ok: true }, 200, cors);
  },
};

/* ---------- helpers ---------- */

function json(data, status, headers) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function str(v) {
  return typeof v === "string" ? v.trim() : "";
}

function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// IPv6 users often get a new address every few hours inside the same home
// network, so limit by the /64 prefix (first 4 groups) instead of the full address.
function ipKey(ip) {
  if (!ip.includes(":")) return ip;
  const [head, tail = ""] = ip.split("::");
  const h = head ? head.split(":") : [];
  const t = tail ? tail.split(":") : [];
  const groups = ip.includes("::")
    ? [...h, ...Array(Math.max(8 - h.length - t.length, 0)).fill("0"), ...t]
    : ip.split(":");
  return groups.slice(0, 4).map((g) => g.padStart(4, "0")).join(":");
}

async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function verifyTurnstile(token, ip, secret) {
  if (!secret) return false;
  const form = new FormData();
  form.append("secret", secret);
  form.append("response", token);
  if (ip && ip !== "unknown") form.append("remoteip", ip);

  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: form,
    });
    const data = await res.json();
    return data.success === true;
  } catch (err) {
    console.error("Turnstile verify error:", err);
    return false;
  }
}
