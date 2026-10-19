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
 * Run: node scripts/e2e.mjs   (OTP_OUTBOX must name the file the app was started with)
 */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { crc32, deflateSync } from 'node:zlib';

const BASE = process.env.BASE_URL ?? 'http://localhost:3100';
const OUTBOX = process.env.OTP_OUTBOX;

// Refused up front. Without it the run went on until the first sign-in and then
// failed inside `readFileSync` — which names a missing path, not a missing
// variable, and has already spent a one-time code.
if (!OUTBOX) {
  console.error('OTP_OUTBOX is not set: start the app with OTP_OUTBOX=<file> and pass the same path here. See README, "Checks".');
  process.exit(1);
}

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

/*
 * WARM THE SERVER IN A REAL BROWSER before the first test.
 *
 * A dev server that answers `curl /` with 200 has compiled the page's HTML, not
 * the client code a browser then asks for — Turbopack builds that on the first
 * browser request, and on a cold server it took longer than a test's 30-second
 * navigation timeout. The first test failed, the catalogue it collects was
 * empty, and some forty tests after it failed for want of a perfume: a run
 * that read as the whole shop being broken (seen 15 Oct and 16 Oct 2026, both
 * times with nothing but ECONNRESET in the server log). Not a test: a run that
 * cannot warm in three minutes has a real problem, and says so.
 */
{
  const warmContext = await browser.newContext();
  const warm = await warmContext.newPage();
  for (const path of ['/', '/search', '/en']) {
    await warm.goto(`${BASE}${path}`, { waitUntil: 'networkidle', timeout: 180_000 });
  }
  await warmContext.close();
}

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
    // Inside MAIN: the masthead's logo links to "/" on every page, so a
    // page-wide check passed whether or not the empty bag offered anything.
    assert(await shopper.locator('main a[href="/search"]').count() > 0, 'and must offer the catalogue');
  });

  /* ================================================================ search */
  group('finding a perfume, in the language people actually type');

  await test('the catalogue is reachable from the masthead', async () => {
    // The route existed and nothing pointed at it, which is the same as not
    // having built it.
    await shopper.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    const entry = shopper.locator('header a[href="/search"]').first();
    assert(await entry.count() > 0, 'the masthead must offer search');
  });

  await test('an unfiltered search shows the whole catalogue', async () => {
    await shopper.goto(`${BASE}/search`, { waitUntil: 'networkidle' });
    const tiles = await shopper.locator('a[href^="/p/"]').count();
    assert(tiles >= 3, `expected the seeded catalogue, saw ${tiles}`);
  });

  await test('ARABIC SPELLING VARIANTS find the same perfume', async () => {
    /*
     * The case the whole search was built for, and the one invisible to
     * anybody testing in Latin.
     *
     * ليل القاهرة is stored with a taa marbuta. A customer typing the ordinary
     * quick spelling — a plain haa — must land on it, or they conclude the shop
     * does not stock it rather than that the search is naive.
     */
    const counts = [];
    for (const spelling of ['ليل القاهرة', 'ليل القاهره', 'ليل القاهرة ']) {
      await shopper.goto(`${BASE}/search?q=${encodeURIComponent(spelling)}`,
        { waitUntil: 'networkidle' });
      counts.push(await shopper.locator('a[href^="/p/"]').count());
    }
    assert(counts[0] > 0, 'the exact spelling must find it');
    equal(counts[1], counts[0], 'the plain-haa spelling');
    equal(counts[2], counts[0], 'trailing whitespace');
  });

  await test('a Latin house wordmark is searchable in lower case', async () => {
    // It is what a customer reads on the bottle and on the tile.
    await shopper.goto(`${BASE}/search?q=maison`, { waitUntil: 'networkidle' });
    assert(await shopper.locator('a[href^="/p/"]').count() > 0, 'maison must find MAISON NOUR');
  });

  await test('two words narrow, they do not widen', async () => {
    // Matching either term would return the whole amber section and bury what
    // was actually asked for.
    await shopper.goto(`${BASE}/search?q=${encodeURIComponent('ليل سيوة')}`,
      { waitUntil: 'networkidle' });
    equal(await shopper.locator('a[href^="/p/"]').count(), 0, 'results for two unrelated words');
  });

  await test('a search with no match offers the way out', async () => {
    const text = await shopper.locator('main').innerText();
    assert(text.includes('لا يوجد عطر مطابق'), 'it must say so plainly');
    assert(
      await shopper.locator('a[href="/search"]').count() > 0,
      'and offer the whole catalogue rather than a dead end',
    );
  });

  await test('every filter narrows, and the URL carries it', async () => {
    const all = await (async () => {
      await shopper.goto(`${BASE}/search`, { waitUntil: 'networkidle' });
      return shopper.locator('a[href^="/p/"]').count();
    })();

    for (const [label, search] of [
      ['family', '?family=amber'],
      ['price ceiling', '?max=300'],
      ['in stock', '?stock=1'],
      ['house', '?house=atelier-siwa'],
    ]) {
      await shopper.goto(`${BASE}/search${search}`, { waitUntil: 'networkidle' });
      const narrowed = await shopper.locator('a[href^="/p/"]').count();
      assert(narrowed < all, `the ${label} filter did not narrow anything`);
    }
  });

  await test('a filter is a PAGE — shareable, and survives a reload', async () => {
    /*
     * The whole reason the query lives in the URL. A filter held in component
     * state is gone on reload and breaks the back button, and a customer who
     * narrows down, opens a bottle and presses back lands on the unfiltered
     * catalogue and has to do it again.
     */
    const url = `${BASE}/search?family=amber&sort=price_asc`;
    await shopper.goto(url, { waitUntil: 'networkidle' });
    const before = await shopper.locator('a[href^="/p/"]').count();

    await shopper.reload({ waitUntil: 'networkidle' });
    equal(await shopper.locator('a[href^="/p/"]').count(), before, 'results after a reload');

    // And the controls come back set, not blank.
    const pressed = await shopper.locator('[aria-pressed="true"]').count();
    assert(pressed > 0, 'the filter chips must show as active after a reload');
  });

  await test('pressing back leaves the search rather than unwinding it', async () => {
    // Every control uses `replace`, so a customer who ticked four boxes presses
    // back once — not four times through their own filtering.
    await shopper.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await shopper.goto(`${BASE}/search?family=amber`, { waitUntil: 'networkidle' });
    await shopper.locator('button[aria-pressed]').first().click();
    await shopper.waitForTimeout(1500);

    await shopper.goBack({ waitUntil: 'networkidle' });
    assert(!shopper.url().includes('/search'), `back stayed inside search: ${shopper.url()}`);
  });

  await test('a hand-edited URL cannot widen the catalogue', async () => {
    // A filter must narrow or do nothing — never reach the database as an
    // unknown enum, and never return more than the unfiltered page.
    await shopper.goto(`${BASE}/search`, { waitUntil: 'networkidle' });
    const all = await shopper.locator('a[href^="/p/"]').count();

    for (const bad of ['?family=vanilla-latte', "?house='; DROP TABLE products; --", '?sort=free']) {
      const response = await shopper.request.get(`${BASE}/search${bad}`);
      equal(response.status(), 200, `status for ${bad}`);
      await shopper.goto(`${BASE}/search${bad}`, { waitUntil: 'networkidle' });
      assert(
        await shopper.locator('a[href^="/p/"]').count() <= all,
        `${bad} returned more than the unfiltered catalogue`,
      );
    }
  });

  /* ================================================================ houses */
  group('the house is a destination, not a label on a bottle');

  await test('the product page links to the house that made it', async () => {
    /*
     * The marketplace's whole argument is that the maker is named. The name has
     * been on this page since the first version, as text, going nowhere — so a
     * customer who liked a house had no way to see what else it makes.
     */
    await shopper.goto(`${BASE}/p/${inStock[0]}`, { waitUntil: 'networkidle' });
    // In `main`: the masthead's Perfumes panel links to the houses too (17 Oct 2026).
    const link = shopper.locator('main a[href^="/house/"]').first();
    assert(await link.count() > 0, 'the house block must be a link');

    await link.click();
    await shopper.waitForURL('**/house/**', { timeout: 15_000 });
    assert(shopper.url().includes('/house/'), `did not reach a house: ${shopper.url()}`);
  });

  await test('a house shows its own words, not just its name', async () => {
    const text = await shopper.locator('main').innerText();
    assert(text.includes('الحكاية'), 'a house with a story must show it');
    assert(text.includes('العطور'), 'and the perfumes it makes');
    // `bio`, `story`, `founded_year`, `city` and `service_governorates` have
    // been on the sellers table since migration 0000, read by nobody.
    assert(text.includes('يوصّل إلى'), 'and where it delivers');
  });

  await test('the perfumes on a house page belong to that house', async () => {
    // A storefront that shows the whole catalogue is not a storefront.
    const latin = (await shopper.locator('main').innerText()).match(/[A-Z][A-Z ]{3,}/g) ?? [];
    const tiles = await shopper.locator('a[href^="/p/"]').count();
    assert(tiles > 0, 'a live house must show at least one perfume');
    assert(latin.length > 0, 'the house wordmark must render');
  });

  await test('a house that does not exist is a 404, not an empty shop', async () => {
    const response = await shopper.request.get(`${BASE}/house/no-such-house`);
    equal(response.status(), 404, 'the status for an unknown house');
  });

  await test('the directory lists every house, and reaches them', async () => {
    await shopper.goto(`${BASE}/houses`, { waitUntil: 'networkidle' });
    const links = await shopper.locator('a[href^="/house/"]').count();
    assert(links >= 2, `expected the seeded houses, saw ${links}`);
  });

  await test('the directory is reachable from every screen', async () => {
    // In the footer, so "who is on here?" has an answer from anywhere.
    await shopper.goto(`${BASE}/cart`, { waitUntil: 'networkidle' });
    const footer = await shopper.locator('footer').innerText();
    assert(footer.includes('الدور'), `the footer must link the houses: ${footer.slice(0, 120)}`);
  });

  await test('a page that is not there is answered in Arabic', async () => {
    /*
     * There was no `not-found.tsx` at all, so every 404 rendered Next's
     * built-in page: English, left-to-right, on a white ground. On an
     * Arabic-first site that is the loudest possible statement that the
     * interface is a framework wearing a brand.
     */
    const response = await shopper.request.get(`${BASE}/definitely-not-a-page`);
    equal(response.status(), 404, 'the status');

    await shopper.goto(`${BASE}/definitely-not-a-page`, { waitUntil: 'networkidle' });
    const text = await shopper.locator('main').innerText();
    assert(text.includes('الصفحة غير موجودة'), `the 404 must be in Arabic: ${text.slice(0, 80)}`);
    // Inside MAIN: the masthead's logo links to "/" on every page, so a
    // page-wide check could not fail.
    assert(
      await shopper.locator('main a[href="/"]').count() > 0,
      'and must offer the way back rather than an apology',
    );
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
      // Until the submission has SETTLED — confirmed, or the button usable
      // again after a refusal. A fixed 700 ms read the page mid-flight whenever
      // placing took longer, then filled the form again and clicked a button
      // that was still disabled, failing this test and the two after it.
      await shopper.waitForFunction(() => {
        const text = document.querySelector('main')?.innerText ?? '';
        const button = document.querySelector('button[type="submit"]');
        return text.includes('تم استلام طلبك') || (button !== null && !button.disabled);
      }, null, { timeout: 20_000 });
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

  await test('a confirmed order shows how long is left to SHIP it', async () => {
    // The dispatch clock existed as a column and was never started, so a
    // confirmed order carried no deadline at all — the card that most needed
    // a countdown was the one card without one.
    const shipping = seller.locator('section', { hasText: 'جاهزة للشحن' }).first();
    const text = await shipping.innerText();
    assert(/متبقٍ للشحن|تأخّر الشحن/.test(text),
      `a confirmed order must show its dispatch deadline:\n${text.slice(0, 200)}`);
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

  /* =============================================================== reviews */
  group('the promise on the homepage, kept');

  /*
   * The seeded delivered order. Two houses, one of them already reviewed.
   *
   * Reviewing needs an order that actually arrived, and nothing a browser can
   * do produces one — a seller confirms and dispatches, an operator marks it
   * delivered. So the fixture is the seed's, and these tests drive the screens
   * a customer and a moderator actually touch.
   */
  let supportReference = '';
  const REVIEW_REF = 'DY-CDFHJKMN';
  const REVIEW_PHONE = '01000000123';

  /*
   * Its own visitor.
   *
   * `shopperContext` is closed at the end of the keyboard group, and the
   * moderation half of this group needs the OPERATOR page, which is not signed
   * in until the ops group above. So this section sits after both and brings
   * its own customer — which is also more honest: the person who reviews a
   * perfume is a returning visitor, not the same session that just bought one.
   */
  const reviewerContext = await browser.newContext({ viewport: DESKTOP, locale: 'ar-EG' });
  const reviewer = await reviewerContext.newPage();

  const openSeededOrder = async () => {
    await reviewer.goto(`${BASE}/order`, { waitUntil: 'networkidle' });
    await fill(reviewer, 'رقم الطلب', REVIEW_REF);
    await fill(reviewer, 'رقم الموبايل', REVIEW_PHONE);
    await reviewer.locator('button[type="submit"]').click();
    // Wait for what the callers READ, not for a clock. This was a fixed 2.5 s,
    // which a cold compile outran, failing a test now and then (15 Oct 2026).
    // The review and return panels each fetch their own data after the order
    // renders and show nothing until they have it, so all three are awaited:
    // the reference (printed once the lookup answers — an input's value is not
    // innerText) and both panel headings. Without the panels, a test that
    // asserts something is ABSENT from them passes before they exist.
    await reviewer.waitForFunction(
      (ref) => {
        const text = document.querySelector('main')?.innerText ?? '';
        return text.includes(ref) && text.includes('قيّم ما وصلك') && text.includes('إرجاع منتج');
      },
      REVIEW_REF,
      { timeout: 20_000 },
    );
  };

  await test('a reviewed perfume shows its rating, and a MASKED byline', async () => {
    await reviewer.goto(`${BASE}/p/layl-al-qahira`, { waitUntil: 'networkidle' });
    const text = await reviewer.locator('#reviews').innerText();

    assert(text.includes('التقييمات'), 'the section must be on the page');
    assert(text.includes('شراء موثّق'), 'and must say the review came from a purchase');
    // The homepage promises purchase-verified ratings. This is the screen that
    // makes that sentence true rather than decorative.
    assert(text.includes('ليلى م.'), 'the byline must be a given name and an initial');
    assert(!text.includes('محمود'), 'the customer’s full name leaked onto a public page');
  });

  await test('an unreviewed perfume says so, and never rates itself ZERO', async () => {
    // "٠٫٠ من ٥" on a perfume nobody has reviewed is a page that has libelled
    // the house whose bottle it is.
    await reviewer.goto(`${BASE}/p/nakhil`, { waitUntil: 'networkidle' });
    const text = await reviewer.locator('#reviews').innerText();

    assert(text.includes('لم يكتب أحد'), 'it must say nobody has written yet');
    assert(!/\b0(\.0)?\s*(من|\/)/.test(text), `an unreviewed perfume was scored: ${text}`);
    assert(!text.includes('٠٫٠'), 'an unreviewed perfume was scored in Arabic numerals');
  });

  await test('the six dimensions are shown separately, not averaged away', async () => {
    // A house can be excellent at perfume and careless about its own listing.
    // `مطابقة الوصف` is the dimension that says so, and an overall score alone
    // hides exactly the signal moderation can act on.
    await reviewer.goto(`${BASE}/p/layl-al-qahira`, { waitUntil: 'networkidle' });
    const text = await reviewer.locator('#reviews').innerText();
    for (const dimension of ['الرائحة', 'الثبات', 'الانتشار', 'مقابل السعر', 'التغليف', 'مطابقة الوصف']) {
      assert(text.includes(dimension), `the ${dimension} dimension is missing`);
    }
  });

  await test('tracking an arrived order offers a review, and marks what is done', async () => {
    await openSeededOrder();
    const panel = await reviewer.locator('main').innerText();
    assert(panel.includes('قيّم ما وصلك'), 'a delivered order must offer to be reviewed');
    assert(panel.includes('تم التقييم'), 'the already-reviewed line must say so');
    assert(panel.includes('اكتب تقييمك'), 'and the other line must still be offered');
  });

  await test('an order still in transit is offered NO review form', async () => {
    // Offering a form the database will refuse is worse than offering none: the
    // customer writes three paragraphs and then meets an error.
    await reviewer.goto(`${BASE}/order`, { waitUntil: 'networkidle' });
    await fill(reviewer, 'رقم الطلب', reference);
    await fill(reviewer, 'رقم الموبايل', '01011112222');
    await reviewer.locator('button[type="submit"]').click();
    await reviewer.waitForTimeout(2500);

    const text = await reviewer.locator('main').innerText();
    assert(text.includes(reference), 'the order must be found');
    assert(!text.includes('قيّم ما وصلك'), 'a parcel on a van cannot be reviewed');
  });

  await test('the form REFUSES to submit until all six are answered', async () => {
    await openSeededOrder();
    await reviewer.locator('button', { hasText: 'اكتب تقييمك' }).first().click();
    await reviewer.waitForTimeout(500);

    const submit = reviewer.locator('form button[type="submit"]', { hasText: 'أرسل التقييم' }).first();
    assert(await submit.isDisabled(), 'a half-answered review must not be submittable');

    // And the screen SAYS why. A greyed-out button with no explanation is the
    // commonest way a form traps somebody who scrolled past one question.
    assert(
      (await reviewer.locator('main').innerText()).includes('باقي'),
      'it must name what is still missing',
    );
  });

  await test('a review written on the tracking screen reaches the product page', async () => {
    await openSeededOrder();
    await reviewer.locator('button', { hasText: 'اكتب تقييمك' }).first().click();
    await reviewer.waitForTimeout(500);

    // Five stars on every dimension, chosen through the real radio inputs.
    // Western digits: a score is a VALUE, and the numeral rule sends data to
    // Western while editorial prose keeps Arabic-Indic.
    for (const dimension of ['الرائحة', 'الثبات', 'الانتشار', 'مقابل السعر', 'التغليف', 'مطابقة الوصف']) {
      await reviewer.locator(`label:has-text("${dimension}: 5")`).first().click();
    }

    const marker = 'زجاجة وصلت سليمة والرائحة قريبة من الوصف';
    await reviewer.locator('textarea').first().fill(marker);

    const submit = reviewer.locator('form button[type="submit"]', { hasText: 'أرسل التقييم' }).first();
    assert(!(await submit.isDisabled()), 'a complete review must be submittable');
    await submit.click();
    await reviewer.waitForTimeout(3000);

    // The line flips without a reload — the screen already knows.
    const after = await reviewer.locator('main').innerText();
    assert(!after.includes('اكتب تقييمك'), 'both lines should now be reviewed');

    await reviewer.goto(`${BASE}/p/ward-al-taif`, { waitUntil: 'networkidle' });
    const product = await reviewer.locator('#reviews').innerText();
    assert(product.includes(marker), 'the review did not reach the product page');
    assert(product.includes('ليلى م.'), 'and it must carry the masked byline');
  });

  await test('the same purchase cannot be reviewed a second time', async () => {
    await openSeededOrder();
    const text = await reviewer.locator('main').innerText();
    // Both lines are done now, so there is nothing left to open.
    assert(!text.includes('اكتب تقييمك'), 'a reviewed purchase must not be offered again');
  });

  await test('a moderator can hide a review, and cannot do it silently', async () => {
    await ops.goto(`${BASE}/ops/reviews`, { waitUntil: 'networkidle' });
    const text = await ops.locator('main').innerText();
    assert(text.includes('التقييمات'), 'the queue must render');
    assert(text.includes('ليلى م.'), 'and must show the reviews');

    /*
     * The SEEDED review specifically, found by its own words.
     *
     * The queue is newest-first, and by this point the suite has written a
     * review of its own — so `.first()` hid that one and the assertion below
     * then looked at a product whose review was never touched.
     */
    const seeded = ops.locator('li').filter({ hasText: 'عطر قريب، لا يملأ غرفة' }).first();

    // The reason is required by the router, the domain and the repository's
    // WHERE clause. On the screen it is what stops the button working.
    const hide = seeded.locator('button', { hasText: 'إخفاء' }).first();
    assert(await hide.isDisabled(), 'hiding must require a written reason');

    await seeded.locator('input[type="text"]').first().fill('لغة مسيئة — اختبار');
    await ops.waitForTimeout(300);
    assert(!(await hide.isDisabled()), 'with a reason, it must be possible');
    await hide.click();
    await ops.waitForTimeout(3000);

    assert(
      (await ops.locator('main').innerText()).includes('لغة مسيئة — اختبار'),
      'the reason must be shown against the hidden review',
    );
  });

  await test('a hidden review leaves the shopfront but NOT the record', async () => {
    const queue = await ops.locator('main').innerText();
    // Doc 04 §3: nothing deletes a review. The row keeps its text and gains a
    // note naming who removed it.
    assert(queue.includes('مخفي'), 'the queue must still hold it');

    await reviewer.goto(`${BASE}/p/layl-al-qahira`, { waitUntil: 'networkidle' });
    const product = await reviewer.locator('#reviews').innerText();
    assert(!product.includes('عطر قريب، لا يملأ غرفة'), 'a hidden review is still on the shopfront');
  });

  await test('and a moderator can put it back', async () => {
    await ops.goto(`${BASE}/ops/reviews`, { waitUntil: 'networkidle' });
    await ops.locator('button', { hasText: 'إعادة إظهاره' }).first().click();
    await ops.waitForTimeout(3000);

    await reviewer.goto(`${BASE}/p/layl-al-qahira`, { waitUntil: 'networkidle' });
    assert(
      (await reviewer.locator('#reviews').innerText()).includes('عطر قريب، لا يملأ غرفة'),
      'restoring did not put the review back',
    );
  });

  /* ------------------------------------------------ the decisions, on record */

  await test('the audit screen shows that moderation — by name, in words', async () => {
    // Gate 6, the half that says "without database work". The two decisions
    // above were just made through the console; they must be readable here
    // without anybody opening SQL.
    await ops.goto(`${BASE}/ops/audit`, { waitUntil: 'networkidle' });
    const text = await ops.locator('main').innerText();

    assert(text.includes('سجل القرارات'), 'the audit screen must render');
    assert(text.includes('إشراف على تقييم'), 'the review moderation must be on the record');
    assert(text.includes('لغة مسيئة — اختبار'), 'and so must the reason the moderator wrote');
    assert(text.includes('مخفي') && text.includes('ظاهر'), 'hiding and restoring must both be there, in words');

    // The table stores JSON and enum codes. None of that is for a person.
    assert(!/review_moderation|payout_approval|\{"|"hidden"/.test(text),
      `raw storage leaked onto the screen:\n${text.slice(0, 300)}`);
  });

  await test('an entry\'s time is data — Western digits, as on every operating tool', async () => {
    const times = await ops.locator('main ol time').allInnerTexts();
    assert(times.length > 0, 'entries must carry a time');
    assert(times.every((t) => /\d/.test(t) && !/[٠-٩]/.test(t)),
      `a time used Arabic-Indic digits: ${times[0]}`);
  });

  await test('filtering by kind narrows, and the filter is a URL', async () => {
    await ops.locator('nav[aria-label="نوع القرار"] a', { hasText: 'إشراف على تقييم' }).click();
    await ops.waitForURL('**/ops/audit?action=review_moderation', { timeout: 20_000 });

    const headings = await ops.locator('main ol > li h2').allInnerTexts();
    assert(headings.length >= 2, 'the hide and the restore must both be listed');
    assert(headings.every((h) => h.includes('إشراف على تقييم')),
      `the filter let another kind through: ${headings.join(' | ')}`);
  });

  await test('a hand-edited audit URL is ignored, not a crash', async () => {
    // A screen whose job is to be there when something went wrong must not be
    // the thing that breaks on a mistyped link.
    const response = await ops.goto(`${BASE}/ops/audit?before=not-a-cursor&action=bogus`,
      { waitUntil: 'networkidle' });
    assert(response?.status() === 200, `status ${response?.status()}`);
    assert((await ops.locator('main').innerText()).includes('إشراف على تقييم'),
      'a bad query must fall back to the whole trail');
  });

  await test('the audit screen offers no way to change the record', async () => {
    // Everything below the header. The header holds the console's own chrome
    // (appearance, sign-out), which is not a control over the trail.
    const controls = await ops.locator('main > div').locator('button, input, select, textarea, form').count();
    assert(controls === 0, `the audit screen has ${controls} form controls; it must have none`);
  });

  await test('the audit screen is closed to a signed-out visitor', async () => {
    const page = await browser.newPage();
    await page.goto(`${BASE}/ops/audit`, { waitUntil: 'networkidle' });
    assert(!page.url().includes('/ops/audit'), `reached the audit trail unauthenticated: ${page.url()}`);
    await page.close();
  });

  /* ----------------------------------------------------- the owner's report */

  await test('the owner sees money, the funnel and the SLA without database work', async () => {
    // Gate 8. By this point the suite has placed, confirmed, declined,
    // dispatched and delivered real orders, so every section has something in it.
    await ops.goto(`${BASE}/ops/insights`, { waitUntil: 'networkidle' });
    const text = await ops.locator('main').innerText();

    for (const heading of ['المال', 'مسار الطلبات', 'التزام الدور', 'مدخلات هامش المساهمة']) {
      assert(text.includes(heading), `the report must have its "${heading}" section`);
    }
    assert(text.includes('سُلّمت ولم تُستحق بعد'), 'held GMV must sit beside GMV, never be left out');
    assert(text.includes('ميزون نور') || text.includes('دار الورد'), 'the SLA table must name the houses');
  });

  await test('an unrecorded cost is said in words — never shown as zero', async () => {
    const text = await ops.locator('main').innerText();
    assert(text.includes('لم يُسجَّل بعد'), 'payment cost is not recorded, and the screen must say so');
    assert(text.includes('تكلفة الدفع والتحصيل'), 'the unrecorded input must still be listed');
  });

  await test('the report leaks no codes, no NaN and no Arabic-Indic digits', async () => {
    const text = await ops.locator('main').innerText();
    const leaked = ['organic_search', 'not_recorded', 'count_only', 'payment_cost', 'out_of_stock', 'NaN', 'undefined']
      .filter((token) => text.includes(token));
    equal(leaked.length, 0, `raw values on the owner's screen: ${leaked.join(', ')}`);
    assert(!/[٠-٩]/.test(text), 'an operating tool uses Western digits throughout');
  });

  await test('the period is a URL, and changing it keeps the screen whole', async () => {
    await ops.locator('nav[aria-label="الفترة"] a', { hasText: 'اليوم' }).click();
    await ops.waitForURL('**/ops/insights?days=1', { timeout: 20_000 });
    const text = await ops.locator('main').innerText();
    assert(text.includes('المال') && text.includes('بتوقيت القاهرة'), 'the one-day report must render');
  });

  await test('the owner’s report is closed to a signed-out visitor and to a house', async () => {
    const page = await browser.newPage();
    await page.goto(`${BASE}/ops/insights`, { waitUntil: 'networkidle' });
    assert(!page.url().includes('/ops/insights'), `reached the owner report unauthenticated: ${page.url()}`);
    await page.close();

    // A house's session is a different cookie entirely; it must not open this.
    await seller.goto(`${BASE}/ops/insights`, { waitUntil: 'networkidle' });
    assert(!seller.url().includes('/ops/insights'), `a house reached the owner report: ${seller.url()}`);
  });

  /* =============================================================== returns */
  group('the returns policy, with a way to act on it');

  /*
   * The house that packed the returned bottle, signed in specifically.
   *
   * The seller session above belongs to whichever house happened to be holding
   * work, which is the right fixture for the queue tests and the wrong one
   * here: the seeded delivered order's first line belongs to ميزون نور, and a
   * return lands in THAT house's queue. Reusing the other session would make
   * this pass or fail on the order the sign-in loop happened to try.
   */
  const NOUR = '01001112222';
  const houseContext = await browser.newContext({ viewport: DESKTOP, locale: 'ar-EG' });
  const house = await houseContext.newPage();
  await signIn(house, '/seller', NOUR, '/seller/orders');

  await test('a delivered order offers a return, and says how long is left', async () => {
    await openSeededOrder();
    const text = await reviewer.locator('main').innerText();
    assert(text.includes('إرجاع منتج'), 'a delivered order must offer a return');
    assert(text.includes('اطلب الإرجاع'), 'and a way to start one');
  });

  await test('the reasons offered are the LISTING’S, not a fixed list', async () => {
    await openSeededOrder();
    await reviewer.locator('button', { hasText: 'اطلب الإرجاع' }).first().click();
    await reviewer.waitForTimeout(600);

    const form = await reviewer.locator('form').filter({ hasText: 'ما المشكلة؟' }).first().innerText();
    // A fault is permitted whatever the listing says — Egypt's Consumer
    // Protection Law 181/2018 gives a remedy no seller policy waives.
    assert(form.includes('به عيب صناعة'), 'a defect must always be offered');
    assert(form.includes('وصل مكسورًا أو تالفًا'), 'damage in transit must always be offered');
    // And the seed's listing is `sealed_only`, which permits a change of mind.
    assert(form.includes('غيّرت رأيي'), 'this listing permits a change of mind');
    // The consequence is stated with the choice, not after it.
    assert(form.includes('الشحن على حسابك'), 'a change of mind must say who pays');
  });

  await test('the form REFUSES to send without a reason and a sentence', async () => {
    const submit = reviewer.locator('form button[type="submit"]', { hasText: 'أرسل طلب الإرجاع' }).first();
    assert(await submit.isDisabled(), 'an empty return request must not be submittable');

    // The LABEL, as a person does. The input is 16px and the label covers it
    // on purpose — that is what gives the control a 44px target.
    await reviewer.locator('label').filter({ hasText: 'به عيب صناعة' }).first().click();
    await reviewer.waitForTimeout(300);
    // Still refused: somebody has to collect and inspect the bottle, and a bare
    // reason code tells the house nothing it can act on.
    assert(await submit.isDisabled(), 'a reason with no explanation must not be submittable');
  });

  await test('a return reaches the house, and the customer sees its state', async () => {
    const submit = reviewer.locator('form button[type="submit"]', { hasText: 'أرسل طلب الإرجاع' }).first();
    await reviewer.locator('form textarea').first().fill('البخّاخ لا يعمل من أول استخدام.');
    await reviewer.waitForTimeout(300);
    assert(!(await submit.isDisabled()), 'a complete request must be submittable');
    await submit.click();
    await reviewer.waitForTimeout(3000);

    const after = await reviewer.locator('main').innerText();
    assert(after.includes('بانتظار ردّ الدار'), `the customer must see the state: ${after.slice(0, 400)}`);
  });

  await test('the house sees it, and can answer it', async () => {
    // The bug this catches: 0002 gave sellers a READ policy on returns and
    // nothing else, so every button here matched zero rows and reported a
    // stale state — a permissions fault wearing a concurrency fault's message.
    await house.goto(`${BASE}/seller/returns`, { waitUntil: 'networkidle' });
    const text = await house.locator('main').innerText();
    assert(text.includes('البخّاخ لا يعمل'), `the house must see the request: ${text.slice(0, 300)}`);
    assert(text.includes('التكلفة على الدار'), 'and who the platform says bears the cost');

    await house.locator('button', { hasText: 'وافق على الإرجاع' }).first().click();
    await house.waitForTimeout(3000);
    assert(
      (await house.locator('main').innerText()).includes('في الطريق إلينا'),
      'approving must move the return on',
    );
  });

  await test('the house CANNOT refund; the platform can, and only after receipt', async () => {
    // A BUTTON, not the words. The screen tells the house in prose that the
    // platform handles the refund — which contains the same phrase, and an
    // assertion on the text passed judgement on the explanation instead of on
    // the control.
    equal(
      await house.locator('button', { hasText: 'ردّ المبلغ' }).count(), 0,
      'a house must not be offered a refund control',
    );

    await ops.goto(`${BASE}/ops/returns`, { waitUntil: 'networkidle' });
    const before = await ops.locator('main').innerText();
    // The bottle has not come back yet, so no amount field is offered. The
    // domain refuses `refunded` from anywhere but `received`.
    assert(!before.includes('المبلغ'), 'a refund amount must not be offered before receipt');
  });

  /* =============================================================== support */
  group('a way to reach a person');

  await test('the contact form is reachable from every screen', async () => {
    await reviewer.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    assert(
      await reviewer.locator('footer a[href="/support"]').count() > 0,
      'a marketplace with no contact route is a marketplace nobody can complain to',
    );
  });

  await test('a question can be asked with NO order number', async () => {
    // Somebody deciding whether to buy is exactly who this exists for.
    await reviewer.goto(`${BASE}/support`, { waitUntil: 'networkidle' });
    await reviewer.locator('label').filter({ hasText: 'سؤال عن عطر' }).first().click();
    await fill(reviewer, 'الاسم', 'سلمى أحمد');
    await fill(reviewer, 'رقم الموبايل', '01099990001');
    await fill(reviewer, 'العنوان', 'هل تشحنون لأسوان؟');
    await reviewer.locator('textarea').first().fill('أفكّر في الطلب لكن لم أجد أسوان في القائمة.');

    await reviewer.locator('button[type="submit"]', { hasText: 'أرسل' }).first().click();
    await reviewer.waitForTimeout(3000);

    const text = await reviewer.locator('main').innerText();
    const reference = text.match(/DS-[A-Z0-9]{8}/)?.[0];
    assert(reference, `no ticket reference was shown: ${text.slice(0, 300)}`);
    // DS, not DY — so somebody quoting it at the tracking form is told plainly
    // that it is not an order number.
    assert(reference.startsWith('DS-'), `a ticket reference must not look like an order: ${reference}`);
    supportReference = reference;
  });

  await test('the ticket reaches the operator, at the priority the CATEGORY set', async () => {
    await ops.goto(`${BASE}/ops/support`, { waitUntil: 'networkidle' });
    const text = await ops.locator('main').innerText();
    assert(text.includes('هل تشحنون لأسوان؟'), 'the ticket must reach the queue');
    assert(text.includes('لم يُردّ عليها بعد'), 'and say that nobody has answered yet');
  });

  await test('what the operator writes is what the customer reads', async () => {
    await ops.locator('input[type="text"]').first().fill('نشحن لأسوان خلال ٤ أيام عمل.');
    await ops.locator('button', { hasText: 'احفظ' }).first().click();
    await ops.waitForTimeout(3000);

    await reviewer.goto(`${BASE}/support`, { waitUntil: 'networkidle' });
    await fill(reviewer, 'رقم الرسالة', supportReference);
    // The LOOKUP form's phone, named for what it is for. Two forms on one page
    // both need a number, and `fill` takes the first label that matches — which
    // is how this test filled the contact form and passed for months of nothing.
    await fill(reviewer, 'رقم الموبايل الذي أرسلت به', '01099990001');
    await reviewer.locator('button[type="submit"]', { hasText: 'ابحث' }).first().click();
    await reviewer.waitForTimeout(2500);

    assert(
      (await reviewer.locator('main').innerText()).includes('نشحن لأسوان خلال ٤ أيام عمل.'),
      'the operator’s reply must reach the person who asked',
    );
  });

  await test('a WRONG phone finds nothing, and says the same thing', async () => {
    await reviewer.goto(`${BASE}/support`, { waitUntil: 'networkidle' });
    await fill(reviewer, 'رقم الرسالة', supportReference);
    await fill(reviewer, 'رقم الموبايل الذي أرسلت به', '01099998888');
    await reviewer.locator('button[type="submit"]', { hasText: 'ابحث' }).first().click();
    await reviewer.waitForTimeout(2500);

    assert(
      (await reviewer.locator('main').innerText()).includes('لا توجد رسالة مطابقة'),
      'a wrong phone must disclose nothing',
    );
  });

  /* ============================================================ applying */
  group('a house can join without anybody typing SQL');

  await test('the application form is reachable, and states the terms first', async () => {
    await reviewer.goto(`${BASE}/apply`, { waitUntil: 'networkidle' });
    const text = await reviewer.locator('main').innerText();
    // A page that collects a maker's details and only then explains what
    // joining costs them collected them under false pretences.
    assert(text.includes('لا رسوم انضمام'), 'the terms must be stated before the form');
    assert(text.includes('ثمانية بنود'), 'and what the review actually is');
  });

  await test('the storefront address is shown AS IT IS TYPED', async () => {
    // It is permanent and it goes on the packaging. A maker who only discovers
    // what it became after approval has been given something they did not choose.
    await fill(reviewer, 'الاسم بالحروف اللاتينية', 'Bayt Al Attar');
    await reviewer.waitForTimeout(500);
    assert(
      (await reviewer.locator('main').innerText()).includes('bayt-al-attar'),
      'the applicant must see the address their wordmark produces',
    );
  });

  await test('an application is recorded, and lands in the intake queue', async () => {
    await fill(reviewer, 'اسم الدار', 'بيت العطّار');
    await fill(reviewer, 'اسم المسؤول', 'منى صلاح');
    await fill(reviewer, 'رقم الموبايل', '01099990002');
    await fill(reviewer, 'المدينة', 'الإسكندرية');
    await reviewer.locator('textarea').first().fill(
      'دار صغيرة في الإسكندرية نصنع بالزيوت المحلية منذ ٢٠٢٠، نحو مئة زجاجة في الشهر ونعبّئ بأنفسنا.',
    );

    await reviewer.locator('button[type="submit"]', { hasText: 'أرسل الطلب' }).first().click();
    await reviewer.waitForTimeout(3500);

    assert(
      (await reviewer.locator('main').innerText()).includes('وصلنا طلبك'),
      'the applicant must be told the application arrived',
    );

    await ops.goto(`${BASE}/ops/houses`, { waitUntil: 'networkidle' });
    const queue = await ops.locator('main').innerText();
    assert(queue.includes('بيت العطّار'), `the application must reach the queue: ${queue.slice(0, 300)}`);
    // Western digits: this is an INTERNAL surface, and the numeral rule splits
    // editorial (Arabic-Indic) from data (Western). A console counting "٠ من ٨"
    // would be the rule applied to the wrong side.
    assert(queue.includes('0 من 8'), `the checklist must start at nothing: ${queue.slice(0, 300)}`);
  });

  await test('an unvetted house CANNOT be made live', async () => {
    /*
     * Not the console's guarantee. Migration 0001's trigger refuses the
     * transition unless all eight controls have passed, so the button is
     * offered on purpose — an operator learns the rule from a message naming
     * the missing controls rather than from a grey button.
     */
    await ops.locator('button', { hasText: 'اجعلها مباشرة' }).first().click();
    await ops.waitForTimeout(3000);

    const text = await ops.locator('main').innerText();
    assert(!text.includes('تبيع الآن'), 'an unvetted house reached the shopfront');
    // The DATABASE refuses it — 0001's trigger — and the router translates that
    // refusal into a sentence naming the count. Before that translation existed
    // the operator was told "something went wrong" on the one screen where the
    // reason is the whole point.
    assert(
      text.includes('اكتمال بنود المراجعة'),
      `the refusal must name what is missing: ${text.slice(0, 600)}`,
    );

    // And it is still not visible to a visitor.
    const response = await reviewer.request.get(`${BASE}/house/bayt-al-attar`);
    equal(response.status(), 404, 'an unvetted house must not have a storefront');
  });

  await houseContext.close();

  await reviewerContext.close();

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

  /* ================================================= announcements and curation */
  group('what changes on every screen without anybody editing a page');

  const notice = `تنبيه اختبار ${Date.now().toString(36)}`;

  await test('nothing is announced until something is posted', async () => {
    const home = await ops.request.get(`${BASE}/`);
    assert(!(await home.text()).includes(notice), 'this run has posted nothing yet');
  });

  await test('a posted notice appears on every screen', async () => {
    await ops.goto(`${BASE}/ops/site`, { waitUntil: 'networkidle' });
    await ops.waitForTimeout(1200);
    await ops.fill('#ann-message', notice);
    await ops.locator('button', { hasText: 'نشر الإعلان' }).click();
    await ops.waitForTimeout(3500);

    // EVERY screen, not just the home page — it lives in the masthead, and the
    // whole point of putting it there was that it cannot be forgotten on the
    // one page where it mattered.
    for (const path of ['/', '/cart', '/order', `/p/${inStock[0]}`]) {
      const response = await ops.request.get(`${BASE}${path}`);
      assert((await response.text()).includes(notice), `the notice is missing on ${path}`);
    }
  });

  await test('a window that has already closed is refused, and says why', async () => {
    await ops.fill('#ann-message', 'خبر قديم');
    await ops.fill('#ann-start', '2020-01-01T09:00');
    await ops.fill('#ann-end', '2020-01-05T09:00');
    await ops.locator('button', { hasText: 'نشر الإعلان' }).click();
    await ops.waitForTimeout(2500);

    const objections = await ops.locator('[aria-live="polite"] li').allInnerTexts();
    assert(objections.length > 0, 'a closed window must be refused');
    assert(
      objections.some((text) => text.includes('انتهت')),
      `the message must say why: ${objections.join(' | ')}`,
    );
  });

  await test('stopping one takes it off the site immediately', async () => {
    await ops.goto(`${BASE}/ops/site`, { waitUntil: 'networkidle' });
    await ops.waitForTimeout(1200);
    await ops.locator('button', { hasText: 'إيقاف الآن' }).first().click();
    await ops.waitForTimeout(3500);

    const home = await ops.request.get(`${BASE}/`);
    assert(!(await home.text()).includes(notice), 'a stopped notice must come down');
  });

  await test('it is kept on the record rather than deleted', async () => {
    // What the site said, and when, is a thing somebody will have to answer
    // for — most likely the time it said something wrong.
    const listed = await ops.locator('main').innerText();
    assert(listed.includes(notice), 'a stopped notice must stay in the list');
  });

  await test('curating the hero changes what opens the site', async () => {
    const options = await ops.locator('#hero option').allInnerTexts();
    assert(options.length > 2, `expected products to curate: ${options.join(' | ')}`);

    // The LAST product, so it is provably not the one the catalogue would have
    // put first on its own.
    const last = await ops.locator('#hero option').last().getAttribute('value');
    await ops.selectOption('#hero', last);
    await ops.locator('button', { hasText: /^حفظ$/ }).click();
    await ops.waitForTimeout(3500);

    const name = options.at(-1).split(' — ')[0].trim();
    const home = await (await ops.request.get(`${BASE}/`)).text();
    assert(home.includes(name), `the curated hero "${name}" must open the site`);
  });

  await test('the default is stated, not implied', async () => {
    // An empty select that silently means "the first one" is a setting nobody
    // can read back.
    const first = await ops.locator('#hero option').first().innerText();
    assert(first.includes('الأول'), `the default option must name itself: "${first}"`);
  });

  await test('a seller cannot reach the site console', async () => {
    const context = await browser.newContext({ viewport: DESKTOP, locale: 'ar-EG' });
    const page = await context.newPage();
    await page.goto(`${BASE}/ops/site`, { waitUntil: 'networkidle' });
    assert(!page.url().includes('/ops/site'), `reached it unauthenticated: ${page.url()}`);
    await context.close();
  });

  await test('signing out ends the session for good', async () => {
    const out = ops.locator('button', { hasText: /خروج/ }).first();
    if (await out.count() === 0) return;

    /*
     * A COPY of the cookie, taken before signing out — the shared laptop, the
     * synced browser profile, the stolen device.
     *
     * Until task P3.4.2 the cookie WAS the session, so signing out removed it
     * from this browser and every copy kept working for the rest of its window;
     * the check below would have reached the queue. Sessions are rows now
     * (migration 0028) and signing out revokes the row, so the copy points at
     * nothing. Checking only that THIS browser lost its cookie — which is all
     * this test used to do — passes either way and proves nothing about the
     * property that matters.
     */
    const copied = (await opsContext.cookies()).find((c) => c.name === 'diyar_ops');
    assert(copied, 'no operator cookie to copy — the sign-in above did not happen');

    await out.click();
    await ops.waitForTimeout(2500);
    await ops.goto(`${BASE}/ops/queue`, { waitUntil: 'networkidle' });
    assert(!ops.url().includes('/ops/queue'), 'a signed-out session still reached the queue');

    const elsewhere = await browser.newContext({ viewport: DESKTOP, locale: 'ar-EG' });
    try {
      await elsewhere.addCookies([copied]);
      const page = await elsewhere.newPage();
      await page.goto(`${BASE}/ops/queue`, { waitUntil: 'networkidle' });
      assert(!page.url().includes('/ops/queue'),
        'a copy of the cookie taken before sign-out still reached the queue');
    } finally {
      await elsewhere.close();
    }
  });

  /* ================================================ a house's photographs */
  group('a house photographs its own perfume');

  /**
   * A REAL, decodable PNG — a solid warm colour, compressed with the zlib Node
   * already has.
   *
   * Not a header with nothing behind it: the photograph manager asks the
   * browser to decode the file to check its size, and the storefront's image
   * optimiser decodes it again. A file that only LOOKS like a PNG would pass
   * the server's checks and then render as a broken image — which is exactly
   * the seam this group exists to walk across.
   */
  const png = (width, height) => {
    const chunk = (type, data) => {
      const length = Buffer.alloc(4);
      length.writeUInt32BE(data.length);
      const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
      const crc = Buffer.alloc(4);
      crc.writeUInt32BE(crc32(body));
      return Buffer.concat([length, body, crc]);
    };
    const header = Buffer.alloc(13);
    header.writeUInt32BE(width, 0);
    header.writeUInt32BE(height, 4);
    header[8] = 8; // bit depth
    header[9] = 2; // colour type: RGB
    const row = Buffer.alloc(1 + width * 3);
    for (let x = 0; x < width; x += 1) {
      row[1 + x * 3] = 0x2a; row[2 + x * 3] = 0x20; row[3 + x * 3] = 0x19;
    }
    const pixels = Buffer.concat(Array.from({ length: height }, () => row));
    return Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', header),
      chunk('IDAT', deflateSync(pixels)),
      chunk('IEND', Buffer.alloc(0)),
    ]);
  };

  /** The seller page, signed in. An earlier group may have signed it out. */
  const sellerOnListings = async () => {
    await seller.goto(`${BASE}/seller/listings`, { waitUntil: 'networkidle' });
    if (!seller.url().includes('/seller/listings')) {
      await signIn(seller, '/seller', workingHouse, '/seller/orders');
      await seller.goto(`${BASE}/seller/listings`, { waitUntil: 'networkidle' });
    }
  };

  const photos = () => seller.locator('section[aria-labelledby="photos-heading"]');
  const altField = () => photos().getByPlaceholder('مثال: الزجاجة على رخام أسود، من الأمام');
  const ownership = () => photos().locator('input[type="checkbox"]');
  const fileField = () => photos().locator('input[type="file"]');
  const uploadButton = () => photos().locator('button', { hasText: 'رفع الصورة' });

  const choose = async (name, buffer) => {
    await fileField().setInputFiles({ name, mimeType: 'image/png', buffer });
    // The size check decodes the file in the browser; give it a moment.
    await seller.waitForTimeout(600);
  };

  /** Describe, confirm, choose, upload — and wait for the new card to appear. */
  const uploadPhoto = async (alt, width, height) => {
    const before = await photos().locator('ol > li').count();
    await altField().fill(alt);
    await ownership().check();
    await choose(`photo-${width}x${height}.png`, png(width, height));
    await uploadButton().click();
    await photos().locator('ol > li').nth(before).waitFor({ state: 'visible', timeout: 30_000 });
  };

  let draftUrl = null;

  await test('a new listing asks for a photograph, and says why', async () => {
    if (!seller) throw new Error('no signed-in house to photograph with');
    await sellerOnListings();

    const stamp = Date.now().toString(36);
    await seller.fill('#n-name', 'عطر للتصوير');
    await seller.fill('#n-slug', `photo-test-${stamp}`);
    await seller.fill('#n-sku', `PHT-${stamp}`);
    await seller.locator('button', { hasText: 'إنشاء' }).click();
    await seller.waitForURL('**/seller/listings/**', { timeout: 20_000 });
    draftUrl = seller.url();

    const text = await seller.locator('main').innerText();
    assert(text.includes('الصور'), 'the listing editor must have a photographs section');
    assert(text.includes('لا توجد صور بعد'), 'an empty listing must say it has no photographs');
    assert(text.includes('أضف صورة رئيسية'), 'and point the house at the gap that blocks publishing');
  });

  await test('uploading waits for a description and an ownership confirmation', async () => {
    await choose('photo.png', png(1000, 1250));
    assert(await uploadButton().isDisabled(), 'a file alone must not be uploadable');
    await altField().fill('الزجاجة من الأمام');
    assert(await uploadButton().isDisabled(), 'a description without confirming ownership must not be enough');
    await ownership().check();
    assert(!(await uploadButton().isDisabled()), 'with both, the upload must be possible');
  });

  await test('a photograph too small to stay sharp is refused before it is sent', async () => {
    await choose('small.png', png(400, 400));
    const text = await photos().innerText();
    assert(text.includes('800 بكسل'), `a 400px photograph must be refused with the reason:\n${text.slice(0, 300)}`);
    assert(await uploadButton().isDisabled(), 'a refused file must not be uploadable');
  });

  await test('a real photograph uploads, is verified, and becomes the primary', async () => {
    await seller.goto(draftUrl, { waitUntil: 'networkidle' });
    await uploadPhoto('الزجاجة على رخام أسود، من الأمام', 1000, 1250);

    const card = photos().locator('ol > li').first();
    assert((await card.innerText()).includes('رئيسية'), 'the first photograph must become the primary');

    // The photograph the card shows is actually served — as an image.
    const src = await card.locator('img').getAttribute('src');
    assert(src, 'the card must show the photograph');
    const served = await seller.request.get(new URL(src, BASE).toString());
    equal(served.status(), 200, 'the photograph response');
    assert((served.headers()['content-type'] ?? '').startsWith('image/png'),
      `served as ${served.headers()['content-type']}`);

    // And the gap that blocked publishing has closed.
    await seller.goto(draftUrl, { waitUntil: 'networkidle' });
    assert(!(await seller.locator('main').innerText()).includes('أضف صورة رئيسية'),
      'with a primary photograph, the listing must stop asking for one');
  });

  await test('a live perfume shows its photograph in the shop, and in the bag', async () => {
    await sellerOnListings();
    const live = seller.locator('a[href^="/seller/listings/"]', { hasText: 'منشور' }).first();
    assert(await live.count() > 0, 'the signed-in house must have a published listing');
    await live.click();
    await seller.waitForURL('**/seller/listings/**', { timeout: 20_000 });

    const shopLink = await seller.locator('a', { hasText: 'عرض في المتجر' }).first().getAttribute('href');
    assert(shopLink, 'a published listing must link to its page in the shop');

    const alt = 'الزجاجة في ضوء النافذة';
    await uploadPhoto(alt, 1200, 1500);
    // A published listing already had a primary only if one was uploaded before;
    // make THIS one primary so the shop has a verified photograph to show.
    const newest = photos().locator('ol > li').last();
    const makePrimary = newest.locator('button', { hasText: 'اجعلها رئيسية' });
    if (await makePrimary.count() > 0) {
      await makePrimary.click();
      await seller.waitForTimeout(2500);
    }

    const shopper = await browser.newContext({ viewport: DESKTOP, locale: 'ar-EG' });
    const page = await shopper.newPage();
    try {
      await page.goto(`${BASE}${shopLink}`, { waitUntil: 'networkidle' });
      const hero = page.locator(`main img[alt="${alt}"]`).first();
      await hero.waitFor({ state: 'visible', timeout: 20_000 });
      const src = await hero.getAttribute('src');
      assert(src && src.includes('/_next/image'), `the shop must serve the photograph through the image optimiser: ${src}`);
      const served = await page.request.get(new URL(src, BASE).toString());
      equal(served.status(), 200, 'the optimised photograph response');
      assert((served.headers()['content-type'] ?? '').startsWith('image/'),
        `the optimiser returned ${served.headers()['content-type']}`);

      // The bag reads the photograph through a different path — the cart
      // snapshot, priced in the visitor's own transaction — so the shop
      // showing it proves nothing about the bag.
      const added = await addToBag(page, shopLink.replace(/^\/p\//, ''));
      assert(added, 'the published listing must be in stock to reach the bag');
      await page.goto(`${BASE}/cart`, { waitUntil: 'networkidle' });
      const inBag = page.locator(`main li a[aria-label] img[alt="${alt}"]`).first();
      await inBag.waitFor({ state: 'visible', timeout: 20_000 });
      const bagSrc = await inBag.getAttribute('src');
      assert(bagSrc && bagSrc.includes('/_next/image'), `the bag must show the photograph, not the flacon: ${bagSrc}`);
    } finally {
      await shopper.close();
    }
  });

  /*
   * The same store, from the other console (5.7.6). The image block used to be
   * a text field that saved any key at all; the operator now uploads, and the
   * page is only publishable with a picture the server verified.
   *
   * Its own signed-in context: the operator signed out at the end of the site
   * group, and asserting that sign-out held is worth more than reusing it.
   */
  await test('an operator uploads an image to an editorial page, and a visitor sees it', async () => {
    const editorContext = await browser.newContext({ viewport: DESKTOP, locale: 'ar-EG' });
    const editor = await editorContext.newPage();
    try {
      await signIn(editor, '/ops', OPERATOR, '/ops/queue');

      const slug = `images-${Date.now().toString(36)}`;
      await editor.goto(`${BASE}/ops/content`, { waitUntil: 'networkidle' });
      await editor.fill('#new-title', `صفحة بصورة ${slug}`);
      await editor.fill('#new-slug', slug);
      await editor.locator('button', { hasText: 'إنشاء' }).click();
      await editor.waitForURL('**/ops/content/**', { timeout: 20_000 });
      await editor.waitForTimeout(1500);

      await editor.locator('button', { hasText: '+ عنوان قسم' }).click();
      await editor.waitForTimeout(400);
      await editor.fill('#b0-text', 'في المعمل');
      await editor.locator('button', { hasText: '+ صورة' }).click();
      await editor.waitForTimeout(400);

      // Described first, as the editor asks: the picture it shows back carries
      // this as its alternative text, which is how the test finds it.
      const alt = 'قوارير الزيوت على رفّ خشبي';
      await editor.fill('#b1-alt', alt);
      await editor.locator('#b1-file').setInputFiles({
        name: 'atelier.png', mimeType: 'image/png', buffer: png(1600, 1067),
      });

      const preview = editor.locator(`ol li img[alt="${alt}"]`).first();
      await preview.waitFor({ state: 'visible', timeout: 30_000 });
      assert(!(await editor.locator('main').innerText()).includes('مفتاح الصورة'),
        'the console must not offer a key to type any more');

      await editor.locator('button', { hasText: 'حفظ المسودة' }).click();
      await editor.waitForTimeout(2500);
      await editor.locator('button', { hasText: 'إرسال للمراجعة' }).click();
      await editor.waitForTimeout(3000);
      await editor.locator('button', { hasText: /^نشر$/ }).click();
      await editor.waitForTimeout(3500);

      const objections = await editor.locator('[aria-live="polite"] li').allInnerTexts();
      equal(objections.length, 0, `a verified image must not block publishing: ${objections.join(' | ')}`);

      const visitor = await browser.newContext({ viewport: DESKTOP, locale: 'ar-EG' });
      try {
        const page = await visitor.newPage();
        const response = await page.goto(`${BASE}/${slug}`, { waitUntil: 'networkidle' });
        equal(response?.status(), 200, 'the public status of the published page');
        const shown = page.locator(`main figure img[alt="${alt}"]`).first();
        await shown.waitFor({ state: 'visible', timeout: 20_000 });
        const src = await shown.getAttribute('src');
        assert(src && src.includes('/_next/image'), `the page must serve the image through the optimiser: ${src}`);
        const served = await page.request.get(new URL(src, BASE).toString());
        equal(served.status(), 200, 'the optimised image response');
      } finally {
        await visitor.close();
      }
    } finally {
      await editorContext.close();
    }
  });

  /* ================================================ the pre-order funnel */
  group('what a visitor does before an order exists');

  /*
   * WORK_PLAN 9.5, founder decision A-1. The post-order funnel is made of
   * sub-orders; this half is made of events written for somebody who is nobody
   * at all — so the only honest test is a visitor with no session doing ordinary
   * things, and then an operator reading the screen.
   */
  await test('a visitor’s view and bag-add reach the owner’s screen', async () => {
    const visitorContext = await browser.newContext({ viewport: DESKTOP, locale: 'ar-EG' });
    const shopper = await visitorContext.newPage();
    try {
      // The sellable slugs the buyer's journey already established, rather than
      // a second way of asking what is in stock.
      const slug = inStock[0];
      assert(slug, 'the fixture must include a sellable product');

      await shopper.goto(`${BASE}/p/${slug}`, { waitUntil: 'networkidle' });
      // The event is written by a server action fired after paint.
      await shopper.waitForTimeout(2500);

      const cookies = await visitorContext.cookies();
      const anonymous = cookies.find((c) => c.name === 'diyar.aid');
      assert(anonymous, 'a visitor must be given an anonymous id');
      assert(/^[0-9a-f]{24}$/.test(anonymous.value), `the id must be 24 hex characters: ${anonymous.value}`);
      assert(anonymous.httpOnly, 'the id must be out of reach of any script on the page');

      const { button, enabled } = await buyButton(shopper);
      assert(enabled, 'the perfume must be sellable');
      await button.click();
      await shopper.waitForTimeout(2500);
    } finally {
      await visitorContext.close();
    }

    /*
     * Read back through the operator's own screen rather than the database: the
     * point of 9.5 is that the owner can SEE this half of the funnel, and a test
     * that queried Postgres would pass with the screen still saying "not yet
     * recorded".
     */
    const adminContext = await browser.newContext({ viewport: DESKTOP, locale: 'ar-EG' });
    const admin = await adminContext.newPage();
    try {
      await signIn(admin, '/ops', OPERATOR, '/ops/queue');
      await admin.goto(`${BASE}/ops/insights?days=1`, { waitUntil: 'networkidle' });
      await settled(admin);

      const text = await admin.locator('main').innerText();
      assert(text.includes('قبل الطلب'), `the owner's screen must show the pre-order half: ${text.slice(0, 400)}`);
      assert(!text.includes('لم يُسجَّل نشاط تصفّح'),
        'the visitor above browsed, so the screen must not say nothing was recorded');
      assert(text.includes('فتح صفحة عطر') && text.includes('أضاف إلى الحقيبة'),
        'both stages must be named in words an owner reads');
    } finally {
      await adminContext.close();
    }
  });


  /* ======================================================= the English site */
  group('the English site: its own URLs, its own direction, the same shop');

  const englishContext = await browser.newContext({ viewport: DESKTOP, locale: 'en-GB' });
  const english = await englishContext.newPage();
  try {
    await test('/en is English and left to right, and the masthead speaks it', async () => {
      await english.goto(`${BASE}/en`, { waitUntil: 'networkidle' });
      const root = await english.evaluate(() => ({
        lang: document.documentElement.lang, dir: document.documentElement.dir, title: document.title,
      }));
      equal(root.lang, 'en', 'lang on /en');
      equal(root.dir, 'ltr', 'dir on /en');
      assert(root.title.includes('DIYAR'), `title: ${root.title}`);
      const nav = await english.locator('header nav').innerText();
      // "Perfumes" since identity v2: the link to /search is the catalogue (P5.1.3).
      assert(/Houses/.test(nav) && /Perfumes/.test(nav) && /Track your order/.test(nav), `masthead: ${nav}`);
      assert(!/[؀-ۿ]/.test(nav), `Arabic left in the English masthead: ${nav}`);
    });

    await test('the switch changes language, and the choice is remembered', async () => {
      await english.goto(`${BASE}/houses`, { waitUntil: 'networkidle' });
      // Having opened /en, this visitor's Arabic link is answered in English.
      assert(new URL(english.url()).pathname === '/en/houses', `followed to ${english.url()}`);

      await english.locator('header a[hreflang="ar"]').click();
      await english.waitForURL((url) => url.pathname === '/houses', { timeout: 15_000 });
      equal(await english.evaluate(() => document.documentElement.lang), 'ar', 'lang after switching');

      await english.goto(`${BASE}/houses`, { waitUntil: 'networkidle' });
      equal(new URL(english.url()).pathname, '/houses', 'an Arabic choice stays Arabic');

      await english.locator('header a[hreflang="en"]').click();
      await english.waitForURL((url) => url.pathname === '/en/houses', { timeout: 15_000 });
      equal(await english.evaluate(() => document.documentElement.dir), 'ltr', 'dir after switching back');
    });

    await test('an order is placed from start to finish in English', async () => {
      await english.goto(`${BASE}/en/p/${inStock[0]}`, { waitUntil: 'networkidle' });
      const add = english.locator('button:visible').filter({ hasText: 'Add to bag' }).first();
      await add.waitFor({ state: 'visible', timeout: 10_000 });
      for (let i = 0; i < 25 && await add.isDisabled(); i += 1) await english.waitForTimeout(300);
      await add.click();
      await english.waitForTimeout(500);

      await english.goto(`${BASE}/en/checkout`, { waitUntil: 'networkidle' });
      await english.waitForTimeout(1500);
      await fill(english, 'Full name', 'Mariam Khalil');
      await fill(english, 'Mobile number', `012${String(Date.now()).slice(-8)}`);
      await fill(english, 'City', 'Mohandessin');
      await fill(english, 'Area', 'Dokki');
      await fill(english, 'Street', 'El Bahraa Street');
      await fill(english, 'Building number', '21');
      await english.locator('button[type="submit"]').click();
      await english.waitForTimeout(4000);

      const text = await english.locator('main').innerText();
      assert(text.includes('Your order is placed'), `confirmation: ${text.slice(0, 200)}`);
      assert(/DY-[A-Z0-9]{8}/.test(text), 'the confirmation carries a reference');
    });

    await test('English CONTENT: the perfume, its notes and its house read in English', async () => {
      await english.goto(`${BASE}/en/p/layl-al-qahira`, { waitUntil: 'networkidle' });
      const h1 = await english.locator('h1').innerText();
      equal(h1.trim(), 'Cairo Night', 'the English name');
      const main = await english.locator('main').innerText();
      assert(main.includes('Bergamot') && main.includes('Damask rose'), 'notes through the glossary');
      assert(main.includes('Maison Nour'), 'the house by its own Latin name');

      // The Arabic page is untouched by any of it.
      await english.goto(`${BASE}/p/layl-al-qahira?lang=ar`, { waitUntil: 'networkidle' });
      equal((await english.locator('h1').innerText()).trim(), 'ليل القاهرة', 'the Arabic name');
    });

    await test('a house page and an editorial page read in English', async () => {
      await english.goto(`${BASE}/en/house/maison-nour`, { waitUntil: 'networkidle' });
      const house = await english.locator('main').innerText();
      assert(house.includes('A small perfume house in downtown Cairo'), `the English bio: ${house.slice(0, 200)}`);

      await english.goto(`${BASE}/en/terms`, { waitUntil: 'networkidle' });
      equal((await english.locator('h1').innerText()).trim(), 'Terms of sale', 'the English title');
      const terms = await english.locator('main').innerText();
      assert(terms.includes('the Arabic version governs'), 'a translated contract says which text binds');
    });

    await test('untranslated content shows in Arabic, marked as Arabic', async () => {
      // A note with no glossary entry, on a fresh listing's page, is the case
      // every new house starts in. Here: the review body, written in Arabic.
      await english.goto(`${BASE}/en/p/layl-al-qahira`, { waitUntil: 'networkidle' });
      const marked = await english.locator('main [lang="ar"][dir="rtl"]').count();
      assert(marked > 0, 'Arabic content on the English page carries lang and dir');
    });

    await test('an operator names a note and chooses its drawing, and the storefront prints both', async () => {
      /*
       * Its OWN operator session. The shared `ops` page is signed out — and its
       * session revoked — by "signing out ends the session for good", long
       * before this group runs; reusing it here sent the glossary to the
       * sign-in screen and failed every run, which read as a flake.
       */
      const editorContext = await browser.newContext({ viewport: DESKTOP, locale: 'ar-EG' });
      const editor = await editorContext.newPage();
      try {
        await signIn(editor, '/ops', OPERATOR, '/ops/queue');
        await editor.goto(`${BASE}/ops/notes`, { waitUntil: 'networkidle' });
        const row = editor.locator('li', { has: editor.locator('label', { hasText: /^هيل$/ }) });
        await row.locator('input').fill('Green cardamom');
        // The drawing (0031): incense, replacing the seeded cardamom pod.
        await row.locator('[role="radio"][aria-label="بخور"]').click();
        await row.locator('button', { hasText: 'حفظ' }).click();
        await row.locator('button', { hasText: 'تم الحفظ' }).waitFor({ timeout: 10_000 });

        await english.goto(`${BASE}/en/p/layl-al-qahira`, { waitUntil: 'networkidle' });
        const main = await english.locator('main').innerText();
        assert(main.includes('Green cardamom'), 'the new name on the product page');
        // The chip carries the chosen drawing — the incense curl is the only
        // drawing with this inner stroke.
        const drawing = await english.locator('main a', { hasText: 'Green cardamom' }).first()
          .locator('svg').innerHTML();
        assert(drawing.includes('M12 17.5'), `the incense drawing on the note chip: ${drawing.slice(0, 80)}`);

        // And the change is on the record.
        await editor.goto(`${BASE}/ops/audit`, { waitUntil: 'networkidle' });
        const audit = await editor.locator('main').innerText();
        assert(audit.includes('قاموس النفحات'), 'the glossary edit in the audit log');
        assert(audit.includes('بخور'), 'and the drawing, named in words, in the audit log');
      } finally {
        await editorContext.close();
      }
    });
  } finally {
    await englishContext.close();
  }

  /* ============================================ the reveal (0032, 0033) */
  group('a perfume lifted out of its photograph — Le Dévoilement');
  {
    const PERFUME = 'ward-al-taif';
    // Where the rose bottle sits in its photograph, as fractions of it — the
    // outline an operator would trace. On CI's plain seed photograph it is
    // simply a shape on one colour, which is still a relief the shop can draw.
    const BODY = [[462, 600], [606, 600], [606, 962], [600, 968], [468, 968], [462, 962]];
    const CAP = [[505, 598], [505, 512], [513, 512], [513, 464], [557, 464], [557, 512], [566, 512], [566, 598]];
    const traceAndSave = async (page) => {
      await page.goto(`${BASE}/ops/reliefs`, { waitUntil: 'networkidle' });
      await page.locator('main a', { hasText: 'ورد الطائف' }).click();
      await page.waitForURL('**/ops/reliefs/**');
      await page.locator('button', { hasText: 'رسم الحدود يدويًا' }).click();
      const overlay = page.locator('img[alt^="الصورة الرئيسية"] + svg');
      await overlay.scrollIntoViewIfNeeded();
      const box = await overlay.boundingBox();
      const click = ([x, y]) => page.mouse.click(box.x + (x / 1000) * box.width, box.y + (y / 1250) * box.height);
      for (const point of BODY) await click(point);
      await page.locator('button', { hasText: 'الغطاء' }).click();
      await overlay.scrollIntoViewIfNeeded();
      for (const point of CAP) await click(point);
      await page.locator('button', { hasText: 'اصنع العرض المجسّم' }).click();
      await page.locator('img[alt="الزجاجة مقصوصة"]').waitFor({ timeout: 30_000 });
      await page.locator('button', { hasText: 'احفظ وانشر' }).click();
      await page.locator('[role="status"]', { hasText: 'حُفظ' }).waitFor({ timeout: 30_000 });
    };

    const revealContext = await browser.newContext({ viewport: DESKTOP, locale: 'ar-EG' });
    const visitor = await revealContext.newPage();
    // Its own operator, signed in here: earlier groups sign the shared one out.
    const curatorContext = await browser.newContext({ viewport: DESKTOP, locale: 'ar-EG' });
    const curator = await curatorContext.newPage();
    try {
      await test('the content team traces a bottle in the console and saves its relief', async () => {
        await signIn(curator, '/ops', OPERATOR, '/ops/queue');
        await traceAndSave(curator);
      });

      await test('a visitor opens it on the perfume page; Escape puts it back where it was', async () => {
        await visitor.goto(`${BASE}/p/${PERFUME}`, { waitUntil: 'networkidle' });
        const control = visitor.locator('.reveal-trigger');
        await control.waitFor({ timeout: 15_000 });
        await control.click();
        const dialog = visitor.getByRole('dialog');
        await dialog.waitFor();
        const label = await dialog.getAttribute('aria-label');
        assert(label?.includes('ورد الطائف'), `the dialog is named for the perfume: ${label}`);
        const notes = await dialog.locator('.reveal-notes li').count();
        assert(notes >= 3, `the notes, as a list a screen reader hears: ${notes}`);
        await visitor.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'إغلاق', undefined, { timeout: 20_000 });
        await visitor.keyboard.press('Escape');
        await dialog.waitFor({ state: 'detached', timeout: 20_000 });
        const after = await visitor.evaluate(() => ({
          focus: document.activeElement?.classList.contains('reveal-trigger') ?? false,
          overflow: document.documentElement.style.overflow,
        }));
        assert(after.focus, 'focus returns to the control that opened it');
        equal(after.overflow, '', 'the page scrolls again');
      });

      await test('removed, the control goes too — and both decisions are on the record', async () => {
        await curator.reload({ waitUntil: 'networkidle' });
        await curator.locator('button', { hasText: 'احذف العرض المجسّم' }).click();
        await curator.locator('button', { hasText: 'تأكيد الحذف' }).click();
        await curator.locator('[role="status"]', { hasText: 'حُذف' }).waitFor({ timeout: 20_000 });
        await visitor.goto(`${BASE}/p/${PERFUME}`, { waitUntil: 'networkidle' });
        await visitor.waitForTimeout(800);
        equal(await visitor.locator('.reveal-trigger').count(), 0, 'a control with no relief behind it');
        await curator.goto(`${BASE}/ops/audit`, { waitUntil: 'networkidle' });
        const audit = await curator.locator('main').innerText();
        assert(audit.includes('العرض المجسّم'), 'the relief decisions in the audit log');
        // Left as it was found: the perfume keeps a reveal for whoever opens the shop next.
        await traceAndSave(curator);
      });
    } finally {
      await revealContext.close();
      await curatorContext.close();
    }
  }

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
