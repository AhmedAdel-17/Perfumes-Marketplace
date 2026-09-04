/**
 * Screenshot every surface, signed in where a surface needs it.
 *
 * Drives the CHROME ALREADY INSTALLED on the machine (`channel: 'chrome'`)
 * rather than downloading Playwright's own build — a hundred megabytes to look
 * at a page we can already render.
 *
 * It signs in for real: requests a one-time code, reads it out of the dev
 * server's log, and enters it. That is slower than forging a session cookie and
 * it is the point — a screenshot taken through a faked session proves the page
 * renders, not that anyone can reach it.
 */
import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.env.BASE_URL ?? 'http://localhost:3100';
const OUT = process.env.SHOTS_DIR ?? './.shots';
const LOG = process.env.DEV_LOG;

const DESKTOP = { width: 1280, height: 900 };
const PHONE = { width: 390, height: 844 };

mkdirSync(OUT, { recursive: true });

/** The console OTP stub prints `<phone>  →  <code>`. */
function codeFor(phone) {
  if (!LOG) throw new Error('DEV_LOG must point at the dev server log');
  const lines = readFileSync(LOG, 'utf8').split('\n').filter((l) => l.includes(phone));
  const last = lines.at(-1);
  const match = last?.match(/(\d{6})\s*$/);
  if (!match) throw new Error(`No code found for ${phone}`);
  return match[1];
}

const shots = [];

async function shoot(page, name, { full = true } = {}) {
  const file = join(OUT, `${name}.png`);

  // Scroll the whole page first, then return to the top.
  //
  // Content below the fold is revealed on approach, so a full-page screenshot
  // of a page nobody scrolled captures it mid-entrance — the first run of this
  // script produced a home page with an empty void where the product grid is.
  // A reader scrolls; a screenshot has to as well.
  await page.evaluate(async () => {
    const step = Math.round(window.innerHeight * 0.8);
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 220));
    }
    window.scrollTo(0, 0);
    await new Promise((r) => setTimeout(r, 400));
  });

  await page.waitForTimeout(1200);          // let the entrance motion settle
  await page.screenshot({ path: file, fullPage: full });
  shots.push(file);
  console.log('  ·', name);
}

async function fill(page, labelStartsWith, value) {
  const label = page.locator('label', { hasText: labelStartsWith }).first();
  const id = await label.getAttribute('for');
  await page.fill(`#${id}`, value);
}

const browser = await chromium.launch({ channel: 'chrome' });

