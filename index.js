export default {
  async fetch(request, env) {
    // 1. Restrict CORS strictly to your domain
    const ALLOWED_ORIGIN = "https://pramishpaudel.com.np";
    const origin = request.headers.get("Origin");

    const corsHeaders = {
      "Access-Control-Allow-Origin": origin === ALLOWED_ORIGIN ? ALLOWED_ORIGIN : "",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    // Handle OPTIONS preflight request from browser
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // Only allow POST requests
    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
    }

    try {
      const clientIP = request.headers.get("CF-Connecting-IP") || "unknown";
      const { name, email, message, honeypot } = await request.json();

      // Spam Check 1: Honeypot field (hidden in UI, if filled = bot)
      if (honeypot) {
        return new Response(JSON.stringify({ success: true }), { status: 200, headers: corsHeaders });
      }

      // Spam Check 2: Require non-empty fields
      if (!name?.trim() || !email?.trim() || !message?.trim()) {
        return new Response(
          JSON.stringify({ error: "All fields are required." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // 2. Strict Email Format Validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return new Response(
          JSON.stringify({ error: "Please enter a valid email address." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // 3. Send email to your address via Resend API
      const resendResponse = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "Portfolio Contact <onboarding@resend.dev>",
          to: "harutokutoda8@gmail.com",
          subject: `New Portfolio Message from ${name}`,
          text: `Sender IP: ${clientIP}\nName: ${name}\nEmail: ${email}\n\nMessage:\n${message}`,
        }),
      });

      // Inspect Resend response for errors
      if (!resendResponse.ok) {
        const errorDetails = await resendResponse.text();
        console.error(`Resend API Error [${resendResponse.status}]:`, errorDetails);
        throw new Error(`Resend API failed: ${resendResponse.status}`);
      }

      return new Response(
        JSON.stringify({ success: true, message: "Message sent successfully!" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );

    } catch (err) {
      // Detailed logging for debugging in Cloudflare dashboard
      console.error("Worker Execution Error:", err.stack || err.message || err);

      return new Response(
        JSON.stringify({ error: "Server error. Please try again later." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  },
};
        
