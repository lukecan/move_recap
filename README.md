# Wellbeing Recap

Your year in sport and wellbeing, Wrapped-style: story cards built from your own fitness-watch data.

> Works with Garmin Connect data exports. Not affiliated with or endorsed by Garmin.

## Status

**Working beta.** Live at https://recap.mertcangenc.com. Drop in a Garmin export ZIP (full recap) or the Activities CSV (quick recap). Everything runs in the browser.

## Try it

**The app:** `npm install && npm run build`, then open `dist/index.html` (or serve `dist/`). Drop in a Garmin Connect export ZIP (full recap) or the Activities CSV (quick recap, no waiting). The ZIP is read in the browser with [zip.js](https://github.com/gildas-lormeau/zip.js); only the JSON files the recap needs are extracted, so multi-GB exports with raw FIT files stay fast. Nothing leaves the page.


- Tap the right side (or →) for the next card, the left side (or ←) to go back
- Press and hold (or Space) to pause

## Cards

| Card | What it shows |
|---|---|
| Intro | Date range covered by the export |
| Total | Activities, active days, longest streak, hours, calories |
| Sports | Breakdown by sport, with distance |
| When | 24-hour clock of activity start times, favourite weekday |
| Months | Activities per month |
| Records | Personal records set in the recap period |
| Pace | 5K race-time prediction, first month vs last |
| Body | Before/after: resting heart rate, VO2 Max, fitness age |
| Steps | Total and monthly steps, best day |
| Sleep | Average duration and score, typical bed and wake time |
| Summary | Shareable recap, copy to clipboard |

## Insight engine

`src/insights.js` turns stats into card copy. Each card has rule paths that pick a persona from the user's numbers, a 0–1 interest score that orders the deck, and a skip rule when there isn't enough data. Every insight carries a trace of the rule that fired.

| Card | Personas |
|---|---|
| When you move | early bird · lunch-break athlete · afternoon athlete · evening athlete · night owl · double shift · weekend warrior · anytime athlete |
| Heart-rate DNA | polarized · base builder · tempo lover · intensity junkie · all-rounder |
| Your stress week | monday blues · midweek pressure · friday crunch · busy weekender · steady |
| Steps | step machine · 10k club · steady walker · every step counts (+ distance ladder: marathon → London–Paris → Lisbon–Madrid → length of Italy → Paris–Moscow) |
| Sleep | sleep champion · well rested · almost there · short sleeper (+ late-sleeper line) |
| Your body | upgraded · on the way up. **Worse metrics are never shown; if nothing improved, the card is skipped.** |
| Sweat | fun fact (ladder: bottles → water-cooler jugs → bathtubs → hot tubs) |
| Climbing | fun fact (ladder: Eiffel Tower → Burj Khalifa → % of Everest → Everests) |

Open `demo/insights.html` to see five invented profiles side by side. No real user data lives in this repository. Run the tests with:

```bash
node --test tests/*.test.js
```

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
- **Build guards.** `npm run build` fails if a page lacks that CSP, contains an inline `<script>`, references a missing file, or loads anything from another host.
- **Supply chain.** zip.js and fonts are pinned in `package-lock.json` and self-hosted; GitHub Actions are pinned to commit SHAs; Dependabot proposes updates weekly.
- **Accessibility.** `npm run audit:contrast [export.zip]` measures every text element on every card against WCAG AA (needs Playwright).
- **Licenses.** MIT for this project (`LICENSE`); third-party licenses in `THIRD_PARTY_NOTICES.md` and shipped as `/licenses.txt`.

## Roadmap

- [x] Parse the export ZIP in the browser, port `summarize_export.py` to JS (`src/parse-export.js`)
- [x] Generate cards from parsed data instead of hard-coded numbers
- [x] Activities CSV as an instant quick recap (`src/parse-csv.js`); flags CSVs cut off at Garmin's 20-row page
- [ ] Export a card as an image for Instagram stories / LinkedIn
- [x] Period: "Since <month>" when the watch is new this year, otherwise the calendar year
- [ ] Turkish and English copy
- [x] Deploy to recap.mertcangenc.com (GitHub Pages)
