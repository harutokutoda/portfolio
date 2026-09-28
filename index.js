// index.js — TEMPORARY DEBUG VERSION (shows the real Resend error in the response)

export default {
  async fetch(request, env) {
    const ALLOWED_ORIGIN = "https://pramishpaudel.com.np";
    const origin = request.headers.get("Origin");
    const corsHeaders = {
      "Access-Control-Allow-Origin": origin === ALLOWED_ORIGIN ? ALLOWED_ORIGIN : "",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };
    const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }
    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
    }

    try {
      const clientIP = request.headers.get("CF-Connecting-IP") || "unknown";
      const body = await request.json();
      const { name, email, message } = body;

      // Honeypot (accepts either field name)
      if (body.honeypot || body.company) {
        return new Response(JSON.stringify({ success: true }), { status: 200, headers: jsonHeaders });
      }

      if (!name?.trim() || !email?.trim() || !message?.trim()) {
        return new Response(JSON.stringify({ error: "All fields are required." }), {
          status: 400,
          headers: jsonHeaders,
        });
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return new Response(JSON.stringify({ error: "Please enter a valid email address." }), {
          status: 400,
          headers: jsonHeaders,
        });
      }

      // DEBUG: tell us if the API key variable is missing
      if (!env.RESEND_API_KEY) {
        return new Response(
          JSON.stringify({ error: "DEBUG: RESEND_API_KEY is not set on this Worker." }),
          { status: 500, headers: jsonHeaders }
        );
      }

      const resendResponse = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "Portfolio Contact <onboarding@resend.dev>",
          to: "harutokutoda8@gmail.com",
          subject: `New Portfolio Message from ${name}`,
          text: `Sender IP: ${clientIP}\nName: ${name}\nEmail: ${email}\n\nMessage:\n${message}`,
        }),
      });

      if (!resendResponse.ok) {
        const errorDetails = await resendResponse.text();
        console.error(`Resend API Error [${resendResponse.status}]:`, errorDetails);
        // DEBUG: show the real reason
        return new Response(
          JSON.stringify({ error: `DEBUG Resend ${resendResponse.status}: ${errorDetails}` }),
          { status: 502, headers: jsonHeaders }
        );
      }

      return new Response(
        JSON.stringify({ success: true, message: "Message sent successfully!" }),
        { status: 200, headers: jsonHeaders }
      );
    } catch (err) {
      console.error("Worker Execution Error:", err.stack || err.message || err);
      // DEBUG: show the real reason
      return new Response(
        JSON.stringify({ error: `DEBUG Worker error: ${err.message || err}` }),
        { status: 500, headers: jsonHeaders }
      );
    }
  },
};
