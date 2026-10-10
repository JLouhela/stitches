# Stitches

A touch-first web app for drawing cross-stitch patterns in real DMC thread colours, on layers that move as a whole. It runs entirely in the browser, deploys to GitHub Pages as static files and keeps patterns on the device. See [docs/PLAN.md](docs/PLAN.md) for the full plan.

## Develop

```bash
npm install
npm run dev        # http://localhost:5173/stitches/
npm test           # unit tests for the model layer
npm run build      # type-check and build to dist/
```

`npm run data` rebuilds `src/data/dmc.json` from `data/sources/`; `npm run icons` regenerates the PWA icons.

## Deploy

1. Repository settings → Pages → Source: **GitHub Actions**. (Private repositories need a GitHub plan that allows Pages for them.)
2. Push to `main`. The workflow runs the tests, builds and deploys.
3. The Vite `base` in `vite.config.ts` is `/stitches/` and must equal the repository name.

## Colour data

`src/data/dmc.json` has 489 DMC stranded cotton colours (code, name, hex), including codes 01 to 35 added in 2017. Every value comes from a file committed under `data/sources/`:

- `makebead-dmc-floss.json`: [makebead/craft-color-codes](https://github.com/makebead/craft-color-codes), CC BY 4.0 (credit: "Color data: craft-color-codes by MakeBead"). Its hex values were rebuilt from RGB columns and cross-checked against two other lists.
- `floss_adrianj.csv` and `floss.R`: [sharlagelfand/dmc](https://github.com/sharlagelfand/dmc) (MIT), built from adrianj/CrossStitchCreator. All its codes are present in the MakeBead list; its "White" is the MakeBead "Blanc".

DMC's range is 500 colours, so about 11 codes are missing. No source I could find lists them with colour values, and the plan forbids inventing values, so they are left out. If a code on a skein she owns is missing, add a row to `data/sources/` and `npm run data`.

These are community measurements of thread, not values published by DMC, and screens differ. The app says so in Settings.

## Touch checklist (run on the tablet, not only in desktop emulation)

**Milestone 0, install**
- [ ] The Pages URL opens.
- [ ] Add to home screen; it opens full screen.
- [ ] With airplane mode on, it still starts.
- [ ] On an iPad, open it from the home-screen icon.

**Milestone 1, canvas and touch**
- [ ] One finger draws; two fingers pan and pinch without leaving a stray stitch, even when a pinch starts quickly.
- [ ] The page never scrolls, zooms, selects text or pulls to refresh while drawing.
- [ ] A fast stroke has no gaps.
- [ ] Undo and redo buttons work. Rotating the tablet keeps the pattern in view.
- [ ] With a stylus: it draws. Turn on "Fingers only move the canvas" in Settings and one finger pans.

**Milestone 2, saving**
- [ ] Draw, switch to another app, come back: nothing lost. Close the app mid-drawing and reopen: nothing lost.
- [ ] Gallery: new, duplicate, delete (asks first).
- [ ] Export a pattern file, import it: an identical pattern appears as a new card.

**Milestone 3, threads**
- [ ] Find a thread by its code in a few seconds. The codes match skeins she owns.
- [ ] Eyedropper picks a colour and returns to the pencil. Fill stays inside its region.
- [ ] Replace a thread: every stitch of it recolours.

**Milestone 4, layers**
- [ ] Add, rename, hide, reorder, duplicate, merge down, delete from the row menu.
- [ ] Move tool: a motif on one layer moves across another without disturbing it; nudge arrows move one stitch.
- [ ] Push stitches off the edge and bring them back intact; the row shows a marker while any are off.

**Milestone 5, output and polish**
- [ ] Export PNG and the thread list through the share sheet.
- [ ] Portrait: the layers panel opens as a sheet from the top bar.
- [ ] "Not backed up" appears on a card until the pattern is exported.
- [ ] After a new deploy, an "Update ready" button appears and the page does not reload by itself.

## Structure

```
src/model/    pure TypeScript, no DOM: pattern, layers, tools, history (Editor), serialise
src/data/     dmc.json
src/canvas/   renderer, pointer handling, PNG export
src/ui/       Preact components
src/storage/  IndexedDB, autosave, file export and import
```
