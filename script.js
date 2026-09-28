/**
 * script.js — all site behavior in one file
 *  1. Page preloader
 *  2. Scroll reveal (.r elements)
 *  3. Contact form (Direct Message toggle + submit)
 */

/* ========== 1. PAGE PRELOADER ========== */

(() => {
  const preloader = document.getElementById("preloader");
  if (!preloader) return;

  const MIN_DISPLAY_MS = 150;
  const startTime = Date.now();

  function hidePreloader() {
    const elapsed = Date.now() - startTime;
    const remaining = Math.max(MIN_DISPLAY_MS - elapsed, 0);

    setTimeout(() => {
      preloader.classList.add("is-hidden");
      document.body.classList.add("is-loaded");

      // Remove from the DOM after the fade transition finishes
      preloader.addEventListener(
        "transitionend",
        () => preloader.remove(),
        { once: true }
      );
    }, remaining);
  }

  // Hide as soon as the DOM is parsed rather than waiting for every
  // image/font to finish (window "load") — the page is already
  // visually ready at that point, so waiting longer just feels slow.
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", hidePreloader);
  } else {
    hidePreloader();
  }
})();

/* ========== 2. SCROLL REVEAL ========== */
/* Same fade/slide look, but flicker-free: visibility is decided from each
   element's *layout* position (offsetTop, which ignores CSS transforms),
   so the slide animation can never push an element back across the
   trigger line and toggle it on/off repeatedly. */

(() => {
  const targets = Array.from(document.querySelectorAll(".r"));
  if (!targets.length) return;

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  // Cached layout positions (page coordinates, unaffected by transforms)
  let metrics = [];

  function pageTop(el) {
    let y = 0;
    while (el) {
      y += el.offsetTop;
      el = el.offsetParent;
    }
    return y;
  }

  function measure() {
    metrics = targets.map((el) => {
      const top = pageTop(el);
      return { el, top, bottom: top + el.offsetHeight };
    });
    update();
  }

  let ticking = false;

  function update() {
    ticking = false;
    const vh = window.innerHeight;
    const y = window.scrollY;
    const atBottom = y + vh >= document.documentElement.scrollHeight - 4;

    for (const m of metrics) {
      const top = m.top - y;      // distance from viewport top to element top
      const bottom = m.bottom - y;

      // Appears once its top rises above 81% of the screen (so the
      // animation plays in plain view), and fades out again once it has
      // scrolled up past the top 22% of the screen.
      const visible =
        (top < vh * 0.81 || (atBottom && top < vh)) && bottom > vh * 0.22;

      if (visible !== m.on) {
        m.on = visible;
        m.el.classList.toggle("in-view", visible);
      }
    }
  }

  function requestUpdate() {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  }

  window.addEventListener("scroll", requestUpdate, { passive: true });
  window.addEventListener("resize", measure);
  window.addEventListener("load", measure);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
  // Re-measure if the page height changes (e.g. the Direct Message panel opens)
  if ("ResizeObserver" in window) {
    new ResizeObserver(measure).observe(document.body);
  }
  measure();
})();

/* ========== 3. CONTACT FORM ========== */

