/**
 * Front-end audit: every surface, every width, every rule this project states.
 *
 * Built because the same defects kept surviving review and turning up only when
 * somebody looked at a screenshot — a mirrored timeline, a 33px tap target, a
 * grid rendered at opacity zero. Eyeballing eleven surfaces at six widths is
 * sixty-six judgements a person will not make consistently at the end of a long
 * session, and every one of these rules is already written down somewhere in
 * docs/. This turns them into assertions.
 *
 * What it checks, and why each one is here rather than left to review:
 *
 *   OVERFLOW      A page that scrolls sideways on a phone is broken, and it is
 *                 invisible on a desktop where the work is done.
 *   TAP TARGETS   44pt floor (DESIGN_DOCTRINE). Measured INCLUDING an expanded
 *                 ::after hit area, because the visual may be smaller than the
 *                 target and usually should be.
 *   AXE           Contrast, names, roles, landmarks, heading order. The rules
 *                 nobody can hold in their head across eleven screens.
 *   RTL           Direction is declared, and anything that fills or anchors
 *                 does so from the correct edge — this has been got backwards
 *                 four separate times in this project.
 *   FOCUS         Every interactive element must show a visible focus ring.
 *                 Keyboard users are not a minority on desktop; they are anyone
 *                 whose mouse is across the desk.
 *   LEAKED ENUMS  No raw state or enum values rendered to a customer.
 *
 * THEMES. Everything below runs against the theme named by `THEME` (default
 * `light`, the site's default since visual identity v2). It is a whole run rather than an extra dimension inside one because
 * the theme is set before the first paint and lives on the document — and
 * because contrast is the check that actually differs between the two, so a
 * light run that shares a dark run's session would prove nothing about the
 * screens it did not reload. `THEME=dark pnpm audit` is the second pass.
 *
 * Findings print grouped by surface and exit non-zero, so this is usable in CI
 * the day CI exists.
 */
import { chromium } from 'playwright';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const AXE = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

const BASE = process.env.BASE_URL ?? 'http://localhost:3100';
const OUTBOX = process.env.OTP_OUTBOX;

// Refused up front. Without it the run went on until the first sign-in and then
// failed inside `readFileSync` — which names a missing path, not a missing
// variable, and has already spent a one-time code.
if (!OUTBOX) {
  console.error('OTP_OUTBOX is not set: start the app with OTP_OUTBOX=<file> and pass the same path here. See README, "Checks".');
  process.exit(1);
}

/**
 * Which theme this run audits.
 *
 * Written into localStorage before any document loads, exactly as a returning
 * visitor's browser would hold it, so the page arrives already in that theme
 * rather than flipping into it after paint. Auditing contrast on a page mid-flip
 * measures whichever frame the check happened to catch.
 */
const THEME = process.env.THEME === 'dark' ? 'dark' : 'light';

/*
 * ONE SCREEN AT A TIME. `ONLY=home,en-home` audits just those surfaces, at every
 * width, in the theme above. A full run is ~40 minutes per theme, and a screen
 * being redesigned needs its answer in minutes; the full run stays the gate
 * before a commit. A sign-in is skipped when none of its surfaces is wanted.
 */
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(',').map((s) => s.trim())) : null;
const wanted = (surface) => !ONLY || ONLY.has(surface);
const themed = async (context) => {
  await context.addInitScript((theme) => {
    try { localStorage.setItem('diyar-theme', theme); } catch { /* private mode */ }
  }, THEME);
  return context;
};

/**
 * Six widths, each chosen for a reason rather than because it is a round
 * number: the smallest phone still in real use, the reference design, the
 * awkward middle, the tablet, the laptop, the monitor.
 */
const WIDTHS = [
  { name: '360', width: 360, height: 780 },
  { name: '390', width: 390, height: 844 },
  { name: '768', width: 768, height: 1024 },
  { name: '1024', width: 1024, height: 800 },
  { name: '1280', width: 1280, height: 900 },
  { name: '1440', width: 1440, height: 900 },
];

