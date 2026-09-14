# Micro

A personal, single-user calorie and macro tracker for iOS, built with Expo. Everything lives on
the device: no account, no server, no sync. The only network calls are food search and barcode
lookups against [Open Food Facts](https://world.openfoodfacts.org/).

## Running it

```bash
npm install
npm start          # then scan the QR code with Expo Go
```

The barcode scanner needs a real device — the camera is not available in a simulator.

## Android APK releases

Every GitHub tag named `apk-v*` (for example, `apk-v1.0.1`) runs the **Android APK release**
workflow. GitHub generates the Android project, builds a signed installable APK, and attaches it
to the matching [GitHub Release](https://github.com/ZdravkoIvanovBG/Macro/releases). It does not
use EAS, an Expo account, or an Expo access token.

One-time setup:

1. Generate a release keystore and keep a safe backup outside the repository:

   ```powershell
   keytool -genkeypair -v -keystore micro-release.jks -storetype PKCS12 -alias micro-release -keyalg RSA -keysize 2048 -validity 10000
   ```

2. In the repository's **Settings → Secrets and variables → Actions**, create these secrets:
   `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEY_ALIAS`, `ANDROID_KEYSTORE_PASSWORD`, and
   `ANDROID_KEY_PASSWORD`. To copy the first value in PowerShell:

   ```powershell
   [Convert]::ToBase64String([IO.File]::ReadAllBytes(".\micro-release.jks")) | Set-Clipboard
   ```

   Use `micro-release` for `ANDROID_KEY_ALIAS` if you used the command above. Use the passwords
   you chose for the remaining two secrets.
3. Push a tag such as `git tag apk-v1.0.1` and `git push origin apk-v1.0.1`, or start the workflow
   manually from GitHub Actions and enter a new `apk-v...` release tag.

The installed app is a standalone release build; it does not need Expo Go or a running development
server. Installing a newer APK over it preserves its local SQLite data as long as the Android
package ID remains `com.zdravko.micro` and the same release keystore is used. The workflow assigns
each run an increasing Android version code, which Android requires for an update install.

## What it does

| Tab | |
| --- | --- |
| **Log** | The selected day's entries, running totals against your targets, add/edit/delete. Step back a day to fix yesterday. |
| **Search** | Full-text search over Open Food Facts. Tapping a result pre-fills an entry from its per-100 g nutrition. Recently logged foods act as the empty state. |
| **Scan** | Barcode scanning via the camera. Known products pre-fill the same form; unknown ones fall through to manual entry with the code attached. |
| **History** | 7 / 30 / 90-day calorie chart, averages against targets, and a per-day breakdown. |
| **Profile** | Your stats and goal. Targets recompute live as you type and are cached on save. |

## How the targets are calculated

- **BMR** — Mifflin-St Jeor: `10·kg + 6.25·cm − 5·age + 5` (male) or `− 161` (female).
- **TDEE** — BMR × activity multiplier (1.2 / 1.375 / 1.55 / 1.725 / 1.9).
- **Calorie target** — TDEE minus your deficit, or plus your surplus. The deficit is capped so the
  target can never fall below BMR; the Profile screen shows the ceiling and explains it.
- **Protein** — default 2.0 g/kg, adjustable.
- **Fat** — default 0.8 g/kg, adjustable, but floored at 20% of the calorie target.
- **Carbs** — whatever calories are left after protein (4 kcal/g) and fat (9 kcal/g), at 4 kcal/g.
  If protein and fat overshoot the target, carbs clamp at zero and the screen says so.

All of this lives in [`src/lib/calc.ts`](src/lib/calc.ts).

## Layout

```
src/
  components/   reusable UI (Card, Button, fields, progress bars, chart)
  db/           SQLite: sql.ts holds every statement, repos wrap them
  lib/          calc, stats, dates, formatting, Open Food Facts client, theme
  navigation/   root stack over the bottom tabs
  screens/      one file per tab, plus the shared entry form
  state/        ProfileProvider and LogProvider
```

The database is versioned with `PRAGMA user_version`; migrations in
[`src/db/sql.ts`](src/db/sql.ts) are append-only.

## Checks

There is no test runner — these are plain scripts run by Node's built-in TypeScript stripping.

```bash
npm run check          # typecheck + all offline checks
npm run check:calc     # the nutrition formulas, against hand-computed values
npm run check:sql      # every SQL statement, against node:sqlite
npm run check:stats    # history aggregation and date maths
npm run check:off      # Open Food Facts parsing (add -- --offline to skip live calls)
npm run check:bundle   # a full Metro production bundle, to catch config breakage
```

## Notes on the Open Food Facts API

- Text search uses `search.openfoodfacts.org` (search-a-licious). The older `/cgi/search.pl`
  endpoint is being retired and currently returns an HTML maintenance page, so it is not used.
- Barcodes use the v2 product endpoint, which also returns serving sizes that the search index
  does not expose.
- Results are biased toward Bulgaria by running a second query filtered to `en:bulgaria` and
  listing those hits first — nothing is excluded. Note that only the `countries_tags` field is
  queryable in that index; `countries_tags_en` matches nothing.
- A missing product comes back as `status: 0`, which is treated as "no match" rather than an error.

## Not included

Photo-based food estimation (snap a photo, get an AI estimate) is deliberately out of scope.