(() => {
  const API_ENDPOINT = "/api/contact";
  // Public key from Cloudflare Dashboard → Turnstile → your widget
  const TURNSTILE_SITE_KEY = "0x4AAAAAAFGPoCCNzJ8elzX1";
  const DAILY_KEY = "dm_last_sent";
  const DAY_MS = 24 * 60 * 60 * 1000;

  const toggleBtn = document.getElementById("dm-toggle");
  const panel = document.getElementById("dm-panel");
  const form = document.getElementById("contact-form");
  if (!form) return;

  const submitBtn = document.getElementById("submit-btn");
  const statusEl = document.getElementById("form-status");

  const fields = {
    name: form.elements.name,
    email: form.elements.email,
    message: form.elements.message,
  };

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  /* ---------- Turnstile ---------- */

  let widgetId = null;
  let turnstileToken = "";

  function renderTurnstile(attempt = 0) {
    if (widgetId !== null) return;
    const box = document.getElementById("turnstile-box");
    if (!box) return;
    if (!window.turnstile) {
      // Turnstile script still loading — retry for up to ~10s
      if (attempt < 50) setTimeout(() => renderTurnstile(attempt + 1), 200);
      return;
    }
    widgetId = window.turnstile.render(box, {
      sitekey: TURNSTILE_SITE_KEY,
      theme: "light",
      callback: (token) => {
        turnstileToken = token;
        const err = form.querySelector('[data-error-for="turnstile"]');
        if (err) err.textContent = "";
      },
      "expired-callback": () => { turnstileToken = ""; },
      "error-callback": () => { turnstileToken = ""; },
    });
  }

  function resetTurnstile() {
    turnstileToken = "";
    if (widgetId !== null && window.turnstile) window.turnstile.reset(widgetId);
  }

  /* ---------- One message per day (browser side) ---------- */

  function sentToday() {
    try {
      const t = Number(localStorage.getItem(DAILY_KEY));
      return t > 0 && Date.now() - t < DAY_MS;
    } catch {
      return false;
    }
  }

  function markSent() {
    try {
      localStorage.setItem(DAILY_KEY, String(Date.now()));
    } catch {
      /* storage blocked — the server-side limit still applies */
    }
  }

  function applyLimitState() {
    if (sentToday()) {
      setStatus("info", "You've already sent a message today — thanks! Please come back tomorrow.");
      submitBtn.disabled = true;
    }
  }

  /* ---------- Toggle panel ---------- */

  if (toggleBtn && panel) {
    toggleBtn.addEventListener("click", () => {
      const isOpen = toggleBtn.getAttribute("aria-expanded") === "true";

      if (isOpen) {
        panel.classList.remove("is-open");
        toggleBtn.setAttribute("aria-expanded", "false");
        toggleBtn.querySelector(".dm-toggle__label").textContent = "Direct Message";
        panel.addEventListener(
          "transitionend",
          () => {
            if (!panel.classList.contains("is-open")) panel.hidden = true;
          },
          { once: true }
        );
      } else {
        panel.hidden = false;
        panel.offsetHeight; // force layout so the open transition plays
        panel.classList.add("is-open");
        toggleBtn.setAttribute("aria-expanded", "true");
        toggleBtn.querySelector(".dm-toggle__label").textContent = "✕ Close";
        renderTurnstile();
        applyLimitState();
        const nameInput = document.getElementById("name");
        if (nameInput && !sentToday()) {
          setTimeout(() => nameInput.focus(), 350);
        }
      }
    });
  }

  /* ---------- Validation + status helpers ---------- */

  function clearFieldErrors() {
    form.querySelectorAll(".form-field__error").forEach((el) => {
      el.textContent = "";
    });
    Object.values(fields).forEach((f) => f.classList.remove("is-invalid"));
  }

  function setFieldError(name, message) {
    const el = form.querySelector(`[data-error-for="${name}"]`);
    if (el) el.textContent = message;
    if (fields[name]) fields[name].classList.add("is-invalid");
  }

  function validate() {
    clearFieldErrors();
    let isValid = true;

    const name = fields.name.value.trim();
    const email = fields.email.value.trim();
    const message = fields.message.value.trim();

    if (name.length < 2) {
      setFieldError("name", "Please enter your name.");
      isValid = false;
    }
    if (!EMAIL_RE.test(email)) {
      setFieldError("email", "Please enter a valid email address.");
      isValid = false;
    }
    if (message.length < 10) {
      setFieldError("message", "Message should be at least 10 characters.");
      isValid = false;
    }
    if (!turnstileToken) {
      setFieldError("turnstile", "Please complete the verification check.");
      isValid = false;
    }
    return isValid;
  }

  function setStatus(type, text) {
    statusEl.hidden = false;
    statusEl.textContent = text;
    statusEl.className = `form-status form-status--${type}`;
  }

  function clearStatus() {
    statusEl.hidden = true;
    statusEl.textContent = "";
    statusEl.className = "form-status";
  }

  function setLoading(isLoading) {
    submitBtn.disabled = isLoading;
    submitBtn.classList.toggle("is-loading", isLoading);
    submitBtn.querySelector(".btn-submit__label").textContent = isLoading
      ? "Sending..."
      : "Send message";
  }

  /* ---------- Submit ---------- */

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearStatus();

    // Honeypot — real users never see this field
    const honeypot = form.elements.company;
    if (honeypot && honeypot.value.trim() !== "") {
      form.reset();
      return;
    }

    if (sentToday()) {
      applyLimitState();
      return;
    }

    if (!validate()) {
      setStatus("error", "Please fix the highlighted fields and try again.");
      return;
    }

    const payload = {
      name: fields.name.value.trim(),
      email: fields.email.value.trim(),
      message: fields.message.value.trim(),
      company: honeypot ? honeypot.value : "",
      turnstileToken,
    };

    setLoading(true);

    try {
      const response = await fetch(API_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      let data = null;
      try {
        data = await response.json();
      } catch {
        /* non-JSON body */
      }

      if (!response.ok) {
        // 429 = the server says this device/network already sent one today
        if (response.status === 429) markSent();
        setStatus(
          "error",
          (data && data.error) ||
            "Something went wrong on the server. Please try again in a moment."
        );
        resetTurnstile();
        return;
      }

      markSent();
      setStatus("success", "Thanks — your message has been sent. I'll reply soon.");
      form.reset();
      resetTurnstile();
    } catch (err) {
      setStatus("error", "Couldn't reach the server. Check your connection and try again.");
      resetTurnstile();
    } finally {
      setLoading(false);
      if (sentToday()) submitBtn.disabled = true;
    }
  });

  Object.entries(fields).forEach(([name, el]) => {
    el.addEventListener("input", () => {
      const errorEl = form.querySelector(`[data-error-for="${name}"]`);
      if (errorEl && errorEl.textContent) {
        errorEl.textContent = "";
        el.classList.remove("is-invalid");
      }
    });
  });
})();
