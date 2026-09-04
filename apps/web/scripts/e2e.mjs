/**
 * End-to-end: every journey, every control, in a real browser.
 *
 * The 420 unit and integration tests prove the parts. These prove the SEAMS —
 * and every defect this project has shipped lived in a seam. Nothing moved an
 * order from `placed` to `awaiting_seller`, so a queue full of orders had a
 * confirm button that could not legally act. A sign-in form swallowed an
 * exception and sat there disabled. A grid rendered at opacity zero. Each layer
 * was individually correct and separately tested.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO is reach past the interface. It clicks
 * what a person clicks and reads what a person reads, because a test that sets
 * up its own state through the API proves the API works — which is already
 * proven — and skips the wiring, which is not.
 *
 * Run: node scripts/e2e.mjs   (DEV_LOG must point at the dev server log)
 */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://localhost:3100';
const LOG = process.env.DEV_LOG;

/* ------------------------------------------------------------ tiny harness */

const results = [];
let currentGroup = '';

function group(name) {
  currentGroup = name;
  console.log(`\n${name}`);
}

async function test(name, fn) {
  const started = Date.now();
  try {
    await fn();
    results.push({ group: currentGroup, name, ok: true });
    console.log(`  ✓ ${name}  ${Date.now() - started}ms`);
  } catch (error) {
    const message = String(error.message ?? error);
    results.push({ group: currentGroup, name, ok: false, error: message });
    // Every line, indented. The first draft printed only line one, which threw
    // away the diagnostic a failing test had gone to the trouble of building
    // and sent me chasing an empty queue that was merely still loading.
    console.log(`  ✗ ${name}\n${message.split('\n').map((l) => `      ${l.trim()}`).join('\n')}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function equal(actual, expected, what) {
  if (actual !== expected) throw new Error(`${what}: expected ${expected}, got ${actual}`);
}

/* ------------------------------------------------------------- page helpers */

function codeFor(phone) {
  const lines = readFileSync(LOG, 'utf8').split('\n').filter((l) => l.includes(phone));
  const match = lines.at(-1)?.match(/(\d{6})\s*$/);
  if (!match) throw new Error(`No one-time code was printed for ${phone}`);
  return match[1];
}

async function fieldId(page, labelStartsWith) {
  const label = page.locator('label', { hasText: labelStartsWith }).first();
  await label.waitFor({ state: 'visible', timeout: 10_000 });
  return label.getAttribute('for');
}

async function fill(page, labelStartsWith, value) {
  await page.fill(`#${await fieldId(page, labelStartsWith)}`, value);
}

/** The buy button starts disabled until the cart store hydrates. */
async function buyButton(page) {
  const button = page.locator('button:visible').filter({ hasText: /أضف إلى الحقيبة|غير متاح/ }).first();
  await button.waitFor({ state: 'visible', timeout: 10_000 });
  for (let i = 0; i < 25; i += 1) {
    if (!(await button.isDisabled())) return { button, enabled: true };
    await page.waitForTimeout(300);
  }
  return { button, enabled: false };
}

/**
 * Every money figure on the page, in piastres, in the order it is rendered.
 *
 * Prices are Western digits with thousands separators and a trailing EGP, and
 * always two decimals — the numerals module renders money as `data`, never as
 * editorial, precisely so it can be read and compared rather than admired.
 */
async function moneyOnScreen(page) {
  const text = await page.locator('main').innerText();
  return [...text.matchAll(/([\d,]+(?:\.\d{1,2})?)\s*EGP/g)]
    .map((m) => Math.round(Number(m[1].replace(/,/g, '')) * 100));
}

const piastres = (n) => `${(n / 100).toFixed(2)} EGP`;

async function addToBag(page, slug) {
  await page.goto(`${BASE}/p/${slug}`, { waitUntil: 'networkidle' });
  const { button, enabled } = await buyButton(page);
  if (!enabled) return false;
  await button.click();
  await page.waitForTimeout(500);
  return true;
}

async function cartEntries(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('diyar.cart.v1') ?? '[]'));
}

/** Seeded identities. Their one-time codes are read back out of the dev log. */
const SELLERS = ['01001112222', '01113334444', '01225556666'];
const OPERATOR = '01000000001';

/**
 * A phone belonging to THIS RUN, so the seller queues can be counted for it.
 *
 * It was a fixed number, and the count test passed once and then failed
 * forever: the development database persists between runs, so the second run
 * found the first run's order sitting beside its own and reported a duplicate.
 * A test that counts rows has to own the rows it counts.
 *
 * Shaped as a real Egyptian mobile — `010` and eight digits — because the
 * validation that this order has to pass is the point of placing it.
 */
const DOUBLE_TAP_PHONE = `010${String(Date.now()).slice(-8)}`;

const ADDRESS = {
  'المدينة': 'المهندسين',
  'المنطقة': 'الدقي',
  'الشارع': 'شارع البهراء',
  'رقم العقار': '21',
};

async function fillCheckout(page, { name = 'مروة خليل', phone = '01011112222' } = {}) {
  await fill(page, 'الاسم بالكامل', name);
  await fill(page, 'رقم الموبايل', phone);
  for (const [label, value] of Object.entries(ADDRESS)) await fill(page, label, value);
}

async function signIn(page, path, phone, destination) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
  await fill(page, 'رقم الموبايل', phone);
  await page.locator('button[type="submit"]').click();
  await page.waitForTimeout(1800);
  await fill(page, 'رمز التحقّق', codeFor(phone));
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(`**${destination}`, { timeout: 20_000 });
  await settled(page);
}

