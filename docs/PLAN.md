# Cross-stitch pattern designer: implementation plan

Oct 10, 2026 · @Joni

## Summary

V1 is a touch-first web app for drawing cross-stitch patterns on a tablet, in real DMC thread colours, on layers that can be moved as a whole. It runs entirely in the browser, deploys to GitHub Pages as static files, and keeps patterns on the device.

The plan is written to be handed to Claude Code. Build it milestone by milestone; every milestone ends deployed and gets tried on the real tablet before the next one starts.

| In v1 | Left for later |
| --- | --- |
| Full cross stitches on a square grid, up to 300 × 300 | Backstitch, half and quarter stitches, French knots |
| Pencil, eraser, fill, eyedropper, undo and redo | Selections, copy and paste, shapes, mirror and rotate |
| DMC stranded cotton colours, shown with code and name | Other brands, custom colours, photo import |
| Layers: add, delete, rename, hide, reorder, duplicate, merge down, move whole layer | Layer opacity, locking, groups |
| Autosave on the device, several patterns, file export and import | Accounts, cloud sync |
| PNG export and a thread list with stitch counts | Printable symbol chart (PDF) |

## Key decisions

Two choices differ from the original brief: patterns go in IndexedDB instead of localStorage, and the app is an installable web app instead of a plain page. Both exist to protect her work, and neither needs a server.

| Topic | Decision | Reason |
| --- | --- | --- |
| Pattern storage | IndexedDB, through the small `idb-keyval` wrapper | localStorage holds about 5 MiB of strings per origin and blocks the page while writing. IndexedDB is asynchronous and has no practical ceiling. |
| Small settings | localStorage, keys prefixed `xstitch:` | Last tool, grid on or off. Losing these costs nothing. |
| Install | PWA: web manifest plus service worker | Opens full-screen, works offline, and on an iPad avoids Safari's seven-day deletion (below). |
| Backup | Export and import of a pattern file | Browser storage is not a backup. A file can go to cloud storage, email or another device. |
| Hosting | GitHub Pages, built by GitHub Actions | The app is static files only, so self-hosting adds nothing. |
| Rendering | One HTML canvas, 2D context, own pan and zoom | A DOM or SVG grid of 90,000 cells is too slow. No drawing library is needed. |
| Input | Pointer Events only | One code path for finger, stylus and mouse. |
| Thread brand | DMC only, ids namespaced as `dmc:310` | Keeps the picker simple. Another brand is one more data file later. |
| Stitch type | Full crosses only | Backstitch and fractional stitches change both the data model and the UI. |

### Storage risks to design around

- **Safari's seven-day rule.** Safari deletes everything a site stored from script, localStorage and IndexedDB alike, after seven days of Safari use without interaction on that site. Web apps added to the home screen keep their own counter and are not expected to lose data ([WebKit](https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/)). If her tablet is an iPad, she should open the app from its home-screen icon.
- **Other browsers.** Only Safari evicts proactively; the others delete data under storage pressure and skip origins granted persistence ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)). Call `navigator.storage.persist()` once after the first save.
- **Shared origin.** Every project site under `<user>.github.io` is the same origin, so they share storage and quota. Name the database `xstitch` and prefix every localStorage key.
- **Clearing site data.** If browsing data is cleared, the patterns go with it. The app should nudge an export when a pattern has changed a lot since its last export.

## Stack and deployment

Vite, Preact and TypeScript, deployed to GitHub Pages by a GitHub Actions workflow on every push to `main`. No router, no CSS framework and no canvas library.

| Piece | Choice |
| --- | --- |
| Build | Vite, TypeScript in strict mode |
| UI | Preact, with `@preact/signals` for state |
| Storage | `idb-keyval` |
| PWA | `vite-plugin-pwa` for manifest, service worker and precache |
| Tests | Vitest, on the model layer |

```
src/
  model/     pure TypeScript, no DOM: pattern, layers, palette, tools, history, serialise
  data/      dmc.json (thread list)
  canvas/    renderer and pointer handling, imperative, outside Preact rendering
  ui/        Preact components: toolbar, palette strip, thread picker, layers panel, gallery
  storage/   IndexedDB access, file export and import
  app.tsx
```