const findings = [];
const record = (surface, width, rule, detail) =>
  findings.push({ surface, width, rule, detail });

/*
 * The static checks run FIRST, before a browser opens.
 *
 * They were at the end. When the client-directive fault below took every form
 * page to a 500, the audit died on a missing form label and never reached the
 * check that would have named the cause in one line.
 */
/* ------------------------------------------------- static source checks */

/**
 * `'use client'` must be the FIRST statement in its file.
 *
 * JavaScript directive prologues only count before any other statement, so an
 * import placed above the directive does not fail, does not warn, and does not
 * error at build time — the module quietly stops being a client component. The
 * shared form field lost its directive this way to a one-line import, and every
 * page carrying a form began returning 500 while typecheck and lint stayed
 * clean.
 *
 * Comments are stripped before deciding whether a file HAS a directive at all.
 * `primary-surface.tsx` explains in its header comment why it deliberately
 * carries none, and a guard that cannot tell prose from code teaches people to
 * delete the prose. The token drift guard learned this same lesson.
 */
function checkClientDirectives(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) { checkClientDirectives(full); continue; }
    if (!/\.tsx?$/.test(entry.name)) continue;

    const source = readFileSync(full, 'utf8');
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

    if (!/['"]use client['"]/.test(code)) continue;

    const first = code.trim();
    if (!(first.startsWith("'use client'") || first.startsWith('"use client"'))) {
      record(
        relative(process.cwd(), full).replace(/\\/g, '/'), '—', 'client-directive',
        "'use client' is not the first statement, so this file is not a client component",
      );
    }
  }
}

checkClientDirectives(join(process.cwd(), 'src'));


/**
 * The latest one-time code sent to a phone, read from the OTP outbox (P3.4.3).
 *
 * The app writes `{phone, code, at}` lines there when `OTP_OUTBOX` is set — a
 * test hook, where this used to scrape the dev server's log for the last line
 * mentioning the phone and hope the code was at the end of it. That worked by
 * accident of formatting and could not run in CI without sharing a server's
 * stdout; the outbox is a contract.
 */
function codeFor(phone) {
  const entries = readFileSync(OUTBOX, 'utf8').split('\n').filter(Boolean)
    .map((line) => JSON.parse(line))
    .filter((entry) => entry.phone === phone);
  const latest = entries.at(-1);
  if (!latest) throw new Error(`No one-time code was sent to ${phone}`);
  return latest.code;
}

async function fill(page, labelStartsWith, value) {
  const label = page.locator('label', { hasText: labelStartsWith }).first();
  const id = await label.getAttribute('for');
  await page.fill(`#${id}`, value);
}

/** Scroll the page so reveal-on-approach content is actually present. */
async function settle(page) {
  await page.evaluate(async () => {
    const step = Math.round(window.innerHeight * 0.8);
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 120));
    }
    window.scrollTo(0, 0);
    await new Promise((r) => setTimeout(r, 300));
  });
  await page.waitForTimeout(700);
}

const audited = new Set();