try {
  /* ------------------------------------------------------------- public */
  const shopper = await browser.newContext({ viewport: DESKTOP, locale: 'ar-EG' });
  const page = await shopper.newPage();

  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await shoot(page, '01-home-desktop');

  const firstProduct = await page.locator('a[href^="/p/"]').first().getAttribute('href');
  await page.goto(`${BASE}${firstProduct}`, { waitUntil: 'networkidle' });
  await shoot(page, '02-product-desktop');

  // Fill a bag from two houses, so the cart shows what it is actually for.
  const hrefs = await page.evaluate(async () => {
    const home = await (await fetch('/')).text();
    return [...new Set([...home.matchAll(/\/p\/([a-z-]+)/g)].map((m) => m[1]))];
  });
  // Skip anything out of stock: its button is permanently disabled, and
  // waiting for a disabled button to become clickable is a thirty-second
  // timeout that looks like a broken page. نخيل is seeded with zero stock on
  // purpose, so this path is exercised every run.
  let added = 0;
  for (const slug of hrefs) {
    if (added === 2) break;
    await page.goto(`${BASE}/p/${slug}`, { waitUntil: 'networkidle' });
    const buy = page.locator('button:visible').filter({ hasText: 'أضف إلى الحقيبة' }).first();
    await buy.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => undefined);

    // The button is disabled until the cart store has read localStorage, so an
    // immediate isDisabled() check reports every product out of stock. Poll for
    // it to become enabled; only a product that never does is actually out of
    // stock. (Worth noting on its own: between paint and hydration the primary
    // action is dead, which on a slow connection is a real window.)
    let enabled = false;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      if (await buy.count() === 0) break;
      if (!(await buy.isDisabled())) { enabled = true; break; }
      await page.waitForTimeout(400);
    }
    if (!enabled) {
      console.log('  skipped', slug, '(out of stock)');
      continue;
    }
    await buy.click();
    await page.waitForTimeout(600);
    added += 1;
  }
  console.log('  bag has', added, 'houses');

  await page.goto(`${BASE}/cart`, { waitUntil: 'networkidle' });
  await shoot(page, '03-cart-desktop');

  await page.goto(`${BASE}/checkout`, { waitUntil: 'networkidle' });
  await fill(page, 'الاسم بالكامل', 'مروة خليل');
  await fill(page, 'رقم الموبايل', '01011112222');
  await fill(page, 'المدينة', 'المهندسين');
  await fill(page, 'المنطقة', 'الدقي');
  await fill(page, 'الشارع', 'شارع البهراء');
  await fill(page, 'رقم العقار', '21');
  await fill(page, 'علامة مميزة', 'فوق صيدلية سيف');
  await shoot(page, '04-checkout-desktop');

  await page.locator('button[type="submit"]').click();
  await page.waitForTimeout(3000);
  await shoot(page, '05-order-confirmed');

  const reference = (await page.locator('main').innerText()).match(/DY-[A-Z0-9]+/)?.[0];
  console.log('  placed', reference);

  await page.goto(`${BASE}/order`, { waitUntil: 'networkidle' });
  await fill(page, 'رقم الطلب', reference);
  await fill(page, 'رقم الموبايل', '01011112222');
  await page.locator('button[type="submit"]').click();
  await page.waitForTimeout(2500);
  await shoot(page, '06-order-tracking');

  /* -------------------------------------------------------------- phone */
  const handset = await browser.newContext({ viewport: PHONE, locale: 'ar-EG', isMobile: true, hasTouch: true });
  const small = await handset.newPage();
  await small.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await shoot(small, '07-home-phone');
  await small.goto(`${BASE}${firstProduct}`, { waitUntil: 'networkidle' });
  await shoot(small, '08-product-phone');

  /* ------------------------------------------------------------- seller */
  const house = await browser.newContext({ viewport: DESKTOP, locale: 'ar-EG' });
  const seller = await house.newPage();

  await seller.goto(`${BASE}/seller`, { waitUntil: 'networkidle' });
  await shoot(seller, '09-seller-signin');

  await fill(seller, 'رقم الموبايل', '01001112222');
  await seller.locator('button[type="submit"]').click();
  await seller.waitForTimeout(2000);
  await fill(seller, 'رمز التحقّق', codeFor('01001112222'));
  await seller.locator('button[type="submit"]').click();
  await seller.waitForURL('**/seller/orders', { timeout: 20_000 });
  await shoot(seller, '10-seller-queue');

  // Confirm, then ship, so the queue's three stages are all visible.
  const confirm = seller.locator('button:visible').filter({ hasText: /^تأكيد$/ }).first();
  if (await confirm.count()) {
    await confirm.click();
    await seller.waitForTimeout(2500);
    await shoot(seller, '11-seller-ready-to-ship');

    const tracking = seller.locator('input').first();
    if (await tracking.count()) {
      await tracking.fill('BST99887766');
      await seller.locator('button:visible').filter({ hasText: 'تم الشحن' }).first().click();
      await seller.waitForTimeout(2500);
      await shoot(seller, '12-seller-dispatched');
    }
  }

  await seller.goto(`${BASE}/seller/payouts`, { waitUntil: 'networkidle' });
  await shoot(seller, '13-seller-payouts-empty');

  /* ---------------------------------------------------------------- ops */
  const opsContext = await browser.newContext({ viewport: DESKTOP, locale: 'ar-EG' });
  const ops = await opsContext.newPage();

  await ops.goto(`${BASE}/ops`, { waitUntil: 'networkidle' });
  await shoot(ops, '14-ops-signin');

  await fill(ops, 'رقم الموبايل', '01000000001');
  await ops.locator('button[type="submit"]').click();
  await ops.waitForTimeout(2000);
  await fill(ops, 'رمز التحقّق', codeFor('01000000001'));
  await ops.locator('button[type="submit"]').click();
  await ops.waitForURL('**/ops/queue', { timeout: 20_000 });
  await shoot(ops, '15-ops-queue');

  console.log(`\n${shots.length} screenshots in ${OUT}`);
} finally {
  await browser.close();
}
