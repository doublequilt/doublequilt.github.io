# How the doublequilt background works

This file explains the implementation in `script.js` and `styles.css`.

The design follows the same **general technique** used by the austegard.com homepage: a fixed WebGL canvas paints a very subtle procedural color field using the site's own palette, the field changes slowly over time, and the pointer gently bends it.

The code here is an original implementation for doublequilt rather than a verbatim copy of the reference source.

## 1. The page contains a canvas

In `index.html`:

```html
<canvas id="ambient-bg" aria-hidden="true"></canvas>
<button id="motion-toggle" type="button" hidden>
  pause drift
</button>
```

A canvas is simply a rectangular area JavaScript can draw into.

The canvas does not contain the website. The normal HTML remains above it.

## 2. CSS fixes the canvas behind everything

In `styles.css`, `#ambient-bg` is fixed to all four sides of the browser window.

Conceptually:

```css
#ambient-bg {
  position: fixed;
  inset: 0;
  width: 100vw;
  height: 100vh;
  pointer-events: none;
}
```

`pointer-events: none` is important because it means the canvas cannot block clicks on links.

The HTML content has a higher z-index, so the relationship is:

```text
links + text
────────────
quilt decoration
────────────
WebGL canvas
────────────
paper fallback
```

## 3. The colors live in CSS

The background does not hard-code a separate theme.

The main light-mode colors are CSS variables:

```css
--paper: #f0f1eb;
--green: #5d6d3b;
--red:   #a43a3a;
```

Dark mode replaces those same variables inside:

```css
@media (prefers-color-scheme: dark) { ... }
```

JavaScript reads those variables with `getComputedStyle()`, converts the hex colors into RGB values from 0 to 1, and sends them into WebGL.

That is why the animated background and the rest of the page always use the same palette.

## 4. WebGL uses two shaders

A WebGL program normally has:

1. a **vertex shader**
2. a **fragment shader**

The vertex shader in this site is intentionally boring. It creates one triangle large enough to cover the entire screen.

The fragment shader is the interesting part. It runs once for every visible pixel and decides:

> What color should this pixel be right now?

## 5. Start with random-looking values

The shader's `randomValue()` function takes an XY coordinate and deterministically turns it into a value between 0 and 1.

It is not used directly as visible static.

Instead, four surrounding random values are blended together by `smoothNoise()`.

That changes this:

```text
. # . # . ## .
# . ## . . # .
```

into something closer to:

```text
~~~~~~
 ~~~~~~~
   ~~~~~~
```

The important property is continuity: neighboring pixels receive similar values.

## 6. Layer the noise with FBM

One layer of smooth noise is too simple.

`layeredNoise()` adds five versions together:

- a large blurry layer
- a smaller layer
- a still smaller layer
- and so on

Each layer contributes half as much as the previous layer.

This technique is usually called **fractal Brownian motion**, or FBM.

Conceptually:

```text
large cloud
+ medium cloud
+ small cloud
+ tiny details
= natural-looking field
```

## 7. Domain warping creates the flowing shapes

This is the most important visual trick.

Ordinary procedural noise asks:

```text
noise(x, y)
```

Domain warping first generates noise and then uses that noise to change the coordinates of another noise lookup:

```text
warp = noise(x, y)

final = noise(
  x + warp,
  y + warp
)
```

doublequilt does this twice.

First, two noise values create a two-dimensional vector called `firstWarp`.

Then `firstWarp` changes where `secondWarp` samples its noise.

Finally, `secondWarp` changes where `mainFlow` is sampled.

The result is the soft twisting/current-like structure you see instead of ordinary clouds.

## 8. Time makes it drift

The animation loop keeps a value called `simulationTime`.

Each frame adds the elapsed number of seconds.

Inside the shader, time is deliberately reduced:

```glsl
float time = elapsed * 0.04;```

That small multiplier is why the background moves extremely slowly.

The time value is added to some noise coordinates and subtracted from others.

This makes different layers drift in different directions.

## 9. The mouse bends the field

JavaScript continuously records the latest pointer position.

However, the visible pointer used by the shader does not jump directly to it.

Every frame:

```js
mouse += (target - mouse) * 0.05;
```

