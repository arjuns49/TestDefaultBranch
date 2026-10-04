# dv-trip

Death Valley Thanksgiving 2026 family itinerary (Nov 26–29, Stovepipe Wells Village). Static HTML on a password-gated Cloudflare Worker, same setup as the Amalfi/Italy trip site.

## Deploy

```
npm i -g wrangler && wrangler login
wrangler secret put SITE_PASSWORD   # prompts for the site password
wrangler deploy
```

Or connect this repo in the Cloudflare dashboard (Workers & Pages → Create → Import a repository) and add `SITE_PASSWORD` as a secret under Settings → Variables and Secrets.

## Context

See `context.md`.
