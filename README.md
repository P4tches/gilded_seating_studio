# Gilded — Seating Chart & Card Studio

A private, static PWA for designing a wedding/event seating chart and printing the
things that actually go on the tables:

- **Guests workspace** — enter every name once, then drag and drop them into
  tables, between tables, or back to Unassigned. Reorder within a table too.
- **Table cards** — one card per table, with the table name and guest list.
- **Name cards** — a place card for every guest, flat or folded tent style.
- **Mirror mockup** — the full seating chart on a gold-framed mirror, for preview
  and optional large-format export.

Everything runs in the browser. There is no build step, no npm install, no backend,
no account and no upload. Projects are stored in IndexedDB on the device.

---

## Run it

The app is plain HTML/CSS/JS. Serve the folder over HTTP (not `file://`) so the
service worker, fonts and exports work:

```bash
cd wed_seating_chart_maker
python3 -m http.server 8080
```

Open <http://localhost:8080>.

Any static host works: GitHub Pages, Netlify, Cloudflare Pages, a Raspberry Pi,
or nginx. The service worker requires HTTPS (or localhost) for offline/install.

> Do not open `index.html` directly via `file://` — browsers block the service
> worker, and high-resolution exports need the local server.

---

## Printing workflow

1. **Design** the chart in the editor. Presets change the paper, frame, fonts and
   card styling; every detail is editable.
2. **Enter the guest list once** in the Guests tab. Paste all names into
   Unassigned, then drag them into tables (or tap a name, then tap a table).
   Reorder within a table by dragging; use **Deal evenly** to distribute names
   automatically, then fine-tune.
3. Click **Print** (gold button in the editor top bar).
4. Choose **Table cards** or **Name cards**, then set the card size and layout.
5. **Download PDF** (or **Print now**).
6. Print at **100% / actual size** — do not use “fit to page” — on cardstock.

### Table cards

- Default: 3.5 × 5 in, four per A4/Letter sheet with crop marks.
- Guest order follows the order in each table's drop zone (drag to reorder).
- Other sizes: 4 × 6 in, 5 × 7 in, A6.
- Layouts: multiple per sheet, or one card per page at exact trim size.
- A printer icon in each table row downloads that single table as its own PDF.
- Long guest lists shrink to fit; tables with more than 14 names switch to two
  columns automatically.

### Name cards

- Folded tent: 3.5 × 2.5 in (3.5 × 5 in flat) or 4 × 3 in (4 × 6 in flat).
  The top half is printed inverted on purpose so the name reads upright on both
  sides after folding. Cut on the crop marks, then fold along the dashed line
  with the printed side facing out.
- Flat place card: 3.5 × 2 in or 4 × 2.5 in.
- 10 flat 3.5 × 2 in cards fit on an A4 sheet; 4 tent cards fit per A4 sheet.
- Sort by table or alphabetically.
- Only assigned guests print; the Print studio warns if names are still
  unassigned.
- Optional table name, fold line and hairline border.

### Mirror mockup

Use the `···` menu → **Export mirror image** (or the Preview overlay) for a
high-resolution PNG or poster-sized PDF of the full mirror design. This is a
mockup/preview export; the card PDFs above are the print products.

---

## Offline & installation

- `manifest.webmanifest` + `sw.js` precache the entire app, fonts and icons.
- Once loaded, the app works offline and can be installed from the browser
  (Chrome/Edge: Install; iOS Safari: Share → Add to Home Screen).
- The app stores projects and photos in IndexedDB. Clearing browser storage
  clears your charts — download a project backup from the `···` menu for safekeeping.

## Deploying an update

Because there is no build hash, **bump the cache version in `sw.js`** whenever
you change a cached file:

```js
const VERSION = 'gilded-v1.3.0';
```

The service worker will fetch the new assets, then offer a reload toast to open
tabs.

---

## Project structure

| Path | Purpose |
| --- | --- |
| `index.html` | App shell, manifest/font/style links |
| `css/fonts.css` | Self-hosted woff2 `@font-face` declarations |
| `css/artboard.css` | Mirror chart rendering (shared by screen + export) |
| `css/print.css` | Physical card/sheet layouts |
| `css/app.css` | Editor, gallery, modal and print-studio UI |
| `js/app.js` | Boot, gallery, routing, install flow |
| `js/editor.js` | Editor panels, drag/drop, history, print studio |
| `js/model.js` | Data model, presets, layout maths, demo data |
| `js/presets.js` | Visual presets and new-chart templates |
| `js/render.js` | Mirror artboard DOM renderer |
| `js/frames.js` | Baroque/arch/line frame SVGs |
| `js/print.js` | Table-card/name-card sheet planning, preview and PDF/print output |
| `js/export.js` | DOM → SVG → 300 dpi raster, PNG and multi-page PDF writer |
| `js/db.js` | IndexedDB storage with localStorage fallback |
| `js/utils.js` | DOM, file, modal, toast and image helpers |
| `js/icons.js` | Inline SVG icon set and logo |
| `fonts/` | Local woff2 font files (offline) |
| `icons/` | PWA/app icons |
| `tools/make-icons.py` | Regenerate PNG icons (Python standard library only) |

## Export implementation

There is no PDF or image library. The app:

1. Renders the artboard/sheet as DOM.
2. Serializes it into an SVG `foreignObject` with the relevant CSS and the woff2
   fonts embedded as base64 data URLs.
3. Draws that SVG into a 300 dpi canvas.
4. Writes a small multi-page PDF with JPEG image streams (`DCTDecode`) — or
   downloads a PNG for the mirror mockup.

This is why exports are rendered locally and why the app must be served over
HTTP: the exporter fetches CSS and font files to embed them.

**Browser support:** modern Chrome, Edge, Firefox and Safari. Chrome/Edge give
the most predictable canvas/font export. If a browser refuses an export, try a
Chromium-based browser and make sure pop-ups are allowed for “Print now”.