This is interpolation.

It makes the interaction feel fluid instead of twitchy.

Inside the shader, the distance from each pixel to the pointer is measured.

Pixels near the pointer receive a larger coordinate displacement than distant pixels.

The important idea is:

```text
near cursor  → strong bend
far away     → almost no bend
```

The exponential falloff creates a soft circular influence rather than a hard boundary.

## 10. Noise becomes color

The shader eventually has several values between roughly 0 and 1.

`smoothstep()` turns portions of those values into masks.

One mask controls how much olive gets mixed into the paper color.

Another controls how much red gets mixed in.

The amounts are intentionally small.

The visual recipe is roughly:

```text
~89%–100% paper
0%–11% olive wash
0%–6.5% red wash
```

That restraint is what keeps the background looking like colored paper rather than a colorful screensaver.

## 11. One oversized triangle is enough

The JavaScript buffer contains only three points:

```text
(-1,-1)
( 3,-1)
(-1, 3)
```

That triangle extends beyond the viewport and covers the entire WebGL clip space.

This is a common shader technique because the fragment shader only needs a surface covering every pixel.

## 12. Resolution is capped for performance

Retina screens may have a device pixel ratio of 2, 3, or even higher.

Rendering the effect at the full device resolution would waste GPU power for a background this subtle.

The site caps it at:

```js
Math.min(devicePixelRatio, 1.5)
```

That is a useful performance/quality tradeoff.

## 13. Motion can be paused

The bottom-left button toggles `isRunning`.

When paused, the site stops scheduling new animation frames.

The current frame remains visible.

The preference is stored in `localStorage`, so refreshing the page preserves the user's choice.

## 14. Reduced-motion is respected

If the visitor has enabled:

**Reduce Motion**

in their operating system, the background starts in its still state unless they previously chose otherwise.

This happens through:

```js
matchMedia("(prefers-reduced-motion: reduce)")
```

## 15. Background animation pauses in hidden tabs

There is no reason to keep rendering 60 frames per second while the visitor is looking at another browser tab.

The site listens for `visibilitychange`.

When the tab is hidden, animation stops.

When the visitor returns, it resumes.

## 16. Light/dark mode updates the shader

The code also watches:

```js
matchMedia("(prefers-color-scheme: dark)")
```

When the system theme changes:

1. JavaScript re-reads the CSS variables.
2. It sends the new RGB values into WebGL.
3. It redraws the canvas.

The shader itself therefore does not need separate light/dark logic.

## Files involved

### `index.html`

Defines the website content, the canvas, and the pause button.

### `styles.css`

Defines:

- typography
- paper/olive/red palette
- light/dark mode
- canvas layering
- grain texture
- quilt decoration
- pause-button styling

### `script.js`

Defines:

- WebGL setup
- shaders
- procedural noise
- domain warping
- mouse interaction
- animation
- palette synchronization
- accessibility/performance behavior

## How to experiment

The easiest values to change are inside the fragment shader.

### Make it move faster

Increase:

```glsl
float time = elapsed * 0.04;
```

For example, `0.08` is twice as fast.

### Make the mouse stronger

Increase the `0.15` value in the mouse displacement.

### Make the mouse affect a larger region

Decrease the `2.5` inside the exponential falloff.

### Add more green

Increase the `0.11` multiplier used for the olive amount.

### Add more red

Increase the `0.065` multiplier used for the red amount.

### Make the shapes larger

Reduce the initial coordinate scale:

```glsl
vec2 samplePoint = uv * 1.2;
```

For example, changing `1.2` to `0.8` zooms into the procedural field.

## The overall pipeline

```text
CSS palette
    │
    ▼
JavaScript reads colors
    │
    ▼
WebGL shader
    │
    ├── smooth noise
    │      │
    │      ▼
    │     FBM
    │      │
    │      ▼
    │ domain warp × 2
    │      │
mouse ───►│ bend coordinates
    │      ▼
    │  color masks
    │      │
    ▼      ▼
 paper + olive + red
          │
          ▼
   final screen pixel
```

That is the entire effect: no video, no background image, and no animation library. It is a continuously generated mathematical field drawn by the GPU.