Two structural rules keep this testable and fast:

- `model/` imports nothing from the DOM, so every tool and layer operation has a unit test.
- The canvas is never re-rendered through Preact. The renderer listens for model changes and redraws on `requestAnimationFrame`.

### GitHub Pages specifics

1. Set Vite `base` to `/<repo-name>/`. Every asset, manifest and service-worker path must resolve under it.
2. Workflow steps: checkout, set up Node, `npm ci`, `npm test`, `npm run build`, upload `dist` with `actions/upload-pages-artifact`, deploy with `actions/deploy-pages`.
3. In the repository settings, set Pages source to GitHub Actions.
4. Manifest: `start_url` and `scope` equal to the base path, `display: standalone`, icons at 192 and 512 px plus a 180 px Apple touch icon.
5. A new version must never reload the page mid-session. Show a small "update ready" button and apply it when tapped or on next launch.
6. If the repository should be private, first check that the GitHub plan allows Pages for private repositories.

## Data model

A pattern is a fixed-size grid, a palette of threads and an ordered list of layers. Each layer is a sparse map from grid position to palette entry. The full model exists from the first milestone, even while the UI shows one layer.

```ts
type ThreadId = string;          // "dmc:310"

interface PaletteEntry {
  id: number;                    // 1..n, stable for the life of the pattern, never reused
  thread: ThreadId;
  symbol: string;                // assigned automatically, used by charts later
}

interface Layer {
  id: string;
  name: string;
  visible: boolean;
  cells: Map<number, number>;    // cell key -> PaletteEntry.id
}

interface Pattern {
  schema: 1;
  id: string;
  name: string;
  width: number;                 // in stitches, 10..300, default 100
  height: number;
  fabric: string;                // background hex, default a cream Aida tone
  palette: PaletteEntry[];
  layers: Layer[];               // index 0 is the bottom layer
  activeLayerId: string;
  createdAt: number;
  updatedAt: number;
}

// Coordinates may be negative or past the edge, so pack with an offset.
const key = (x: number, y: number) => (y + 32768) * 65536 + (x + 32768);
```

### Rules

- **Sparse, not dense.** Moving a layer rewrites its keys by (dx, dy). Stitches pushed past the edge stay in the map and return when the layer moves back.
- **One coordinate system.** Every tool works in pattern coordinates. Layers have no offset of their own.
- **Off-canvas stitches** are kept but never drawn, counted or exported.
- **One stitch per square.** The composite takes, for each cell, the topmost visible layer that has a stitch. Counts, thread list and exports all read the composite.
- **Cells store the palette entry id**, so changing an entry's thread recolours every stitch at once.
- **A palette entry in use cannot be removed.** Offer "replace with another thread" instead.

### Undo history

Undo is patch-based, capped at 100 steps, held in memory and cleared when the pattern closes.

| Action | What the history entry stores |
| --- | --- |
| Pencil, eraser or fill stroke | Layer id and a list of (key, before, after) |
| Move layer | Layer id, dx, dy |
| Add, delete, duplicate, merge, reorder, rename, hide | The affected layers as they were before |
| Palette change | The entry before and after |

### Saved forms

- **IndexedDB:** the `Pattern` object as it is. Structured clone stores `Map` directly.
- **Export file** (`.xstitch.json`): the same object with each layer's cells flattened to `[x, y, entry, x, y, entry, …]`. Readable triples keep the file independent of the key packing.
- `schema` is checked on load. An unknown higher version shows a clear message and never overwrites the stored pattern.

## Thread colours

The app ships a static list of DMC stranded cotton (code, name, hex) and always shows code and name beside the colour. The on-screen colour is an approximation; the code is what she buys.

### Data

