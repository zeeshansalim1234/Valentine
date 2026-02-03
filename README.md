# Valentine Journey (Pixel Map)

Single-page “Gather Town”-style journey map:

- **Arrow keys / WASD**: walk along the zig‑zag path (constrained)
- **E**: reveal a nearby checkpoint card
- **Esc**: close the card

## Run it

### Option A: open directly

You can usually just double-click `index.html`.

### Option B: run a tiny local server (recommended)

If you have Node installed:

```bash
npx serve .
```

Or with Python:

```bash
python -m http.server 5173
```

Then open the printed local URL.

## Music

- Put a file named **`music.mp3`** in the same folder as `index.html` for your own romantic track (it will loop). If the file is missing or fails to load, a soft piano-style chord loop plays instead.

## Edit checkpoints (dates, images, writeups)

Open `main.js` and find the `checkpoints` array.

Each checkpoint looks like this:

```js
{
  id: "cp-1",
  title: "Checkpoint 1",
  date: "Add a date later",
  tag: "First memory",
  text: "Write something cute here…",
  imageSrc: "./photos/our-day.jpg", // optional
  s: totalLen * 0.18, // where it sits along the path
}
```

- **imageSrc** can be empty (a placeholder shows), or a path like `./photos/xxx.jpg`
- **s** is “distance along the path”. Once you tell me how many checkpoints you want, I can evenly space them or match them to specific turns.

## Change the zig‑zag path

In `main.js`, edit `pathTiles` (tile coordinates).
The path is a polyline connecting those points, and the couple walks along it.
