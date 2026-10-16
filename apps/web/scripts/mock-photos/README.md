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