- **Starting point:** the `floss` table in [sharlagelfand/dmc](https://github.com/sharlagelfand/dmc), MIT licensed, 454 colours with code, name and hex. It was built from the older adrianj/CrossStitchCreator list.
- **Known gap:** DMC's range is 500 colours since 35 were added in 2017 as codes 01 to 35 ([Lord Libidan](https://lordlibidan.com/dmcs-35-new-threads/)). The 454-row table appears to predate them. Check, and add the missing codes from a second named source.
- **No invented values.** Every hex value must come from a source file committed under `data/sources/`. If a code cannot be sourced, leave it out and list it in the README.
- **File:** `src/data/dmc.json`, rows of `{ "code": "310", "name": "Black", "hex": "#000000" }`, kept in the source's colour-family order. A wrong colour is then a one-line fix.
- **Accuracy caveat:** these tables are community measurements of thread, not values published by DMC as far as I can tell. Screens also differ. Say so once in the app's about text.

### Picking a colour

- **Palette strip**, always visible: the threads this pattern uses. Each swatch is at least 44 px and prints its DMC code in black or white, whichever contrasts. Tap to select.
- **Full picker**, opened by "+" on the strip: a full-screen sheet with every thread in family order, a search field matching code or name, and large swatches. Choosing a thread adds it to the palette and selects it.
- **Edit mode** on the strip, behind a visible button: replace an entry's thread, or remove an unused entry. Long-press may be a shortcut but never the only way.
- **Eyedropper:** tapping a stitch selects its palette entry, read from the composite.
- **Symbols** are assigned to entries from a fixed list now, though v1 does not draw them. Charts later then need no migration.

## Canvas, touch input and tools

One finger or the stylus uses the active tool; two fingers always pan and pinch-zoom. Nothing depends on hover, right-click, a keyboard or a scroll wheel. This is the riskiest part of the app, so it is built and tried on her tablet first.

### Gesture rules

1. The first pointer down starts a stroke with the active tool and applies it live.
2. If a second pointer lands while that stroke is in progress, revert the stroke completely and switch to pan and zoom until all fingers lift. This is what stops stray stitches at the start of a pinch.
3. A stylus (`pointerType === "pen"`) always draws. A setting, "fingers only move the canvas", makes one-finger touches pan for people who draw with a stylus.
4. Fill gaps between pointer samples with a line algorithm, and read `getCoalescedEvents()` where it exists, so fast strokes stay continuous.
5. Call `setPointerCapture` on pointer down, and treat `pointercancel` as a reverted stroke.

### Browser behaviour to switch off

| Problem on a tablet | Fix |
| --- | --- |
| Page scrolls or zooms while drawing | `touch-action: none` on the canvas |
| Double-tap zooms the page | `touch-action: manipulation` on all controls |
| Pull-to-refresh and rubber-banding | `overscroll-behavior: none`, body fixed at `100dvh` |
| Long press selects text or opens a callout | `user-select: none`, `-webkit-touch-callout: none` |
| Long press opens a context menu | `preventDefault()` on `contextmenu` |
| Notch and home indicator cover controls | `viewport-fit=cover` with `env(safe-area-inset-*)` padding |

### Rendering

- Each layer keeps an offscreen canvas at 1 px per stitch, updated only where cells change.
- A frame fills the fabric colour, draws each visible layer's offscreen canvas through the view transform with image smoothing off, then draws the grid.
- Grid: a thin line per stitch once a stitch is at least 6 screen px wide, and a heavier line every 10 stitches at all zoom levels. Scale for `devicePixelRatio`.
- Zoom runs from whole-pattern fit to about 48 px per stitch. Zoom in, zoom out and fit also exist as buttons.
- While a layer is dragged, draw it at the drag offset. The model changes once, on release.

### Tools

| Tool | One-finger behaviour |
| --- | --- |
| Pencil | Sets cells on the active layer to the selected palette entry |
| Eraser | Clears cells on the active layer |
| Fill | Flood-fills the 4-connected region under the tap on the active layer, bounded by the pattern edge |
| Eyedropper | Selects the palette entry under the tap, then returns to the pencil |
| Move layer | Drags the active layer in whole-stitch steps |
| Pan | Drags the view, for one-handed use |

Undo and redo are buttons that are always on screen. Drawing on a hidden layer is refused with a short message instead of silently painting.

## Layers

Every drawing tool changes only the active layer, and the Move tool shifts the whole active layer by whole stitches without losing anything.

The layers panel lists layers top first. Each row is at least 48 px tall and shows a visibility toggle, a thumbnail drawn from the layer's offscreen canvas, the name, and a menu button. The active row is highlighted.

| Operation | How, on touch | Behaviour |
| --- | --- | --- |
| Select | Tap the row | Becomes the active layer |
| Show or hide | Eye button on the row | Hidden layers are left out of the composite |
| Add | "+" at the top of the panel | New empty layer above the active one, made active, named "Layer n" |
| Rename | Row menu | Text prompt with the on-screen keyboard |
| Reorder | Up and down in the row menu | No drag-to-reorder in v1; it fights with scrolling on touch |
| Duplicate | Row menu | Copy placed above the original |
| Merge down | Row menu | Upper stitches win where both layers have one; disabled on the bottom layer |
| Delete | Row menu | Asks first unless the layer is empty; the last layer cannot be deleted |
| Move | Move tool, drag on the canvas | See below |

### Moving a layer

- With the Move tool, a drag anywhere on the canvas moves the active layer, snapped to whole stitches. The current offset, such as (+3, −2), shows while dragging.
- Four nudge arrows appear while the Move tool is active and shift the layer one stitch per tap. A finger is too coarse for the last stitch or two.
- Each drag and each nudge is one undo step.
- Stitches moved past the edge are kept, as the data model requires. A layer holding off-canvas stitches shows a small marker on its row.

## Screen layout

The app has two screens: a gallery of patterns and a full-screen editor with the canvas in the middle and fixed controls on all four edges. Landscape is the primary orientation.

### Editor

| Area | Position in landscape | Contents |
| --- | --- | --- |
| Top bar | Top edge | Back to gallery, pattern name, undo, redo, save status, menu for export and settings |
| Tool rail | Left edge | Pencil, eraser, fill, eyedropper, move layer, pan; zoom in, zoom out and fit at the bottom |
| Canvas | Centre | The pattern; nudge arrows overlay it while the Move tool is active |
| Layers panel | Right edge, collapsible | Layer list and the add button |
| Palette strip | Bottom edge | Selected thread with code and name, palette swatches that scroll sideways, "+" and edit |

In portrait, the layers panel becomes a slide-over sheet opened from the top bar. Everything else keeps its place.

### Gallery

A grid of pattern cards with thumbnail, name and last-edited date. It offers New pattern (name, width, height, with presets such as 50 × 50, 100 × 100 and 150 × 150), Import file, and a card menu with duplicate, export and delete.

### Touch rules for every control

- At least 44 × 44 CSS px, with at least 8 px between neighbours.
- The active tool, active layer and selected thread are each visibly marked at all times.
- Icons carry a visible label or an `aria-label`. Nothing is explained only by a tooltip.
- Deleting a layer or a pattern asks for confirmation. Everything else relies on undo.
- Sheets close with a visible Close button, not only by tapping outside.

## Saving, backup and export

Patterns save themselves and there is no Save button. Export produces a file she owns, and that file is the only real backup.

### On the device

- **Autosave** writes the pattern to IndexedDB one second after the last change, and at once on `visibilitychange` to hidden and on `pagehide`. Tablets discard background pages without warning.
- **Save status** in the top bar reads "Saved" or "Saving". A failed write shows a warning that stays, with an Export button beside it.
- **Keys** in a store named `xstitch`: `pattern:<id>` holds a pattern, and `index` holds a list of id, name, dates and thumbnail. The gallery reads only `index`.
- **Persistence:** call `navigator.storage.persist()` after the first successful save.

### Out of the device

| Output | Format | Notes |
| --- | --- | --- |
| Pattern file | `.xstitch.json` | Full pattern with all layers. Import always creates a new pattern with a new id and never overwrites. |
| Image | PNG of the composite | Chosen scale, default 10 px per stitch, grid optional. |
| Thread list | On-screen sheet, copyable as text | Swatch, DMC code, name and stitch count per thread, from the composite. |

Files leave through `navigator.share({ files })` when `navigator.canShare` accepts them, which opens the tablet's share sheet. Otherwise fall back to a download link.

The index records when each pattern was last exported. A gallery card shows a "not backed up" marker whenever the pattern has changed since then.

## Milestones

Six milestones, each deployed to Pages and tried on the real tablet before the next begins. Touch comes first because it carries the most risk; saving comes second so she can keep what she draws while testing the rest.

| # | Milestone | Builds | Done when, on her tablet |
| --- | --- | --- | --- |
| 0 | Skeleton and deploy | Scaffold, Pages workflow, manifest and service worker, empty full-screen canvas | The Pages URL opens, installs to the home screen and starts offline |
| 1 | Canvas and touch | Model with one layer and a three-thread test palette; renderer, grid, pan and zoom; pencil and eraser; undo and redo | Drawing with one finger and pinching with two never leaves a stray stitch, and the page never scrolls, zooms or selects text |
| 2 | Saving | Autosave, gallery, new, duplicate and delete pattern, file export and import | The app is closed mid-drawing and reopens with nothing lost; an exported file imports as an identical pattern |
| 3 | Threads | DMC data, palette strip, full picker, eyedropper, fill, replace thread | She finds a thread by its code in a few seconds, and codes match skeins she owns |
| 4 | Layers | Layers panel with every operation, Move tool with nudge arrows | A motif on one layer moves across another without disturbing it, and goes off the edge and back intact |
| 5 | Output and polish | PNG export, thread list, portrait layout, settings, update button, backup marker | She designs a small pattern start to finish and shares its image and thread list |

### Status

Built means the code is in the repository and passes the unit tests and a desktop browser check. Each milestone still needs its tablet check from the table above, and I could not do that part.

- [x] 0 Skeleton and deploy: built. [ ] Tablet check: open the Pages URL, install, start offline.
- [x] 1 Canvas and touch: built. [ ] Tablet check.
- [x] 2 Saving: built. [ ] Tablet check.
- [x] 3 Threads: built (489 colours, including codes 01 to 35). [ ] Tablet check.
- [x] 4 Layers: built. [ ] Tablet check.
- [x] 5 Output and polish: built. [ ] Tablet check.

The touch checklists are in the README.

### Every milestone also needs

- Unit tests for the new model code, run in CI before deploy: paint, erase, fill, move, merge, composite, undo and redo, and a serialise round trip.
- A short manual touch checklist in the README, run on the tablet, not only in desktop device emulation.
- This plan kept in the repository as `docs/PLAN.md`, with finished milestones ticked off.

## Later

None of this is in v1. The list is ordered by how soon I expect it to be asked for, and the first two are worth keeping in mind while building.

1. **Backstitch**, lines between grid corners. Probably the first thing she misses. It needs a list of segments per layer (schema 2) and a line tool.
2. **Printable symbol chart** as PDF with a thread legend, for stitching from paper. The palette symbols are already stored for it.
3. **Resize or crop** the pattern.
4. **Selections:** move, copy, mirror or rotate a region.
5. **Line and rectangle** tools.
6. **Fabric count and finished size** (stitches ÷ count × 2.54 cm) and a skein estimate.
7. **Photo import** with colours reduced to DMC threads.
8. **Other brands** and half or quarter stitches.
9. **Layer opacity and lock**, and two-finger tap to undo.
10. **Sync** between devices.

## Open questions

The plan works with the assumed answers; each real answer may move one item.

- [ ] Which tablet and browser? An iPad makes home-screen install a requirement, not a nicety. Assumed: unknown, so both are covered.
- [ ] Finger or stylus? A stylus makes "fingers only move the canvas" the better default. Assumed: finger.
- [ ] Is DMC the brand she uses? Assumed: yes.
- [ ] How large are her patterns? Assumed: 100 × 100 is typical and 300 × 300 is a safe cap.
- [ ] Will she stitch from the tablet screen or from paper? Paper moves the PDF chart into v1.
- [ ] Does she use backstitch in most designs? If yes, it follows milestone 4 directly.

## Sources

- [Full Third-Party Cookie Blocking and More](https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/), WebKit blog: the seven-day cap on script-writable storage and the home-screen exception.
- [Storage quotas and eviction criteria](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria), MDN: the 5 MiB localStorage limit, per-origin storage, persistence and eviction.
- [sharlagelfand/dmc](https://github.com/sharlagelfand/dmc), GitHub: the MIT-licensed table of 454 DMC colours.
- [DMC's 35 new threads](https://lordlibidan.com/dmcs-35-new-threads/), Lord Libidan: codes 01 to 35 and the 500-colour range.