/**
 * Wait for the screen to STOP LOADING, not merely for the URL to change.
 *
 * Both portals render their shell on the server and fetch the queue from the
 * client, so the moment the URL changes the page is a header and the word
 * "loading". Reading it then finds no orders and no controls — which is
 * indistinguishable from an empty queue, and read exactly like one for two
 * rounds of debugging.
 */
async function settled(page) {
  await page.waitForFunction(
    () => !(document.querySelector('main')?.innerText ?? '').includes('جارٍ التحميل'),
    undefined,
    { timeout: 20_000 },
  );
}

/* --------------------------------------------------------------------- run */

const browser = await chromium.launch({ channel: 'chrome' });
const DESKTOP = { width: 1280, height: 900 };

let slugs = [];
let inStock = [];
let outOfStock = null;

try {
  /* =================================================== the buyer's journey */
  group('the buyer, from browsing to a tracked order');

  const shopperContext = await browser.newContext({ viewport: DESKTOP, locale: 'ar-EG' });
  const shopper = await shopperContext.newPage();

  await test('the home page lists the published catalogue', async () => {
    await shopper.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    slugs = await shopper.evaluate(async () => {
      const home = await (await fetch('/')).text();
      return [...new Set([...home.matchAll(/\/p\/([a-z-]+)/g)].map((m) => m[1]))];
    });
    assert(slugs.length >= 3, `expected the seeded catalogue, saw ${slugs.length}`);
  });

  await test('an out-of-stock product cannot be added, and says so', async () => {
    // نخيل is seeded with zero stock on purpose. The control must be disabled
    // AND labelled — a disabled button with the same label reads as broken.
    for (const slug of slugs) {
      await shopper.goto(`${BASE}/p/${slug}`, { waitUntil: 'networkidle' });
      const { button, enabled } = await buyButton(shopper);
      if (!enabled) {
        outOfStock = slug;
        const label = (await button.innerText()).trim();
        assert(label.includes('غير متاح'), `a disabled buy button must say why, said "${label}"`);
      } else {
        inStock.push(slug);
      }
    }
    assert(outOfStock !== null, 'the fixture must include an out-of-stock product');
    assert(inStock.length >= 2, 'the fixture must include two sellable products');
  });

  await test('adding to the bag confirms in place, and persists', async () => {
    await shopper.evaluate(() => localStorage.removeItem('diyar.cart.v1'));
    await shopper.reload({ waitUntil: 'networkidle' });

    assert(await addToBag(shopper, inStock[0]), 'the first product must be sellable');
    const label = await shopper.locator('button:visible').filter({ hasText: /الحقيبة/ }).first().innerText();
    assert(label.includes('أُضيف'), `the control must confirm; it read "${label.trim()}"`);

    const entries = await cartEntries(shopper);
    equal(entries.length, 1, 'entries after one add');
  });

  await test('the bag survives a reload', async () => {
    await shopper.reload({ waitUntil: 'networkidle' });
    const entries = await cartEntries(shopper);
    equal(entries.length, 1, 'entries after reload');
  });

  await test('a second house makes a second parcel, with its own delivery', async () => {
    assert(await addToBag(shopper, inStock[1]), 'the second product must be sellable');
    await shopper.goto(`${BASE}/cart`, { waitUntil: 'networkidle' });
    await shopper.waitForTimeout(2000);

    const text = await shopper.locator('main').innerText();
    assert(text.includes('شحنتان'), 'two houses must read as two shipments (the dual)');

    // Two delivery lines, one per house.
    const deliveries = (text.match(/توصيل هذه الدار/g) ?? []).length;
    equal(deliveries, 2, 'per-house delivery lines');
  });

  await test('the quantity stepper adds, subtracts, and removes at one', async () => {
    const plus = shopper.locator('button[aria-label^="زيادة"]').first();
    await plus.click();
    await shopper.waitForTimeout(1500);
    let entries = await cartEntries(shopper);
    assert(entries.some((e) => e.quantity === 2), 'a line must reach quantity 2');

    const minus = shopper.locator('button[aria-label^="إنقاص"]').first();
    await minus.click();
    await shopper.waitForTimeout(1500);
    entries = await cartEntries(shopper);
    assert(entries.every((e) => e.quantity === 1), 'the line must come back to 1');

    // At one, the control removes rather than decrementing to zero.
    const remove = shopper.locator('button[aria-label^="إزالة"]').first();
    await remove.click();
    await shopper.waitForTimeout(1500);
    entries = await cartEntries(shopper);
    equal(entries.length, 1, 'entries after removing one line');
  });

  await test('an emptied bag offers the way out instead of a dead end', async () => {
    await shopper.evaluate(() => localStorage.setItem('diyar.cart.v1', '[]'));
    await shopper.goto(`${BASE}/cart`, { waitUntil: 'networkidle' });
    await shopper.waitForTimeout(1500);
    const text = await shopper.locator('main').innerText();
    assert(text.includes('فارغة'), 'an empty bag must say so');
    assert(await shopper.locator('a[href="/"]').count() > 0, 'and must offer the catalogue');
  });

  /* ------------------------------------------------------------- checkout */
  group('checkout refuses what it should, and only that');

  await test('an empty form reports every missing field at once', async () => {
    await addToBag(shopper, inStock[0]);
    await shopper.goto(`${BASE}/checkout`, { waitUntil: 'networkidle' });
    await shopper.waitForTimeout(1500);
    await shopper.locator('button[type="submit"]').click();
    await shopper.waitForTimeout(600);

    const alerts = await shopper.locator('[role="alert"]').count();
    // Name, phone, city, area, street, building.
    assert(alerts >= 6, `expected every missing field flagged at once, saw ${alerts}`);
  });

  await test('rejects phone numbers that are not Egyptian mobiles', async () => {
    for (const bad of ['12345', '01712345678', '0101111222', '+441234567890', 'abcdefghijk']) {
      await fill(shopper, 'رقم الموبايل', bad);
      await shopper.locator('button[type="submit"]').click();
      await shopper.waitForTimeout(400);
      const text = await shopper.locator('main').innerText();
      assert(text.includes('رقم موبايل مصري غير صحيح'), `"${bad}" must be refused`);
    }
  });

  await test('accepts every valid Egyptian prefix, and +20', async () => {
    for (const good of ['01012345678', '01112345678', '01212345678', '01512345678', '+201012345678']) {
      await fillCheckout(shopper, { phone: good });
      await shopper.locator('button[type="submit"]').click();
      await shopper.waitForTimeout(700);
      const stillOnForm = await shopper.locator('main').innerText();
      assert(
        !stillOnForm.includes('رقم موبايل مصري غير صحيح'),
        `"${good}" is a valid Egyptian mobile and was refused`,
      );
      if (stillOnForm.includes('تم استلام طلبك')) {
        // It went through — restock the bag and carry on.
        await addToBag(shopper, inStock[0]);
        await shopper.goto(`${BASE}/checkout`, { waitUntil: 'networkidle' });
        await shopper.waitForTimeout(1200);
      }
    }
  });

  await test('accepts a phone typed in Arabic-Indic numerals', async () => {
    // An Egyptian keyboard produces ٠١٢…, and every validator downstream reads
    // Western digits. Before the field normalised as it typed, a customer
    // entering their own number in their own numerals was told it was not a
    // valid Egyptian mobile with nothing on screen to say what was wrong.
    await shopper.goto(`${BASE}/checkout`, { waitUntil: 'networkidle' });
    await shopper.waitForTimeout(1500);

    const id = await fieldId(shopper, 'رقم الموبايل');
    await shopper.fill(`#${id}`, '٠١٠١١١١٢٢٢٢');

    // The field shows what it understood, while the customer is still looking.
    equal(await shopper.inputValue(`#${id}`), '01011112222', 'the field after typing');
  });

  await test('a street name keeps the numerals it was given', async () => {
    // Only digits-as-data are converted. An address line is prose, and
    // rewriting the numerals inside it would be the site correcting a
    // customer's own words back at them.
    const id = await fieldId(shopper, 'الشارع');
    await shopper.fill(`#${id}`, 'شارع ٢٦ يوليو');
    equal(await shopper.inputValue(`#${id}`), 'شارع ٢٦ يوليو', 'the street after typing');
  });

  let reference = null;

  await test('a complete order is placed and returns a readable reference', async () => {
    await addToBag(shopper, inStock[0]);
    await addToBag(shopper, inStock[1]);
    await shopper.goto(`${BASE}/checkout`, { waitUntil: 'networkidle' });
    await shopper.waitForTimeout(1500);
    await fillCheckout(shopper);
    await shopper.locator('button[type="submit"]').click();
    await shopper.waitForTimeout(4000);

    const text = await shopper.locator('main').innerText();
    reference = text.match(/DY-[A-Z0-9]{8}/)?.[0] ?? null;
    assert(reference, `no reference on the confirmation:\n${text.slice(0, 200)}`);
    assert(
      /^DY-[CDFHJKMNPQRVWXY349]{8}$/.test(reference),
      `${reference} uses a character outside the spoken-aloud alphabet`,
    );
  });

  await test('the bag is emptied only after the order is confirmed', async () => {
    const entries = await cartEntries(shopper);
    equal(entries.length, 0, 'entries after a confirmed order');
  });

  /* ------------------------------------------------------------- tracking */
  group('order tracking discloses nothing without both factors');

  /**
   * What tracking actually discloses, captured from the SUCCESSFUL lookup.
   *
   * The refusal tests below assert that none of it appears. Writing that list by
   * hand is how a security test goes quietly vacuous: my first draft asserted
   * the delivery address does not leak, and this screen never renders an address
   * under any circumstances — so it passed, and would have passed just as
   * happily with the phone check deleted entirely. Deriving the list from the
   * positive case means a refusal test can only pass for the right reason.
   */
  let disclosed = [];

  await test('finds the order with the reference and the right phone', async () => {
    await shopper.goto(`${BASE}/order`, { waitUntil: 'networkidle' });
    await fill(shopper, 'رقم الطلب', reference);
    await fill(shopper, 'رقم الموبايل', '01011112222');
    await shopper.locator('button[type="submit"]').click();
    await shopper.waitForTimeout(2500);

    const text = await shopper.locator('main').innerText();
    assert(text.includes(reference), 'the order must be found');
    assert(text.includes('مروة خليل'), 'the confirmation names the customer');
    assert(text.includes('الإجمالي عند الاستلام'), 'and states what is owed on delivery');

    disclosed = [reference, 'مروة خليل', 'الإجمالي عند الاستلام'];
  });

  await test('forgives lowercase, spaces and a missing hyphen', async () => {
    await shopper.goto(`${BASE}/order`, { waitUntil: 'networkidle' });
    await fill(shopper, 'رقم الطلب', reference.toLowerCase().replace('-', ' '));
    await fill(shopper, 'رقم الموبايل', '01011112222');
    await shopper.locator('button[type="submit"]').click();
    await shopper.waitForTimeout(2500);
    assert((await shopper.locator('main').innerText()).includes(reference), 'must normalise input');
  });

  await test('a correct reference with the WRONG phone discloses nothing', async () => {
    await shopper.goto(`${BASE}/order`, { waitUntil: 'networkidle' });
    await fill(shopper, 'رقم الطلب', reference);
    await fill(shopper, 'رقم الموبايل', '01099998888');
    await shopper.locator('button[type="submit"]').click();
    await shopper.waitForTimeout(2500);

    const text = await shopper.locator('main').innerText();
    assert(text.includes('لا يوجد طلب مطابق'), 'must refuse');
    for (const secret of disclosed) {
      assert(!text.includes(secret), `"${secret}" leaked to a wrong phone number`);
    }
  });

  await test('an unknown reference is refused with the SAME message', async () => {
    // Different wording would turn this endpoint into a way to discover which
    // references exist.
    await shopper.goto(`${BASE}/order`, { waitUntil: 'networkidle' });
    await fill(shopper, 'رقم الطلب', 'DY-CDFHJKMN');
    await fill(shopper, 'رقم الموبايل', '01011112222');
    await shopper.locator('button[type="submit"]').click();
    await shopper.waitForTimeout(2500);
    assert(
      (await shopper.locator('main').innerText()).includes('لا يوجد طلب مطابق'),
      'an unknown reference and a wrong phone must be indistinguishable',
    );
  });

  /* ============================================================== the money */
  group('the same figure survives four screens and a database');

  /**
   * A marketplace can survive a wrong colour. It cannot survive a total that
   * changes between the bag and the door, and the arithmetic that produces it
   * crosses a currency type, a settlement service, a database CHECK, four
   * server components and a client store. Every one of those has its own tests.
   * None of them can tell you the customer was quoted the same number twice.
   */
  let quoted = null;

  await test('the bag totals its own lines', async () => {
    await shopper.evaluate(() => localStorage.removeItem('diyar.cart.v1'));
    await addToBag(shopper, inStock[0]);
    await addToBag(shopper, inStock[1]);
    await shopper.goto(`${BASE}/cart`, { waitUntil: 'networkidle' });
    await shopper.waitForTimeout(2200);

    const figures = await moneyOnScreen(shopper);
    assert(figures.length >= 5, `expected lines, deliveries and a summary, saw ${figures.length}`);

    /*
     * The bag states the money TWICE — once as detail (a total per line, a
     * delivery per house) and once as a summary (merchandise, delivery, total).
     * That is deliberate: the summary is what the customer checks, the detail
     * is what they argue with.
     *
     * Which makes this the strongest arithmetic assertion on the site. Both
     * halves must land on the same number, so a mistake in either one is
     * visible here rather than at the door.
     */
    quoted = figures.at(-1);
    const [merchandise, delivery] = figures.slice(-3, -1);
    const detail = figures.slice(0, -3).reduce((a, b) => a + b, 0);

    equal(piastres(merchandise + delivery), piastres(quoted), 'the summary against the total');
    equal(piastres(detail), piastres(quoted), 'the detail against the total');
  });

  await test('checkout quotes the bag, to the piastre', async () => {
    await shopper.goto(`${BASE}/checkout`, { waitUntil: 'networkidle' });
    await shopper.waitForTimeout(1800);
    const figures = await moneyOnScreen(shopper);
    equal(piastres(figures.at(-1)), piastres(quoted), 'the checkout total against the bag');
  });

  let moneyReference = null;

  await test('the confirmation states the same number', async () => {
    await fillCheckout(shopper, { phone: '01044445555' });
    await shopper.locator('button[type="submit"]').click();
    await shopper.waitForTimeout(4500);

    const text = await shopper.locator('main').innerText();
    moneyReference = text.match(/DY-[A-Z0-9]{8}/)?.[0] ?? null;
    assert(moneyReference, 'the order must have been placed');

    const figures = await moneyOnScreen(shopper);
    assert(figures.length > 0, 'the confirmation must state what is owed');
    assert(
      figures.some((f) => piastres(f) === piastres(quoted)),
      `the confirmation shows ${figures.map(piastres).join(', ')}, quoted ${piastres(quoted)}`,
    );
  });

  await test('and so does the tracking page, after a database round trip', async () => {
    // This is the one that crosses the persistence boundary: the figures here
    // were written as integer piastres, read back, and re-formatted. A float
    // anywhere along that path shows up as a total ending in .9999.
    await shopper.goto(`${BASE}/order`, { waitUntil: 'networkidle' });
    await fill(shopper, 'رقم الطلب', moneyReference);
    await fill(shopper, 'رقم الموبايل', '01044445555');
    await shopper.locator('button[type="submit"]').click();
    await shopper.waitForTimeout(3000);

    const figures = await moneyOnScreen(shopper);
    equal(piastres(figures.at(-1)), piastres(quoted), 'the tracked total against the quote');

    // And it still reconciles against its own parts on the far side.
    const parts = figures.slice(0, -1).reduce((a, b) => a + b, 0);
    equal(piastres(parts), piastres(quoted), 'the tracked total against its own lines');
  });

  await test('no figure carries a rounding artefact', async () => {
    // Money is integer piastres end to end. A figure that reaches the screen
    // with more than two decimals, or as .9999, means something along the way
    // did the arithmetic in floating point.
    const text = await shopper.locator('main').innerText();
    const suspicious = [...text.matchAll(/[\d,]+\.(\d{3,})\s*EGP/g)].map((m) => m[0]);
    equal(suspicious.length, 0, `figures with more than two decimals: ${suspicious.join(', ')}`);
    assert(!/\.9{3,}|\.0{2,}\d/.test(text), 'a figure shows a floating-point artefact');
  });

  /* ================================================== concurrency and tabs */
  group('two tabs, one bag, and a double-tapped submit');

  await test('a second tab sees what the first tab put in the bag', async () => {
    await shopper.evaluate(() => localStorage.removeItem('diyar.cart.v1'));
    await addToBag(shopper, inStock[0]);

    const second = await shopperContext.newPage();
    await second.goto(`${BASE}/cart`, { waitUntil: 'networkidle' });
    await second.waitForTimeout(2000);
    const entries = await second.evaluate(() =>
      JSON.parse(localStorage.getItem('diyar.cart.v1') ?? '[]'));
    equal(entries.length, 1, 'lines visible in the second tab');
    await second.close();
  });

  await test('double-tapping "place the order" places ONE order', async () => {
    // A slow connection and an impatient thumb is the commonest way a customer
    // creates two identical orders. The control must go inert on the first
    // PRESS, not on the first response — the gap between the two is exactly
    // where the duplicate is born.
    await shopper.goto(`${BASE}/checkout`, { waitUntil: 'networkidle' });
    await shopper.waitForTimeout(1500);
    await fillCheckout(shopper, { phone: DOUBLE_TAP_PHONE });

    const submit = shopper.locator('button[type="submit"]');
    await submit.click();
    const inertAtOnce = await submit.isDisabled().catch(() => true);
    await submit.click({ force: true, timeout: 2000 }).catch(() => {});
    await shopper.waitForTimeout(5000);

    assert(inertAtOnce, 'the submit control must go inert on the first press');

    // Counting references on the CONFIRMATION is not a test: a duplicate order
    // gets its own reference on its own page, and this page would show one
    // either way. The count that matters is how many orders reached a house,
    // so the phone used here is checked against the seller queues further down.
    const text = await shopper.locator('main').innerText();
    assert(/DY-[A-Z0-9]{8}/.test(text), 'the order must have been placed at all');
  });

  /* ================================================ keyboard-only traversal */
  group('the whole purchase reachable without a mouse');

  await test('Tab reaches the buy control and Enter activates it', async () => {
    await shopper.evaluate(() => localStorage.removeItem('diyar.cart.v1'));
    await shopper.goto(`${BASE}/p/${inStock[0]}`, { waitUntil: 'networkidle' });
    await buyButton(shopper);

    let reached = false;
    for (let i = 0; i < 40; i += 1) {
      await shopper.keyboard.press('Tab');
      const label = await shopper.evaluate(() =>
        (document.activeElement?.textContent ?? '').trim());
      if (label.includes('أضف إلى الحقيبة')) { reached = true; break; }
    }
    assert(reached, 'the buy control must be reachable by Tab alone');

    // And the focused control must be ON SCREEN. A focus ring that exists in
    // CSS but sits on an element scrolled out of view is the same as no focus
    // ring at all for the person relying on it.
    const onScreen = await shopper.evaluate(() => {
      const el = document.activeElement;
      if (!el) return false;
      const box = el.getBoundingClientRect();
      return box.bottom > 0 && box.top < window.innerHeight;
    });
    assert(onScreen, 'the focused control must be scrolled into view');

    await shopper.keyboard.press('Enter');
    await shopper.waitForTimeout(1000);
    equal((await cartEntries(shopper)).length, 1, 'lines after activating by keyboard');
  });

  await test('no positive tabindex anywhere — it reorders the whole page', async () => {
    for (const path of ['/', `/p/${inStock[0]}`, '/cart', '/checkout', '/order']) {
      await shopper.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
      const offenders = await shopper.evaluate(() =>
        [...document.querySelectorAll('[tabindex]')]
          .filter((el) => Number(el.getAttribute('tabindex')) > 0)
          .map((el) => el.tagName));
      equal(offenders.length, 0, `positive tabindex on ${path}`);
    }
  });

  await shopperContext.close();

  /* ====================================================== the seller portal */
  group('the seller portal, and the wall around each house');

  for (const path of ['/seller/orders', '/seller/payouts']) {
    await test(`${path} is closed to anyone not signed in`, async () => {
      const stranger = await browser.newContext({ viewport: DESKTOP, locale: 'ar-EG' });
      const page = await stranger.newPage();
      await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
      assert(!page.url().includes(path), `reached ${path} unauthenticated: ${page.url()}`);
      await stranger.close();
    });
  }

  await test('a wrong one-time code is refused, and says so', async () => {
    const context = await browser.newContext({ viewport: DESKTOP, locale: 'ar-EG' });
    const page = await context.newPage();
    await page.goto(`${BASE}/seller`, { waitUntil: 'networkidle' });
    await fill(page, 'رقم الموبايل', SELLERS[0]);
    await page.locator('button[type="submit"]').click();
    await page.waitForTimeout(1800);

    const real = codeFor(SELLERS[0]);
    const wrong = String((Number(real) + 1) % 1000000).padStart(6, '0');
    await fill(page, 'رمز التحقّق', wrong);
    await page.locator('button[type="submit"]').click();
    await page.waitForTimeout(2500);

    assert(!page.url().includes('/seller/orders'), 'a wrong code must not sign anyone in');
    const text = await page.locator('main').innerText();
    assert(/غير صحيح|غير صالح|انتهت/.test(text), `must say why; screen read:\n${text.slice(0, 160)}`);
    await context.close();
  });

  /** Sign in as each house until one is found holding work. */
  let sellerContext = null;
  let seller = null;
  let workingHouse = null;

  await test('an owner signs in and lands on their own queue', async () => {
    // A failure here has to say what each house SAW. The first version asserted
    // only that some house had work, and when it failed it could not
    // distinguish an empty queue from a sign-in that never completed — which
    // cost a probe script to answer a question the message should have carried.
    const seen = [];
    for (const phone of SELLERS) {
      const context = await browser.newContext({ viewport: DESKTOP, locale: 'ar-EG' });
      const page = await context.newPage();
      try {
        await signIn(page, '/seller', phone, '/seller/orders');
      } catch (error) {
        seen.push(`${phone}: sign-in failed — ${String(error.message).split('\n')[0]}`);
        await context.close();
        continue;
      }
      const text = await page.locator('main').innerText();
      if (text.includes('تأكيد')) {
        sellerContext = context; seller = page; workingHouse = phone;
        break;
      }
      seen.push(`${phone}: signed in, queue read "${text.slice(0, 90).replace(/\s+/g, ' ')}"`);
      await context.close();
    }
    assert(seller, `no house was holding work:\n      ${seen.join('\n      ')}`);
  });

  await test('the queue names the order and leaks no raw state', async () => {
    const text = await seller.locator('main').innerText();
    assert(/DY-[A-Z0-9]{8}/.test(text), 'the queue must name the order');
    const leaked = ['awaiting_seller', 'seller_confirmed', 'in_transit', 'out_of_stock']
      .filter((token) => text.includes(token));
    equal(leaked.length, 0, `raw enums on screen: ${leaked.join(', ')}`);
  });

  await test('confirming replaces the decision with the shipping step', async () => {
    await seller.locator('button', { hasText: /^تأكيد$/ }).first().click();
    await seller.waitForTimeout(3500);
    const text = await seller.locator('main').innerText();
    assert(text.includes('رقم الشحنة'), 'a confirmed order must ask for a tracking number');
  });

  await test('dispatch refuses a tracking number too short to be one', async () => {
    const field = seller.locator('input[id^="t-"]').first();
    const ship = seller.locator('button', { hasText: /تم الشحن/ }).first();

    await field.fill('');
    assert(await ship.isDisabled(), 'an empty tracking number must not dispatch');
    await field.fill('AB');
    assert(await ship.isDisabled(), 'two characters is not a waybill');
    await field.fill('  ');
    assert(await ship.isDisabled(), 'whitespace is not a waybill either');
    await field.fill('BOSTA-4471902');
    assert(!(await ship.isDisabled()), 'a real waybill must be accepted');
  });

  await test('dispatching moves the order out of the shipping step', async () => {
    // Counted before and after. `remaining < 2` was the first version, and it
    // would have passed with dispatch doing nothing at all — there is only ever
    // one order in the shipping step here, so "fewer than two" was true before
    // the click as well as after it.
    const before = await seller.locator('input[id^="t-"]').count();
    await seller.locator('button', { hasText: /تم الشحن/ }).first().click();
    await seller.waitForTimeout(4000);
    const after = await seller.locator('input[id^="t-"]').count();
    equal(after, before - 1, 'orders still awaiting a waybill');
  });

  await test('declining offers coded reasons and no free-text box', async () => {
    const decline = seller.locator('button', { hasText: /^اعتذار$/ }).first();
    if (await decline.count() === 0) return; // nothing left awaiting a decision
    await decline.click();
    await seller.waitForTimeout(800);
    const text = await seller.locator('main').innerText();
    assert(text.includes('نفد المخزون'), 'the coded reasons must appear');
    equal(await seller.locator('textarea').count(), 0, 'free-text boxes on the decline path');
    await seller.locator('button', { hasText: /^رجوع$/ }).first().click();
  });

  await test('EVERY decline reason actually declines an order', async () => {
    // Checking that the reasons RENDER is not the test. The portal offered a
    // fourth reason — `cannot_fulfil_sla` — that exists in no vocabulary the
    // system has: not the domain's, not the database enum, not the schema. It
    // rendered perfectly and did nothing when pressed, and a house saying no in
    // the one way the interface offered was simply ignored.
    const labels = ['نفد المخزون', 'خطأ في السعر', 'لا نوصّل إلى هذه المنطقة', 'اشتباه في الطلب'];

    for (const label of labels) {
      // Counted over ALL of them. The first version measured `.first()`, which
      // is one or zero by construction, against the full count — so it compared
      // 1 against 19 and called a successful decline a failure.
      const all = seller.locator('button', { hasText: /^اعتذار$/ });
      const before = await all.count();
      if (before === 0) break; // the queue ran out of decisions
      await all.first().click();
      await seller.waitForTimeout(700);

      const reason = seller.locator('button', { hasText: label }).first();
      assert(await reason.count() > 0, `"${label}" must be offered`);
      await reason.click();
      await seller.waitForTimeout(3500);

      const after = await seller.locator('button', { hasText: /^اعتذار$/ }).count();
      assert(
        after === before - 1,
        `declining with "${label}" left the order in the queue (${before} → ${after}) — the reason was refused`,
      );
    }
  });

  await test('the double-tapped order reached a house exactly ONCE', async () => {
    // The other half of the concurrency test above. If the submit control let a
    // second press through, that customer's phone appears twice in some queue.
    let sightings = 0;
    for (const phone of SELLERS) {
      const context = await browser.newContext({ viewport: DESKTOP, locale: 'ar-EG' });
      const page = await context.newPage();
      await signIn(page, '/seller', phone, '/seller/orders');
      const text = await page.locator('main').innerText();
      sightings += (text.match(new RegExp(DOUBLE_TAP_PHONE, 'g')) ?? []).length;
      await context.close();
    }
    equal(sightings, 1, 'sub-orders carrying the double-tapped phone');
  });

  await test('the payouts ledger opens, in words rather than enums', async () => {
    await seller.goto(`${BASE}/seller/payouts`, { waitUntil: 'networkidle' });
    await settled(seller);
    const text = await seller.locator('main').innerText();
    assert(text.length > 40, 'the payouts page must render something');
    const leaked = ['pending', 'settled', 'awaiting_', 'paid_out'].filter((t) => text.includes(t));
    equal(leaked.length, 0, `raw enums on the ledger: ${leaked.join(', ')}`);
  });

  await test('a seller session cannot open the operations console', async () => {
    // Two staff tables, two cookies. A seller reaching the ops queue would see
    // every house's money rather than their own.
    await seller.goto(`${BASE}/ops/queue`, { waitUntil: 'networkidle' });
    assert(!seller.url().includes('/ops/queue'), `a seller reached ops: ${seller.url()}`);
  });

  /* ==================================================== the ops console */
  group('the operations console');

  await test('the ops queue is closed to anyone not signed in', async () => {
    const stranger = await browser.newContext({ viewport: DESKTOP, locale: 'ar-EG' });
    const page = await stranger.newPage();
    await page.goto(`${BASE}/ops/queue`, { waitUntil: 'networkidle' });
    assert(!page.url().includes('/ops/queue'), `reached ops unauthenticated: ${page.url()}`);
    await stranger.close();
  });

  await test('a SELLER phone cannot sign in to operations', async () => {
    const context = await browser.newContext({ viewport: DESKTOP, locale: 'ar-EG' });
    const page = await context.newPage();
    await page.goto(`${BASE}/ops`, { waitUntil: 'networkidle' });
    await fill(page, 'رقم الموبايل', workingHouse);
    await page.locator('button[type="submit"]').click();
    await page.waitForTimeout(1800);
    try {
      await fill(page, 'رمز التحقّق', codeFor(workingHouse));
      await page.locator('button[type="submit"]').click();
      await page.waitForTimeout(3000);
    } catch {
      // Refused before the code step, which is also a correct outcome.
    }
    assert(!page.url().includes('/ops/queue'), 'a seller signed in to the ops console');
    await context.close();
  });

  let opsContext = null;
  let ops = null;

  await test('an operator signs in', async () => {
    opsContext = await browser.newContext({ viewport: DESKTOP, locale: 'ar-EG' });
    ops = await opsContext.newPage();
    await signIn(ops, '/ops', OPERATOR, '/ops/queue');
  });

  await test('the queue says how long each parcel has been waiting', async () => {
    const text = await ops.locator('main').innerText();
    assert(/يوم|اليوم|ساعة|منذ/.test(text), 'a queue without an age is only a list');
  });

  await test('no raw state names reach the operator', async () => {
    const text = await ops.locator('main').innerText();
    const leaked = ['awaiting_seller', 'in_transit', 'out_of_stock', 'seller_confirmed']
      .filter((token) => text.includes(token));
    equal(leaked.length, 0, `raw enums on screen: ${leaked.join(', ')}`);
  });

  /* ================================================================ the CMS */
  group('editorial content, from an empty page to the shopfront');

  /*
   * The console is driven through the interface, and every claim is checked
   * against what an ANONYMOUS visitor actually gets. A CMS test that only reads
   * the console is a test that the console agrees with itself.
   */
  const probeSlug = `probe-${Date.now().toString(36)}`;
  /*
   * A title THIS RUN owns.
   *
   * The first version asserted that "صفحة اختبار" was absent from the footer
   * after archiving, and a page left over from an earlier session was still
   * live under that name — so the test failed over someone else's data. A test
   * that asserts about a name has to be the only thing using it.
   */
  const probeTitle = `صفحة اختبار ${probeSlug}`;
  let probeUrl = null;

  await test('creating a page leaves it off the site', async () => {
    await ops.goto(`${BASE}/ops/content`, { waitUntil: 'networkidle' });
    await ops.fill('#new-title', probeTitle);
    await ops.fill('#new-slug', probeSlug);
    await ops.locator('button', { hasText: 'إنشاء' }).click();
    await ops.waitForURL('**/ops/content/**', { timeout: 20_000 });
    probeUrl = ops.url();

    const response = await ops.request.get(`${BASE}/${probeSlug}`);
    equal(response.status(), 404, 'the public status of an unpublished page');
  });

  await test('publishing straight from a draft is not offered', async () => {
    // Review is not optional, and the console must not show a button the domain
    // will refuse. A control that renders and does nothing is the defect the
    // seller portal already shipped once.
    const actions = await ops.locator('button').allInnerTexts();
    assert(
      !actions.some((label) => label.trim() === 'نشر'),
      `"نشر" was offered on a fresh draft: ${actions.join(' | ')}`,
    );
    assert(actions.some((label) => label.includes('مراجعة')), 'review must be offered');
  });

  await test('a page with content goes to review and then live', async () => {
    await ops.locator('button', { hasText: '+ عنوان قسم' }).click();
    await ops.waitForTimeout(400);
    await ops.fill('#b0-text', 'قسم أول');
    await ops.locator('button', { hasText: '+ فقرة' }).click();
    await ops.waitForTimeout(400);
    await ops.fill('#b1-text', 'نص الفقرة.');

    await ops.locator('button', { hasText: 'حفظ المسودة' }).click();
    await ops.waitForTimeout(2500);
    await ops.locator('button', { hasText: 'إرسال للمراجعة' }).click();
    await ops.waitForTimeout(3000);

    await ops.locator('button', { hasText: /^نشر$/ }).click();
    await ops.waitForTimeout(3500);

    const response = await ops.request.get(`${BASE}/${probeSlug}`);
    equal(response.status(), 200, 'the public status after publishing');
    assert((await response.text()).includes('قسم أول'), 'the heading must reach the page');
  });

  await test('the actions do not vanish after a move', async () => {
    // They were cleared and left the operator on a screen with nothing to press
    // until they reloaded. The server returns the next legal moves now.
    const actions = await ops.locator('button').allInnerTexts();
    assert(
      actions.some((label) => label.includes('مسودة') || label.includes('أرشفة')),
      `no moves offered after publishing: ${actions.join(' | ')}`,
    );
  });

  await test('a published page STAYS live while it is edited', async () => {
    /*
     * The rule the whole content design turns on, checked end to end rather
     * than in the domain where it is easy.
     *
     * An editor opening a live page to fix a typo must not take the page down.
     * It is expressed in the domain, in the RLS policy, in the read model and
     * in the console, and any one of them written as `state = 'published'`
     * breaks it.
     */
    await ops.goto(probeUrl, { waitUntil: 'networkidle' });
    await ops.waitForTimeout(1500);
    await ops.locator('button', { hasText: 'إرجاع إلى المسودة' }).click();
    await ops.waitForTimeout(3000);

    const response = await ops.request.get(`${BASE}/${probeSlug}`);
    equal(response.status(), 200, 'the public status while a page is being edited');
    assert((await response.text()).includes('قسم أول'), 'it must still serve the published text');
  });

  await test('an unsaved edit does not reach the site', async () => {
    // The site serves the frozen revision, so typing cannot leak. Typed here
    // and read from outside, because "it cannot happen" is what every leak was
    // before it happened.
    await ops.fill('#b0-text', 'نص لم يُنشر بعد');
    await ops.waitForTimeout(500);

    const response = await ops.request.get(`${BASE}/${probeSlug}`);
    assert(!(await response.text()).includes('نص لم يُنشر بعد'), 'a draft edit leaked to the site');
  });

  await test('an empty block is refused, and the message names it', async () => {
    await ops.goto(probeUrl, { waitUntil: 'networkidle' });
    await ops.waitForTimeout(1500);
    await ops.locator('button', { hasText: '+ فقرة' }).click();
    await ops.waitForTimeout(400);
    await ops.locator('button', { hasText: 'إرسال للمراجعة' }).click();
    await ops.waitForTimeout(2500);
    await ops.locator('button', { hasText: /^نشر$/ }).click();
    await ops.waitForTimeout(3000);

    const objections = await ops.locator('[aria-live="polite"] li').allInnerTexts();
    assert(objections.length > 0, 'publishing an empty block must be refused');
    assert(
      objections.some((text) => /العنصر رقم/.test(text)),
      `the objection must say WHICH element: ${objections.join(' | ')}`,
    );
  });

  await test('archiving takes the page off the site', async () => {
    await ops.goto(probeUrl, { waitUntil: 'networkidle' });
    await ops.waitForTimeout(1500);
    const archive = ops.locator('button', { hasText: 'أرشفة' }).first();
    if (await archive.count() === 0) {
      // Not offered from `in_review`; go back to draft first.
      await ops.locator('button', { hasText: 'إرجاع إلى المسودة' }).click();
      await ops.waitForTimeout(2500);
    }
    await ops.locator('button', { hasText: 'أرشفة' }).first().click();
    await ops.waitForTimeout(3000);

    const response = await ops.request.get(`${BASE}/${probeSlug}`);
    equal(response.status(), 404, 'the public status of an archived page');
  });

  await test('a seller cannot reach the content console', async () => {
    const context = await browser.newContext({ viewport: DESKTOP, locale: 'ar-EG' });
    const page = await context.newPage();
    await page.goto(`${BASE}/ops/content`, { waitUntil: 'networkidle' });
    assert(!page.url().includes('/ops/content'), `reached the CMS unauthenticated: ${page.url()}`);
    await context.close();
  });

  await test('the published pages are linked from every screen', async () => {
    // The footer reads the live directory, so a page nobody can find is a page
    // nobody reads. Checked on the home page, which is where most visits start.
    const visitor = await browser.newContext({ viewport: DESKTOP, locale: 'ar-EG' });
    const page = await visitor.newPage();
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    const footer = await page.locator('footer').innerText();
    assert(footer.includes('عن ديار'), `the footer must link the live pages: ${footer}`);
    assert(!footer.includes(probeTitle), 'an archived page must not stay in the footer');
    await visitor.close();
  });

  await test('signing out ends the session for good', async () => {
    const out = ops.locator('button', { hasText: /خروج/ }).first();
    if (await out.count() === 0) return;
    await out.click();
    await ops.waitForTimeout(2500);
    await ops.goto(`${BASE}/ops/queue`, { waitUntil: 'networkidle' });
    assert(!ops.url().includes('/ops/queue'), 'a signed-out session still reached the queue');
  });

  if (sellerContext) await sellerContext.close();
  if (opsContext) await opsContext.close();
} finally {
  await browser.close();
}

/* ------------------------------------------------------------------ report */
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) {
  console.log('\nfailures:');
  for (const f of failed) console.log(`  · ${f.group} — ${f.name}\n      ${f.error}`);
}
process.exit(failed.length === 0 ? 0 : 1);
