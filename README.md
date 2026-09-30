# Pramish Paudel — Portfolio

My personal site. Live at [pramishpaudel.com.np](https://pramishpaudel.com.np).

I'm 16, in 11th grade, and still pretty early in my dev journey. This is where I put the stuff I build — games, tools, random experiments, whatever I'm into at the time. If I get an idea I usually just try to build it, even if I don't fully know how yet. That's mostly how I've been learning.

## Stack

Nothing fancy, mostly because I wanted to actually understand what's happening under the hood instead of relying on a framework for everything:

- Plain HTML / CSS / JS — no build step, no framework
- Hosted on Cloudflare (Workers, serving static assets)
- Contact form backend is a separate Cloudflare Worker
- Emails go through [Resend](https://resend.com)
- Bot protection via Cloudflare Turnstile

## Repo structure

The repo is split across two branches:

- `main` — the actual site: `index.html`, `style.css`, `script.js`, plus config files (`robots.txt`, `sitemap.xml`, `_headers`, etc.)
- `worker` — the Cloudflare Worker that handles `/api/contact` and sends the email

They're deployed as two separate things on Cloudflare, so keeping them on separate branches made sense instead of mixing frontend and backend code in one folder.

## Contact form

Probably the most "backend-y" part of this repo. Quick rundown of how it works:

1. Form submits to `/api/contact` via fetch, no page reload
2. Cloudflare Turnstile verifies the visitor isn't a bot (checkbox, verified server-side)
3. Worker validates the input, checks a honeypot field, sends the email through Resend
4. One message per network per day, tracked with Cloudflare KV, so the free email tier doesn't get abused

## Why this setup

I kept going back and forth on whether to use a framework, but landed on plain JS because I wanted to actually understand things like `IntersectionObserver`, CORS, and how a serverless function talks to an external API — instead of a framework doing it for me. Slower to build, but I learned more.

## License

Not really applicable — it's just my personal site. Feel free to look at the code for reference, but the content (photos, project descriptions, etc.) is mine.
