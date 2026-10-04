# Context

Family itinerary site for Death Valley National Park, Thanksgiving 2026 (check-in Thu Nov 26 morning, check-out Sun Nov 29 morning). Party: 2 adults + kids (8, 11) + friends (2 adults). Based at Stovepipe Wells Village (inside the park). Hand-authored static HTML on a Cloudflare Worker with a Basic-Auth password gate (`SITE_PASSWORD` secret, not in the repo). Modeled on `amalfi-trip`.

## Layout
- `index.html` — whole itinerary: overview + Day 0 (Wed Nov 25, drive + overnight at Hyatt Place Bakersfield (310 Coffee Rd, Bakersfield 93309)), Thu Nov 26 (arrive, dunes, Thanksgiving dinner at Toll Road Restaurant), Fri Nov 27 (Zabriskie, Golden Canyon/Gower Gulch, Artists Drive, Badwater), Sat Nov 28 (Mosaic Canyon, pool, stargazing), Sun Nov 29 (drive home)
- `worker/index.js`, `wrangler.jsonc` — password gate + static assets

## Open items (verify)
- Toll Road Restaurant Thanksgiving menu/price/seating: not confirmed online; call (760) 786-7090.
- Friends' rooms; Hyatt Place Bakersfield reservation for Nov 25.
- Check NPS conditions + Caltrans QuickMap before driving. Scotty's Castle closed; Titus Canyon Rd closes Oct 1 2026–Sep 30 2027.
- Furnace Creek dining hours/operators changed with the new concessionaire; moon-phase timing claims are approximate.

## Conventions
Dates written out ("Nov 26"); small targeted edits; keep a "Book before you leave" panel with urgency tags.
