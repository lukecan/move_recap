# Move Recap

Your year in sport and wellbeing, Wrapped-style: story cards built from your own fitness-watch data.

> Works with Garmin Connect data exports. Not affiliated with or endorsed by Garmin.

## Status

**Working beta.** Live at https://recap.mertcangenc.com. Drop in a Garmin export ZIP (full recap) or the Activities CSV (quick recap). Everything runs in the browser.

## Try it

**The app:** `npm install && npm run build`, then open `dist/index.html` (or serve `dist/`). Drop in a Garmin Connect export ZIP (full recap) or the Activities CSV (quick recap, no waiting). The ZIP is read in the browser with [zip.js](https://github.com/gildas-lormeau/zip.js); only the JSON files the recap needs are extracted, so multi-GB exports with raw FIT files stay fast. Nothing leaves the page.


- Tap the right side (or →) for the next card, the left side (or ←) to go back
- Press and hold (or Space) to pause

## Cards

A story of at most **12 cards**: intro, totals, the nine most interesting insight cards for this person, and the summary. Any other cards that had something to say wait behind "N more cards" on the summary. Every card is skipped when there isn't enough data to say something honest.

| Card | What it shows |
|---|---|
| Intro | Period ("2026 Recap", or "Since April 2026" for a new watch) and date range |
| In total | Activities, active days, longest streak, hours, sports, calories (with a pizza-slice comparison) |
| When you move · Heart-rate DNA · Your stress week | When you train, how hard, which weekday stresses you most |
| Your rhythm | Running cadence matched to one of three songs at that exact tempo (185 songs, 140–200 BPM) |
| Power | Work done (kJ) with a phone / kettle / electric-car comparison; cycling first, running power otherwise |
| Swimming | Strokes and distance, compared with Alcatraz, Gibraltar and the English Channel |
| Strength | Sessions, time, different moves, go-to move and body areas |
| Mind & body | Yoga, breathwork and meditation minutes, slowest breathing, stress drop per session |
| Steps · Sleep · Your body · Sweat | Steps with a distance ladder, sleep habits, improved fitness markers, sweat |
| Climbing | A ladder of famous heights (Statue of Liberty → … → Everest → cruising altitude → edge of space) |
| Your shoes · Weather | Distance on your shoes vs the limit set in Gear; hottest and coldest workout |
| Records · Places | Personal records set this period; cities and countries trained in. **Private by default in shares.** |
| Summary | Tiles, share button, feedback link |

## Insight engine

`src/insights.js` turns stats into card copy. Each card has rule paths that pick a persona from the user's numbers, a 0–1 interest score that orders the deck, and a skip rule when there isn't enough data. Every insight carries a trace of the rule that fired. **Worse body metrics are never shown; if nothing improved, that card is skipped.**

**Languages.** Cards, share sheet, captions and share images speak English or Turkish (the page's language when the story opens). Copy is written as `t(english, turkish)` pairs; Turkish numbers, dates, 24-hour times and suffixes are worked out in code (%62'si, %40'ı, 2026'dan, Antalya'da).

**Places, offline.** `src/geo.js` maps each workout's start coordinates to the most populous city within 25 km (districts roll up into their city) using a GeoNames list built into `js/cities.js` and loaded only for full exports. Nothing is looked up online.

Open `demo/insights.html` to see invented profiles side by side. No real user data lives in this repository. Run the tests with:

```bash
node --test tests/*.test.js
```

## Share images

Every card has a **Share ↗** button, and the last card shares the whole recap. Only the summary card carries the site address, as a "Want yours?" invitation; the other images stay clean. `src/share.js` draws the card on a `<canvas>` (DOM-to-image tricks break on Safari, where most Instagram stories are made), so it works offline and under the no-network CSP.

| Option | Choices |
|---|---|
| What | This card · All cards (shown as a swipeable gallery; Records & Places only if you choose "Include") |
| Theme | Antalya (colour fields) · Race Bib (white bib, red band, timing strip) · Topo (trail map, contour lines) |
| Size | Story 9:16, 1080×1920 (Instagram, WhatsApp; text kept clear of Instagram's top and bottom UI) · Post 4:5, 1080×1350 (Strava, LinkedIn, Instagram feed) |

The Antalya theme draws a quiet sea-and-sun pattern seeded from the year's numbers, so every person's images differ (Topo contours are seeded the same way). Images are rendered before the tap, so the phone's own share sheet opens straight to Instagram, WhatsApp or Strava; desktops get downloads. "Copy caption" adds a ready-made post text. The chosen theme is remembered.

## Data pipeline

`scripts/summarize_export.py` reads an unzipped Garmin export and prints the recap stats as JSON:

```bash
python3 scripts/summarize_export.py path/to/unzipped_export > recap.json
```

See [`docs/garmin-export.md`](docs/garmin-export.md) for what is inside the export, the raw units and the data-quality filters.

## Deploy

Live at **https://recap.mertcangenc.com**, served by GitHub Pages.

- Every push to `main` runs `.github/workflows/pages.yml`: `npm ci` → `npm test` → `npm run build` → deploy. A failing test blocks the deploy.
- `npm run build` writes `dist/`: the pages from `app/`, the engine from `src/` (as `js/`), plus self-hosted zip.js and fonts. The build fails if any page still points at a third-party host, so "no tracking" stays true.
- Only `app/` and `src/` are published. The root `index.html` prototype and `demo/` stay in the repo only.

One-time setup (done in GitHub and cPanel, not in code):
1. GitHub → Settings → Pages → Source: **GitHub Actions**; Custom domain: `recap.mertcangenc.com`; then **Enforce HTTPS** once the certificate is issued.
2. cPanel → Zone Editor → `mertcangenc.com` → add a **CNAME**: name `recap`, target `lukecan.github.io`.
3. GitHub → Settings (account) → Pages → **Add a verified domain** `mertcangenc.com` (TXT record in cPanel), so no one else can claim the subdomain.
4. Repo → Settings → Rules → a ruleset for `main`: require pull requests, require the deploy workflow's `build` job to pass, block force pushes.
5. If Pages is ever turned off, delete the `recap` CNAME too.

## Privacy & security

A raw Garmin export contains your email address, contact details and profile photo. **Never commit an export or real user data to this repo.** `.gitignore` blocks ZIPs and export folders, and every profile and fixture here is invented.

- **No network, enforced.** Every page ships `Content-Security-Policy: connect-src 'none'` (plus `default-src 'none'`, `script-src 'self'`), so the browser itself refuses any request from the page. Anyone can check it in DevTools → Network.
- **Visit counter.** The start page counts visits with a GoatCounter image pixel sent by our own script (no third-party JS, no cookies; path + referring origin only; skipped on Do Not Track / GPC and off the live site). Only `img-src` allows that one host. Add `?ref=linkedin` (or any name) to links you post so visits from apps that hide the referrer still get attributed.
- **Build guards.** `npm run build` fails if a page lacks that CSP, contains an inline `<script>`, references a missing file, or loads anything from another host.
- **Supply chain.** zip.js and fonts are pinned in `package-lock.json` and self-hosted; GitHub Actions are pinned to commit SHAs; Dependabot proposes updates weekly.
- **Accessibility.** `npm run audit:contrast [export.zip]` measures every text element on every card against WCAG AA (needs Playwright).
- **Licenses.** MIT for this project (`LICENSE`); third-party licenses in `THIRD_PARTY_NOTICES.md` and shipped as `/licenses.txt`.

## Roadmap

- [x] Parse the export ZIP in the browser (`src/parse-export.js`); Activities CSV as an instant quick recap (`src/parse-csv.js`)
- [x] Cards generated from parsed data; period "Since <month>" for a new watch, otherwise the calendar year
- [x] Share images for Instagram stories, Strava and LinkedIn, in three themes
- [x] Turkish and English
- [x] Installable on the home screen (web manifest, app icons)
- [x] Deploy to recap.mertcangenc.com (GitHub Pages)
- [ ] Test group: a cyclist with a power meter, weighted strength training, outdoor runs with temperature
- [ ] Support link (GitHub Sponsors)
