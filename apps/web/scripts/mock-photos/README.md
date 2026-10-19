# Mock-up product photographs (development only)

`scripts/seed.ts` uses `<product-slug>.jpg` (or `.png` / `.webp`) from this folder as that
perfume's photograph, so the local catalogue looks like a real one. With no file, a perfume
gets the plain ground, exactly as on a fresh clone and in CI.

| File | Perfume |
|---|---|
| `layl-al-qahira.jpg` | ليل القاهرة — amber, Maison Nour |
| `ward-al-taif.jpg` | ورد الطائف — floral, Dar al Ward |
| `nakhil.jpg` | نخيل — fresh, Atelier Siwa |

Rules:

- **Unbranded bottles only.** No designer logo, name or recognisable packaging
  (CLAUDE.md §4, prohibited claims).
- **Free licence only** (Unsplash, Pexels, CC0). Record the source in `SOURCES.md` here.
- Each file passes the same checks as a house's upload: JPEG/PNG/WebP read from its bytes,
  shorter edge at least 800px, at most 10 MB. The seed refuses a file that would fail.
- The image files are **not committed** (`.gitignore`). Production photographs are the
  houses' own, uploaded through the seller portal.

Apply after adding or changing a file (stop the dev server first — PGlite has one writer):

```bash
pnpm --filter @diyar/web seed -- --fresh
```

## `derived/` — the reveal's reliefs (Le Dévoilement)

The seed also gives each mock perfume a **relief** (migration 0032) when
`derived/<slug>-cutout.png`, `derived/<slug>-height.png` and `derived/placements.json`
exist: the bottle cut out of the photograph, its relief map, and where it sat.

They are made from the photographs above by
`design-reference/experiences/tools/bottle_to_25d.py`, with outlines traced by hand —
these stock photographs are not packshots on a plain background, which is exactly when
the console's own tool (`/ops/reliefs`) asks the operator to trace the outline too.
Not committed, like the photographs. Without them, a perfume simply has no reveal.

```bash
python design-reference/experiences/tools/bottle_to_25d.py
```