async function auditPage(page, surface, width) {
  audited.add(surface);
  await settle(page);

  const structural = await page.evaluate(() => {
    const rendered = (e) => e.getClientRects().length > 0;

    /**
     * Hit area including an expanded ::after, and the LABEL that wraps it.
     *
     * A 16px radio inside a 44px label has a 44px target: pressing anywhere in
     * the label activates the input, which is what WCAG 2.5.8 measures and what
     * a thumb actually meets. Measuring the input alone reported every radio on
     * the site as too small and would have been "fixed" by making the dots
     * enormous — a real regression driven by a wrong measurement.
     */
    const hit = (e) => {
      const wrapper = e.closest('label');
      const b = (wrapper ?? e).getBoundingClientRect();
      const a = getComputedStyle(e, '::after');
      let gx = 0, gy = 0;
      if (a.content && a.content !== 'none' && a.position === 'absolute') {
        const t = parseFloat(a.top), l = parseFloat(a.left);
        const r = parseFloat(a.right), bo = parseFloat(a.bottom);
        gx = Math.max(0, -(l || 0)) + Math.max(0, -(r || 0));
        gy = Math.max(0, -(t || 0)) + Math.max(0, -(bo || 0));
      }
      return { w: Math.round(b.width + gx), h: Math.round(b.height + gy) };
    };

    const interactive = [...document.querySelectorAll('a, button, input, select, textarea')]
      .filter(rendered);

    return {
      dir: document.documentElement.getAttribute('dir'),
      lang: document.documentElement.getAttribute('lang'),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,

      smallTargets: interactive
        .map((e) => ({
          label: (e.textContent || e.getAttribute('aria-label') || e.id || e.tagName).trim().slice(0, 24),
          ...hit(e),
        }))
        .filter((t) => t.h < 44 || t.w < 44),

      // Anything that draws a bar, fill or connector must anchor from the
      // reading START — the right in Arabic, the left in English. Got
      // backwards four times in this project.
      wrongEdgeFills: [...document.querySelectorAll('[style*="width"]')]
        .filter(rendered)
        .filter((el) => {
          const parent = el.parentElement;
          if (!parent || !/track|meter|bar/i.test(parent.className)) return false;
          const a = el.getBoundingClientRect();
          const b = parent.getBoundingClientRect();
          const rtl = document.documentElement.getAttribute('dir') === 'rtl';
          return rtl ? Math.abs(a.right - b.right) > 2 : Math.abs(a.left - b.left) > 2;
        })
        .map((el) => el.className.slice(0, 40)),

      // Raw enum or state values must never reach a customer.
      leakedEnums: (document.querySelector('main')?.innerText ?? '')
        .match(/\b(awaiting_seller|sub_order|order_line|storefront_referral|organic_search|eau_de_parfum|delivery_fulfilled_by)\b/g) ?? [],

      headingOrder: [...document.querySelectorAll('h1, h2, h3, h4')]
        .filter(rendered)
        .map((h) => Number(h.tagName[1])),

      h1Count: [...document.querySelectorAll('h1')].filter(rendered).length,
      title: document.title,
    };
  });

  // The English routes are named `en-…`; everything else is the Arabic site.
  const english = surface.startsWith('en-');
  const expected = english ? { dir: 'ltr', lang: 'en' } : { dir: 'rtl', lang: 'ar' };
  if (structural.dir !== expected.dir) record(surface, width, 'direction', `dir="${structural.dir}"`);
  if (structural.lang !== expected.lang) record(surface, width, 'lang', `lang="${structural.lang}"`);
  if (structural.overflow > 0) record(surface, width, 'overflow', `${structural.overflow}px sideways`);
  if (!structural.title) record(surface, width, 'title', 'empty <title>');

  if (structural.h1Count !== 1) {
    record(surface, width, 'h1', `${structural.h1Count} visible h1`);
  }
  for (const t of structural.smallTargets) {
    record(surface, width, 'tap-target', `${t.label} — ${t.w}×${t.h}`);
  }
  for (const c of structural.wrongEdgeFills) {
    record(surface, width, 'fill-edge', `fills from the wrong edge: ${c}`);
  }
  for (const e of new Set(structural.leakedEnums)) {
    record(surface, width, 'leaked-enum', e);
  }

  // Heading levels may not skip: h1 → h3 leaves a screen reader guessing.
  let previous = 0;
  for (const level of structural.headingOrder) {
    if (previous && level > previous + 1) {
      record(surface, width, 'heading-skip', `h${previous} → h${level}`);
    }
    previous = level;
  }

  // Focus must be visible. Sampled on the first few controls, because the ring
  // is defined once globally and a failure is never limited to one element.
  const focusless = await page.evaluate(() => {
    const controls = [...document.querySelectorAll('a, button')]
      .filter((e) => e.getClientRects().length > 0)
      /*
       * Disabled controls are excluded, because they cannot be focused BY
       * ANYONE — they are not in the tab order, and `el.focus()` on one is a
       * no-op that leaves the computed style ringless.
       *
       * This surfaced the first time a screen was audited that has a disabled
       * control on load: the CMS, where "create" starts disabled until a slug
       * is typed and the first block's "move up" is disabled by definition. The
       * rule was reporting an accessibility failure on elements no keyboard
       * user can ever reach.
       */
      .filter((e) => !e.disabled && e.getAttribute('aria-disabled') !== 'true')
      .slice(0, 6);
    const bad = [];
    for (const el of controls) {
      el.focus();
      const s = getComputedStyle(el);
      const ring = s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0;
      const shadow = s.boxShadow !== 'none';
      if (!ring && !shadow) bad.push((el.textContent || el.tagName).trim().slice(0, 24));
      el.blur();
    }
    return bad;
  });
  for (const label of focusless) {
    record(surface, width, 'focus-ring', `no visible focus: ${label}`);
  }

  // axe last: it is the slowest and the least surprising.
  await page.evaluate(AXE);
  const axe = await page.evaluate(async () =>
    // eslint-disable-next-line no-undef
    await window.axe.run(document, {
      resultTypes: ['violations'],
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    }));

  for (const v of axe.violations) {
    /*
     * The NODE, not the count.
     *
     * This used to report "serious — 1 node(s): Elements must meet minimum
     * color contrast ratio thresholds" and stop, which sends whoever reads it
     * hunting through a page for an element the tool already had in its hand.
     * The end-to-end harness had the same fault — it printed line one of a
     * failure and threw the diagnostic away — and it cost a debugging session
     * both times.
     *
     * Up to three nodes: enough to see whether it is one element or a pattern,
     * short of pasting a page of markup into a summary.
     */
    const where = v.nodes.slice(0, 3).map((n) => {
      const target = Array.isArray(n.target) ? n.target.join(' ') : String(n.target);
      // axe puts the measured colours in the failure summary. For contrast that
      // IS the answer, so it is carried through rather than summarised away.
      const why = (n.failureSummary ?? '')
        .split(String.fromCharCode(10))
        .map((line) => line.trim())
        .filter((line) => /contrast|ratio|colou?r|expected/i.test(line))
        .join(' ');
      return why ? `${target} — ${why}` : target;
    }).join(' | ');

    record(
      surface,
      width,
      `axe:${v.id}`,
      `${v.impact} — ${v.help}${where ? ` @ ${where}` : ''}`,
    );
  }
}

