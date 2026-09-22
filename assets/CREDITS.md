# Asset credits — ALL IN ARCADE

Route B downloads must be attributed here (see `ART-DIRECTION.md` at the project root).

## logo-all.svg / logo-in.svg

- **Source:** original artwork drawn for the booth (Route A per `ART-DIRECTION.md`) —
  pure geometric letterform paths, no third-party source, no license required.
- **Used for:** title-screen masthead wordmark (`index.html` `#logoWrap`, the
  `.brandLogo` 46px slot), filled with the same vertical gradient as the
  `#brandFallback` fallback h1 (`#ffffff 8% → #cfe6ff 55% → #7fc9ff 100%`).
- **Provenance:** authored for issue #11 (the masthead `<img>`s shipped before the
  assets did, firing 2 unmaskable 404s on every boot). Pure `<path>` geometry + one
  `<linearGradient>` each — sealed-SVG safe: no `<text>`, no fonts, no external refs,
  offline-boot guaranteed.

## backdrops/allin-gredient-bg.jpg

- **Source:** `https://allinevent.ai/cdn/shop/files/gredient-bg.jpg?v=1773752690&width=2560`
  (Shopify returned the native 1920×1080 progressive JPEG — the site's own banner
  background behind the "A curated crowd of 6,500+ AI leaders" band).
- **Used for:** attract/start-screen canvas backdrop (`drawBackdrop` `"allin"` preset
  in `src/core.js`), with the procedural aurora washes kept as the fallback.
- **Provenance:** official ALL IN event brand asset; pulled 2026-09-17 at the booth
  operator's direction for booth use at the event itself (not for redistribution).
