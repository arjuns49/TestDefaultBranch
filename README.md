# Gift Card Business Dashboard

A single-page dashboard for the gift-card buying group business. It reads the
three deal-log tabs (**Aligned Incentives**, **TCB** → shown as *TheCardBay*, **QCGC**)
straight from the source Google Sheet in the browser — no backend, no build step —
and renders profit, cash-flow and prioritization metrics. Data is cached to
`localStorage` so the page still shows the last-synced numbers if you're offline
or the sheet is briefly unreachable; hit **Refresh data** any time to pull the
latest rows.

Sheet: https://docs.google.com/spreadsheets/d/1dQi97dBCjbXuEac-89PCh0y3Xj8DH2G6skvmzLqoCMA/edit

## One-time setup: share the sheet for read access

The dashboard fetches each tab via Google's public CSV export endpoint
(`/gviz/tq?tqx=out:csv&sheet=...`), which only works if the sheet is shared as
**"Anyone with the link" → Viewer**. Your card numbers, PINs and pins-in-clear
live in this sheet, so before sharing it:

1. Duplicate the sheet (or scrub the `CardNumber`/`Pin`/`CardNumberLast4`
   columns) and point `SHEET_ID` in `app.js` at the safe copy — **or**
2. If you're comfortable with link-viewable access (anyone with the URL, not
   indexed/searchable) on the sheet as-is, open **Share → General access →
   Anyone with the link → Viewer** on the current sheet.

Nothing is uploaded anywhere else — the CSV is fetched directly from Google by
your own browser and never touches a server.

## What's in the dashboard

- **Overview** — total/monthly profit, profit by site, deal volume trend, paid
  vs. pending split. Profit is split into *face margin* (`Denom − Buy Price`,
  the core resale spread) and *rewards bonus* (the sheet's `Actual Profit`
  column, i.e. stacked card/portal rewards on top).
- **Brand Playbook** — every brand ranked by total profit with deal count, avg
  buy rate, avg margin % and best-performing card. This is the prioritization
  list: when a new deal lands, check where the brand already sits here before
  committing floor space/cash to it.
- **Cards** — which payment card has produced the most rewards bonus, so you
  know which card to reach for on the next purchase.
- **Cash Flow** — outstanding payouts sorted by oldest ETA first, plus average
  payment turnaround (days from purchase to payout) so you can spot slow payers.
- **Deal Score Calculator** — punch in denom/buy price/estimated rewards % for
  an incoming deal and it's scored against your own historical average for
  that brand (or generic buy-rate thresholds if it's a brand you haven't
  logged before).
- **Deal Log** — full searchable log across all three sites.

Site and year filters at the top apply to every view except the calculator's
brand-history lookup, which always checks your full history.

## Local development

It's plain static HTML/JS — just open `index.html` in a browser, or serve the
folder with any static file server, e.g.:

```
npx serve .
```

## Deploying to Cloudflare Pages

No build step is required (`Build command`: none, `Build output directory`: `/`).

**Option A — Git integration (recommended, no CLI/credentials needed):**
1. Push this repo to GitHub (already done if you're reading this from the repo).
2. In the Cloudflare dashboard: **Workers & Pages → Create → Pages → Connect to Git**,
   pick this repository.
3. Leave the build command empty and set the output directory to `/`.
4. Deploy — Cloudflare will redeploy automatically on every push to `main`.

**Option B — CLI (`wrangler`):**
```
npx wrangler pages deploy . --project-name gift-card-dashboard
```
This needs `CLOUDFLARE_API_TOKEN` (and account selection) configured in your
environment; run `npx wrangler login` first if deploying interactively.
