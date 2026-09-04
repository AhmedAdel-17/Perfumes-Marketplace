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
const LOG = process.env.DEV_LOG;

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


function codeFor(phone) {
  const lines = readFileSync(LOG, 'utf8').split('\n').filter((l) => l.includes(phone));
  const match = lines.at(-1)?.match(/(\d{6})\s*$/);
  if (!match) throw new Error(`No code for ${phone}`);
  return match[1];
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

async function auditPage(page, surface, width) {
  await settle(page);

  const structural = await page.evaluate(() => {
    const rendered = (e) => e.getClientRects().length > 0;

    /** Hit area including an expanded ::after, which is the real target. */
    const hit = (e) => {
      const b = e.getBoundingClientRect();
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
      // correct edge in RTL. Got backwards four times in this project.
      wrongEdgeFills: [...document.querySelectorAll('[style*="width"]')]
        .filter(rendered)
        .filter((el) => {
          const parent = el.parentElement;
          if (!parent || !/track|meter|bar/i.test(parent.className)) return false;
          const a = el.getBoundingClientRect();
          const b = parent.getBoundingClientRect();
          return Math.abs(a.right - b.right) > 2;
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

  if (structural.dir !== 'rtl') record(surface, width, 'rtl', `dir="${structural.dir}"`);
  if (structural.lang !== 'ar') record(surface, width, 'lang', `lang="${structural.lang}"`);
  if (structural.overflow > 0) record(surface, width, 'overflow', `${structural.overflow}px sideways`);
  if (!structural.title) record(surface, width, 'title', 'empty <title>');

  if (structural.h1Count !== 1) {
    record(surface, width, 'h1', `${structural.h1Count} visible h1`);
  }
  for (const t of structural.smallTargets) {
    record(surface, width, 'tap-target', `${t.label} — ${t.w}×${t.h}`);
  }
  for (const c of structural.wrongEdgeFills) {
    record(surface, width, 'rtl-fill', `fills from the wrong edge: ${c}`);
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
    record(surface, width, `axe:${v.id}`, `${v.impact} — ${v.nodes.length} node(s): ${v.help}`);
  }
}

const browser = await chromium.launch({ channel: 'chrome' });

try {
  /* --------------------------------------------------------------- public */
  const anon = await browser.newContext({ locale: 'ar-EG' });
  const page = await anon.newPage();

  // A basket, so the cart and checkout have something to audit.
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  const slugs = await page.evaluate(async () => {
    const home = await (await fetch('/')).text();
    return [...new Set([...home.matchAll(/\/p\/([a-z-]+)/g)].map((m) => m[1]))];
  });
  let added = 0;
  for (const slug of slugs) {
    if (added === 2) break;
    await page.goto(`${BASE}/p/${slug}`, { waitUntil: 'networkidle' });
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
  ];

  for (const size of WIDTHS) {
    await page.setViewportSize({ width: size.width, height: size.height });
    for (const [surface, path] of publicRoutes) {
      await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
      await auditPage(page, surface, size.name);
    }
  }

  /* --------------------------------------------------------------- seller */
  const house = await browser.newContext({ locale: 'ar-EG', viewport: { width: 1280, height: 900 } });
  const seller = await house.newPage();
  await seller.goto(`${BASE}/seller`, { waitUntil: 'networkidle' });
  await fill(seller, 'رقم الموبايل', '01001112222');
  await seller.locator('button[type="submit"]').click();
  await seller.waitForTimeout(1800);
  await fill(seller, 'رمز التحقّق', codeFor('01001112222'));
  await seller.locator('button[type="submit"]').click();
  await seller.waitForURL('**/seller/orders', { timeout: 20_000 });

  for (const size of WIDTHS) {
    await seller.setViewportSize({ width: size.width, height: size.height });
    for (const [surface, path] of [['seller-queue', '/seller/orders'], ['seller-payouts', '/seller/payouts']]) {
      await seller.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
      await auditPage(seller, surface, size.name);
    }
  }

  /* ------------------------------------------------------------------ ops */
  const opsContext = await browser.newContext({ locale: 'ar-EG', viewport: { width: 1280, height: 900 } });
  const ops = await opsContext.newPage();
  await ops.goto(`${BASE}/ops`, { waitUntil: 'networkidle' });
  await fill(ops, 'رقم الموبايل', '01000000001');
  await ops.locator('button[type="submit"]').click();
  await ops.waitForTimeout(1800);
  await fill(ops, 'رمز التحقّق', codeFor('01000000001'));
  await ops.locator('button[type="submit"]').click();
  await ops.waitForURL('**/ops/queue', { timeout: 20_000 });

  // The content console is held to the same standard as the shopfront. It is
  // an internal tool, which is exactly why it gets skipped — and it is a tool
  // people use for hours, which is why it should not be.
  const opsRoutes = [['ops-queue', '/ops/queue'], ['ops-content', '/ops/content']];

  for (const size of WIDTHS) {
    await ops.setViewportSize({ width: size.width, height: size.height });
    for (const [surface, path] of opsRoutes) {
      await ops.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
      await auditPage(ops, surface, size.name);
    }
  }

  // And one page editor, which is where every form control in the CMS lives.
  const firstPage = await ops.locator('a[href^="/ops/content/"]').first().getAttribute('href');
  if (firstPage) {
    for (const size of WIDTHS) {
      await ops.setViewportSize({ width: size.width, height: size.height });
      await ops.goto(`${BASE}${firstPage}`, { waitUntil: 'networkidle' });
      await auditPage(ops, 'ops-page-editor', size.name);
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
  record('audit', '—', 'crashed', String(error.message ?? error).split(String.fromCharCode(10))[0]);
} finally {
  await browser.close();
}

/* ------------------------------------------------------------------ report */
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
  console.log('\nNo findings. Every surface, every width.\n');
} else {
  console.log(`\n${findings.length} findings across ${bySurface.size} surfaces:\n`);
  for (const [surface, rules] of bySurface) {
    console.log(`  ${surface}`);
    for (const [detail, widths] of rules) {
      console.log(`    · ${detail}   [${[...widths].join(', ')}]`);
    }
    console.log('');
  }
}

process.exit(findings.length === 0 ? 0 : 1);