/**
 * Open a page and wait for it to settle — retrying ONCE if the dev server
 * interrupted the navigation.
 *
 * WHY (P3.4.3, CI). `next dev` compiles a route on its first request, and on a
 * CI runner that can take long enough, or reload the page mid-flight, for
 * `goto` to fail with `net::ERR_ABORTED` or a timeout. That failure is the
 * server's, not the page's: every surface that got past it passed. Warming
 * every route beforehand was tried and cost more memory than the runner has.
 *
 * Only the navigation is retried, and only once. Every check this audit makes
 * runs after it, on the page that loaded, and none of them is ever retried —
 * a second failure is reported exactly as before.
 */
async function visit(page, url) {
  try {
    await page.goto(url, { waitUntil: 'networkidle' });
  } catch (error) {
    const message = String(error?.message ?? error);
    if (!/ERR_ABORTED|Timeout \d+ms exceeded/.test(message)) throw error;
    console.log(`  (retrying ${url.replace(BASE, '')} once: ${message.split(String.fromCharCode(10))[0]})`);
    await page.goto(url, { waitUntil: 'networkidle', timeout: 90_000 });
  }
}

const browser = await chromium.launch({ channel: 'chrome' });

try {
  /* --------------------------------------------------------------- public */
  const anon = await themed(await browser.newContext({ locale: 'ar-EG' }));
  const page = await anon.newPage();

  // A basket, so the cart and checkout have something to audit.
  await page.setViewportSize({ width: 1280, height: 900 });
  await visit(page, `${BASE}/`);
  const slugs = await page.evaluate(async () => {
    const home = await (await fetch('/')).text();
    return [...new Set([...home.matchAll(/\/p\/([a-z-]+)/g)].map((m) => m[1]))];
  });
  let added = 0;
  for (const slug of slugs) {
    if (added === 2) break;
    await visit(page, `${BASE}/p/${slug}`);
    const buy = page.locator('button:visible').filter({ hasText: 'أضف إلى الحقيبة' }).first();
    let ok = false;
    for (let i = 0; i < 20; i += 1) {
      if (await buy.count() === 0) break;
      if (!(await buy.isDisabled())) { ok = true; break; }
      await page.waitForTimeout(300);
    }
    if (!ok) continue;
    await buy.click();
    await page.waitForTimeout(500);
    added += 1;
  }

  const publicRoutes = [
    ['home', '/'],
    ['product', `/p/${slugs[0]}`],
    ['cart', '/cart'],
    ['checkout', '/checkout'],
    ['order-lookup', '/order'],
    // Editorial pages go through the same eleven checks as everything else.
    // Content written by a person is exactly where a heading order breaks or a
    // contrast fails, and it is the only part of the site that changes without
    // a deploy — so it needs the audit more than the fixed screens do.
    ['content-about', '/about'],
    ['content-care', '/care'],
    // The house storefronts and the directory. A house page is the one
    // customer screen whose content is written by a SELLER rather than by
    // us, which is exactly where a heading order or a contrast breaks.
    // Search, empty and filtered. The filtered one is where the chips, the
    // number fields and the select all render at once — every control on
    // the screen, in the state a customer actually leaves it in.
    ['search', '/search'],
    ['search-filtered', '/search?family=amber&stock=1&sort=price_asc'],
    // A product page WITH reviews and one without: the empty state has its
    // own copy and its own contrast, and it is the state most perfumes are
    // in for the first months.
    ['product-reviewed', '/p/layl-al-qahira'],
    ['product-unreviewed', '/p/nakhil'],
    // The two public forms nobody could reach before: a way to ask a
    // question, and a way for a house to join. Both are indexable, so both
    // are met by people who have never seen the site.
    ['support', '/support'],
    ['apply', '/apply'],
    ['legal-terms', '/terms'],
    ['legal-returns', '/returns'],
    ['legal-privacy', '/privacy'],
    ['houses', '/houses'],
    ['house', '/house/maison-nour'],
    // The two sign-in screens. Every run passed THROUGH them and none had
    // ever audited them — the first screen a house or an operator sees.
    ['seller-sign-in', '/seller'],
    ['ops-sign-in', '/ops'],
    // The page a visitor meets when something has already gone wrong.
    ['not-found', '/nothing-here'],
  ];

  /*
   * The English site (P5.6.2): every customer screen again under `/en`.
   *
   * A second direction is a second layout. Left-to-right moves every logical
   * margin, mirrors the evolution curve, and swaps the heading face to Bodoni —
   * each a place where a contrast, an overflow or a heading order can break
   * that the Arabic run cannot see. The sign-in screens are left out: the seller
   * portal and the console are Arabic-only until steps 4 and 5.
   */
  const englishRoutes = publicRoutes
    .filter(([surface]) => !surface.endsWith('-sign-in'))
    .map(([surface, path]) => [`en-${surface}`, path === '/' ? '/en' : `/en${path}`]);

  /*
   * A SEPARATE browser for the English run. Opening `/en` sets the cookie that
   * remembers the language, after which the site — correctly — answers every
   * Arabic link in English. One shared browser would audit the English site
   * twice and report the Arabic one as broken.
   */
  const englishVisitor = await themed(await browser.newContext({ locale: 'en-GB' }));
  const englishPage = await englishVisitor.newPage();

  for (const size of WIDTHS) {
    await page.setViewportSize({ width: size.width, height: size.height });
    for (const [surface, path] of publicRoutes.filter(([s]) => wanted(s))) {
      await visit(page, `${BASE}${path}`);
      await auditPage(page, surface, size.name);
    }
    await englishPage.setViewportSize({ width: size.width, height: size.height });
    for (const [surface, path] of englishRoutes.filter(([s]) => wanted(s))) {
      await visit(englishPage, `${BASE}${path}`);
      await auditPage(englishPage, surface, size.name);
    }
  }
  await englishVisitor.close();

  /* --------------------------------------------------------------- seller */
  const sellerSurfaces = ['seller-queue', 'seller-listings', 'seller-payouts', 'seller-returns', 'seller-listing-editor'];
  if (sellerSurfaces.some(wanted)) {
  const house = await themed(await browser.newContext({ locale: 'ar-EG', viewport: { width: 1280, height: 900 } }));
  const seller = await house.newPage();
  await visit(seller, `${BASE}/seller`);
  await fill(seller, 'رقم الموبايل', '01001112222');
  await seller.locator('button[type="submit"]').click();
  await seller.waitForTimeout(1800);
  await fill(seller, 'رمز التحقّق', codeFor('01001112222'));
  await seller.locator('button[type="submit"]').click();
  await seller.waitForURL('**/seller/orders', { timeout: 20_000 });

  for (const size of WIDTHS) {
    await seller.setViewportSize({ width: size.width, height: size.height });
    for (const [surface, path] of [
      ['seller-queue', '/seller/orders'],
      ['seller-listings', '/seller/listings'],
      ['seller-payouts', '/seller/payouts'],
      ['seller-returns', '/seller/returns'],
    ].filter(([s]) => wanted(s))) {
      await visit(seller, `${BASE}${path}`);
      await auditPage(seller, surface, size.name);
    }
  }

  // One listing editor: the densest form in the product, twenty-four fields.
  // Navigating first, for the reason given at the ops page editor below.
  await visit(seller, `${BASE}/seller/listings`);
  const firstListing = await seller.locator('a[href^="/seller/listings/"]').first()
    .getAttribute('href', { timeout: 10_000 })
    .catch(() => null);
  if (firstListing && wanted('seller-listing-editor')) {
    for (const size of WIDTHS) {
      await seller.setViewportSize({ width: size.width, height: size.height });
      await visit(seller, `${BASE}${firstListing}`);
      await auditPage(seller, 'seller-listing-editor', size.name);
    }
  } else if (wanted('seller-listing-editor')) {
    record('seller-listing-editor', '—', 'missing', 'no listing link to follow — the editor was not audited');
  }

  }

  /* ------------------------------------------------------------------ ops */
  const opsSurfaces = ['ops-queue', 'ops-content', 'ops-moderation', 'ops-site', 'ops-notes', 'ops-reviews',
    'ops-returns', 'ops-support', 'ops-houses', 'ops-audit', 'ops-insights', 'ops-page-editor', 'ops-page-preview'];
  if (opsSurfaces.some(wanted)) {
  const opsContext = await themed(await browser.newContext({ locale: 'ar-EG', viewport: { width: 1280, height: 900 } }));
  const ops = await opsContext.newPage();
  await visit(ops, `${BASE}/ops`);
  await fill(ops, 'رقم الموبايل', '01000000001');
  await ops.locator('button[type="submit"]').click();
  await ops.waitForTimeout(1800);
  await fill(ops, 'رمز التحقّق', codeFor('01000000001'));
  await ops.locator('button[type="submit"]').click();
  await ops.waitForURL('**/ops/queue', { timeout: 20_000 });

  // The content console is held to the same standard as the shopfront. It is
  // an internal tool, which is exactly why it gets skipped — and it is a tool
  // people use for hours, which is why it should not be.
  const opsRoutes = [
    ['ops-queue', '/ops/queue'],
    ['ops-content', '/ops/content'],
    ['ops-moderation', '/ops/moderation'],
    ['ops-site', '/ops/site'],
    ['ops-notes', '/ops/notes'],
    // The aftercare consoles. They shipped with end-to-end coverage and were
    // never added here, so no width or theme had ever been audited on them.
    ['ops-reviews', '/ops/reviews'],
    ['ops-returns', '/ops/returns'],
    ['ops-support', '/ops/support'],
    ['ops-houses', '/ops/houses'],
    // The audit trail: read all day by the person answering "who did this".
    ['ops-audit', '/ops/audit'],
    // The owner's report: the widest tables in the product, which is exactly
    // where a phone-width page scrolls sideways if a table is not contained.
    ['ops-insights', '/ops/insights'],
  ];

  for (const size of WIDTHS) {
    await ops.setViewportSize({ width: size.width, height: size.height });
    for (const [surface, path] of opsRoutes.filter(([s]) => wanted(s))) {
      await visit(ops, `${BASE}${path}`);
      await auditPage(ops, surface, size.name);
    }
  }

  // And one page editor, which is where every form control in the CMS lives.
  //
  // Navigating first rather than assuming: the loop above leaves the browser on
  // whichever ops route is LAST, and adding one to that list silently moved
  // this lookup onto a page with no content links on it.
  await visit(ops, `${BASE}/ops/content`);
  const firstPage = await ops.locator('a[href^="/ops/content/"]').first()
    .getAttribute('href', { timeout: 10_000 })
    .catch(() => null);
  if (firstPage && (wanted('ops-page-editor') || wanted('ops-page-preview'))) {
    for (const size of WIDTHS) {
      await ops.setViewportSize({ width: size.width, height: size.height });
      if (wanted('ops-page-editor')) {
        await visit(ops, `${BASE}${firstPage}`);
        await auditPage(ops, 'ops-page-editor', size.name);
      }
      // The draft preview renders through the PUBLIC renderer, inside the
      // console's session — a surface of its own, never audited until now.
      if (wanted('ops-page-preview')) {
        await visit(ops, `${BASE}${firstPage}/preview`);
        await auditPage(ops, 'ops-page-preview', size.name);
      }
    }
  } else if (!firstPage) {
    record('ops-page-editor', '—', 'missing', 'no content link to follow — the editor was not audited');
  }
  }
} catch (error) {
  /*
   * A crash is a FINDING, not an exit.
   *
   * The browser pass used to take the process down with it, which meant the
   * static checks above — already run, already holding the answer — were never
   * printed. The one time it mattered, the report that would have named the
   * cause in a line was sitting in memory when the process died over a form
   * label that was missing because of it.
   */
  // The whole message, and where it happened. The first line of a Playwright
  // timeout says what timed out and not which page it was on, which is the
  // half that matters when six passes share one helper.
  record('audit', '—', 'crashed',
    String(error.message ?? error).split(String.fromCharCode(10)).slice(0, 3).join(' / ')
    + ' @ ' + String((error).stack ?? '').split(String.fromCharCode(10)).slice(1, 3).join(' / '));
} finally {
  await browser.close();
}

/* ------------------------------------------------------------------ report */
// A misspelt `ONLY` name matches nothing and would report "no findings" for a
// screen that was never opened. Silence about an unaudited screen is a finding.
for (const name of ONLY ?? []) {
  if (!audited.has(name)) record(name, '—', 'missing', 'named in ONLY, but no such surface was audited');
}

const bySurface = new Map();
for (const f of findings) {
  const key = `${f.surface}`;
  if (!bySurface.has(key)) bySurface.set(key, new Map());
  const rules = bySurface.get(key);
  const detail = `${f.rule} — ${f.detail}`;
  if (!rules.has(detail)) rules.set(detail, new Set());
  rules.get(detail).add(f.width);
}

if (findings.length === 0) {
  console.log(`\n[${THEME}] No findings. Every surface, every width.\n`);
} else {
  console.log(`\n[${THEME}] ${findings.length} findings across ${bySurface.size} surfaces:\n`);
  for (const [surface, rules] of bySurface) {
    console.log(`  ${surface}`);
    for (const [detail, widths] of rules) {
      console.log(`    · ${detail}   [${[...widths].join(', ')}]`);
    }
    console.log('');
  }
}

process.exit(findings.length === 0 ? 0 : 1);
