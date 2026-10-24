import {
  foldArabic, objectionsToImage, publicAuthorName, REFERENCE_ALPHABET, REFERENCE_PREFIX,
  RELIEF_LIMITS, sniffImage, type ImageType,
} from '@diyar/domain';
import { applyMigrations } from '@diyar/db/migrate';
/**
 * Seed a local database with real content.
 *
 * The README's session-six instruction is "load real content early — it exposes
 * every flaw in the schema while fixing them is still cheap." This is the
 * developer version of that: three complete products from three houses, each
 * passing the publish gate rather than side-stepping it.
 *
 * Every product here goes through the SAME triggers production uses. If a field
 * is missing, the seed fails loudly instead of quietly inserting a listing that
 * could never exist in the real system.
 */
import { PGlite } from '@electric-sql/pglite';
import { seedEnglish } from './seed-english';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { crc32, deflateSync } from 'node:zlib';

const DATA_DIR = process.env.PGLITE_DIR ?? './.data/pg';
/** Where the local photograph store keeps files — `core/media.ts` decides this. */
const MEDIA_DIR = process.env.MEDIA_DIR ?? './.data/media';

/**
 * A real, decodable PNG — a solid warm ground at the size a product photograph
 * would be.
 *
 * Not a header with nothing behind it: Next's image optimiser decodes what it
 * serves, and the publish gate (0024) now requires the facts the server reads
 * from a file. A seed that wrote a path with no file produced exactly what QA
 * found — a published perfume whose editor says the image cannot be displayed.
 */
const solidPng = (width: number, height: number): Buffer => {
  const chunk = (type: string, data: Buffer): Buffer => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;   // bit depth
  header[9] = 2;   // truecolour
  // One filter byte per row, then RGB triples — the brand's warm ground.
  const row = Buffer.concat([
    Buffer.from([0]),
    Buffer.concat(Array.from({ length: width }, () => Buffer.from([0x2c, 0x22, 0x1a]))),
  ]);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
};
/**
 * Mock-up photographs, so a developer sees the catalogue as it will look.
 *
 * `scripts/mock-photos/<product-slug>.(jpg|png|webp)` — free-licence stock
 * photographs of UNBRANDED bottles, kept out of git (see the README there).
 * A product with no file there gets the solid ground above, so a fresh clone
 * and CI seed exactly as before.
 *
 * Each file passes the SAME checks an upload does — type and dimensions read
 * from its bytes, then the upload limits — so a mock-up can never put into the
 * catalogue what a house could not.
 */
const MOCK_PHOTOS = join(process.cwd(), 'scripts/mock-photos');
const EXTENSION = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' } as const;

const photoFor = (slug: string): { bytes: Buffer; type: ImageType; width: number; height: number } => {
  const file = ['jpg', 'jpeg', 'png', 'webp']
    .map((ext) => join(MOCK_PHOTOS, `${slug}.${ext}`))
    .find((path) => existsSync(path));
  if (!file) return { bytes: solidPng(1000, 1250), type: 'image/png', width: 1000, height: 1250 };

  const bytes = readFileSync(file);
  const facts = sniffImage(new Uint8Array(bytes));
  const objections = objectionsToImage({ facts, declaredType: facts?.type ?? '', byteSize: bytes.length });
  if (!facts || objections.length > 0) {
    throw new Error(`Mock photo ${file} would be refused as an upload: ${objections.join(', ')}`);
  }
  return { bytes, ...facts };
};

const MIGRATIONS = join(process.cwd(), '../../packages/db/migrations');
const PLATFORM = '99999999-9999-9999-9999-999999999999';

/**
 * Postgres array literal.
 *
 * The driver passes a JS array as a comma-joined string, which Postgres then
 * rejects as a malformed array literal. Each element is quoted and escaped so
 * an Arabic note containing a comma cannot silently split into two notes.
 */
const pgArray = (items: readonly string[]): string => {
  const escaped = items.map((item) => {
    const slashes = item.split('\\').join('\\\\');
    const quotes = slashes.split('"').join('\\"');
    return `"${quotes}"`;
  });
  return `{${escaped.join(',')}}`;
};

const houses = [
  {
    slug: 'maison-nour',
    bio: 'دار عطور صغيرة في وسط القاهرة، تصنع بكميات محدودة وتوقّع كل زجاجة باسمها.',
    story: 'بدأت الدار في شقة فوق سوق العطارين، بثلاث زجاجات ومفكّرة.\n\nما زالت كل تركيبة تُخلط يدويًا وتُترك أسابيع قبل أن تُعبّأ. هذا سبب قِلّة ما نعرضه، وسبب أننا نعرف من صنع كل زجاجة.',
    foundedYear: 2019,
    /* Every house ships its own parcels, so coverage genuinely differs.
       Stated on the house page, before a customer reaches an address
       field that would refuse them. */
    serves: ['cairo', 'giza', 'qalyubia'],
    phone: '01001112222',
    name: 'ميزون نور',
    nameEn: 'Maison Nour',
    owner: 'نور عبد الله',
    city: 'القاهرة',
    products: [
      {
        slug: 'layl-al-qahira',
        name: 'ليل القاهرة',
        sku: 'NUR-LQ-50',
        price: 45_000,
        volume: 50,
        family: 'amber',
        concentration: 'eau_de_parfum',
        gender: 'unisex',
        top: ['برغموت', 'زعفران', 'هيل'],
        heart: ['ورد دمشقي', 'ياسمين'],
        base: ['عود', 'عنبر', 'مسك'],
        seasons: ['autumn', 'winter'],
        occasions: ['evening', 'occasion'],
        dayNight: 'night',
        projection: 'strong',
        longevity: 'very_long',
        source: 'review_aggregate',
        stock: 12,
      },
    ],
  },
  {
    slug: 'dar-al-ward',
    bio: 'من الإسكندرية. عطور تميل إلى الخفّة، تُصنع على مقربة من الميناء.',
    story: 'الرطوبة والملح يغيّران طريقة عمل العطر، وقد تعلّمنا ذلك على الساحل قبل أن نقرأه في كتاب.\n\nنعمل بموادّ تتحمّل الحرارة، ونختبر كل تركيبة في صيف المدينة قبل عرضها.',
    foundedYear: 2021,
    /* Every house ships its own parcels, so coverage genuinely differs.
       Stated on the house page, before a customer reaches an address
       field that would refuse them. */
    serves: ['alexandria', 'beheira', 'matrouh', 'cairo'],
    phone: '01113334444',
    name: 'دار الورد',
    nameEn: 'Dar Al Ward',
    owner: 'خالد منصور',
    city: 'الإسكندرية',
    products: [
      {
        slug: 'ward-al-taif',
        name: 'ورد الطائف',
        sku: 'WRD-WT-30',
        price: 38_000,
        volume: 30,
        family: 'floral',
        concentration: 'eau_de_parfum',
        gender: 'women',
        top: ['برغموت', 'ليمون'],
        heart: ['ورد طائفي', 'ياسمين', 'إيلنغ'],
        base: ['مسك', 'خشب الصندل'],
        seasons: ['spring', 'summer'],
        occasions: ['daily', 'work'],
        dayNight: 'day',
        projection: 'moderate',
        longevity: 'long',
        source: 'seller_provided',
        stock: 7,
      },
    ],
  },
  {
    slug: 'atelier-siwa',
    bio: 'أتيليه بين سيوة والجيزة، متخصّص في الزيوت الصحراوية والبخور.',
    story: 'المواد تأتي من الواحة: التمر، الزيتون، ونخيل سيوة الذي أخذ اسمه أحد عطورنا.\n\nنشتري مباشرة من مزارعين نعرفهم بالاسم، ونذكر مصدر كل مادة في صفحة العطر.',
    foundedYear: 2020,
    /* Every house ships its own parcels, so coverage genuinely differs.
       Stated on the house page, before a customer reaches an address
       field that would refuse them. */
    serves: ['giza', 'cairo', 'matrouh'],
    phone: '01225556666',
    name: 'أتيليه سيوة',
    nameEn: 'Atelier Siwa',
    owner: 'سلمى فؤاد',
    city: 'الجيزة',
    products: [
      {
        slug: 'nakhil',
        name: 'نخيل',
        sku: 'SIW-NK-50',
        price: 29_000,
        volume: 50,
        family: 'fresh',
        concentration: 'eau_de_toilette',
        gender: 'unisex',
        top: ['نعناع', 'ليمون أخضر'],
        heart: ['نخيل', 'شاي أخضر'],
        base: ['مسك أبيض', 'خشب الأرز'],
        seasons: ['spring', 'summer'],
        occasions: ['daily'],
        dayNight: 'day',
        projection: 'intimate',
        longevity: 'moderate',
        source: 'seller_provided',
        stock: 0,
      },
    ],
  },
];

async function main() {
  if (process.argv.includes('--fresh')) {
    rmSync(DATA_DIR, { recursive: true, force: true });
    console.log('· wiped', DATA_DIR);
    // The photographs too, now that the seed writes real files. Leaving them
    // would accumulate an orphan per product per fresh seed — the sweep in
    // DEBT_REGISTER #4, made worse by the one command that runs most often.
    rmSync(MEDIA_DIR, { recursive: true, force: true });
    console.log('· wiped', MEDIA_DIR);
  }
  // PGlite opens the directory but does not create the parent chain.
  mkdirSync(DATA_DIR, { recursive: true });

  const pg = new PGlite(DATA_DIR);

  // Explicit adoption applies only to this local PGlite store. Network migrations
  // remain strict. Existing rows and their original applied_at are preserved.
  await applyMigrations(pg, {
    adoptLegacyChecksums: process.argv.includes('--adopt-legacy-checksums'),
    onApplied: (file) => console.log('· applied', file),
  });

  await pg.exec(`SET app.actor_role='platform'; SET app.actor_id='${PLATFORM}';`);

  /*
   * Migrations have already run by this point, and that ORDER is why `pnpm dev`
   * runs this script before starting the server.
   *
   * The dev server opens PGlite and never migrates it, so a developer who
   * pulled a new migration and ran `next dev` got a database one migration
   * behind and a 500 naming a column that does not exist — with nothing
   * anywhere saying a migration was pending. Seeding is idempotent, so making
   * it part of `dev` costs a second and removes the whole class of confusion.
   */
  const existing = await pg.query<{ n: number }>(`SELECT count(*)::int n FROM products`);
  if (existing.rows[0]!.n > 0) {
    console.log(`\n· ${existing.rows[0]!.n} products already present — nothing to do`);
    // Except the English half, which a database seeded before it existed lacks.
    const staff = (await pg.query<{ id: string }>(
      `SELECT id FROM platform_staff WHERE auth_user_id = $1`, [PLATFORM])).rows[0];
    if (staff) await seedEnglish(pg, staff.id);
    await pg.close();
    return;
  }

  const seededProducts: Array<{ slug: string; productId: string }> = [];
  for (const house of houses) {
    const s = await pg.query<{ id: string }>(
      `INSERT INTO sellers (trading_name, owner_name, slug, city, status,
         bio, story, founded_year, service_governorates)
       VALUES ($1,$2,$3,$4,'applied',$5,$6,$7,$8::governorate[]) RETURNING id`,
      [
        house.name, house.owner, house.slug, house.city,
        // The house's own words. These columns have existed since migration
        // 0000 and nothing has ever written to them, so the storefront had
        // nothing to show but a name.
        // A Postgres array LITERAL, not a JS array: the driver flattens an
        // array parameter to a bare comma list, which the server then refuses
        // as a malformed array. Braces are the wire format.
        house.bio, house.story, house.foundedYear, `{${house.serves.join(',')}}`,
      ],
    );
    const sellerId = s.rows[0]!.id;

    // The phone moved off the public row in 0026, so it is written here rather
    // than with the house. Sign-in resolves through this table, which makes a
    // missing row look exactly like a house nobody can open.
    await pg.query(
      `INSERT INTO seller_contacts (seller_id, contact_phone) VALUES ($1,$2)`,
      [sellerId, house.phone],
    );

    // An owner who can actually sign in. The portal resolves a phone to a house
    // through `seller_staff`, so a house with no staff row is a house nobody can
    // open — which is exactly how the portal looks broken on a first run.
    await pg.query(
      `INSERT INTO seller_staff (seller_id, auth_user_id, role, full_name, phone)
       VALUES ($1, gen_random_uuid(), 'owner', $2, $3)`,
      [sellerId, house.owner, house.phone],
    );

    // The verification checklist is seeded by trigger; a house cannot go live
    // until every control passes, so approve them explicitly rather than
    // reaching around the gate.
    await pg.query(`UPDATE seller_verifications SET status='approved' WHERE seller_id=$1`, [sellerId]);
    await pg.query(`UPDATE sellers SET status='live', live_at=now() WHERE id=$1`, [sellerId]);

    const b = await pg.query<{ id: string }>(
      `INSERT INTO brands (seller_id,name,name_en,slug) VALUES ($1,$2,$3,$4) RETURNING id`,
      [sellerId, house.name, house.nameEn, `${house.slug}-brand`],
    );
    const brandId = b.rows[0]!.id;

    for (const p of house.products) {
      const created = await pg.query<{ id: string }>(
        `INSERT INTO products (
           seller_id, brand_id, name, slug, sku, price_piastres, volume_ml, stock,
           concentration, form, gender_positioning, scent_family,
           notes_top, notes_heart, notes_base,
           seasons, occasions, day_night, projection_band, longevity_band, performance_source,
           responsible_party_name, return_eligibility, defect_route, fulfilment_hours, status,
           search_text)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,
           $9::concentration,'spray',$10::gender_positioning,$11::scent_family,
           $12,$13,$14,
           $15::season[],$16::occasion[],$17::day_night,$18::projection_band,$19::longevity_band,
           $20::performance_source,
           $21,'sealed_only','يُستلم المنتج من العميل ويُفحص خلال ٤٨ ساعة',48,'draft',
           $22)
         RETURNING id`,
        [
          sellerId, brandId, p.name, p.slug, p.sku, p.price, p.volume, p.stock,
          p.concentration, p.gender, p.family,
          pgArray(p.top), pgArray(p.heart), pgArray(p.base),
          pgArray(p.seasons), pgArray(p.occasions), p.dayNight, p.projection, p.longevity, p.source,
          house.name,
          // The folded, searchable form — through the DOMAIN's function, the
          // same one a query goes through. A seed that folded it any other way
          // would produce a catalogue that only looks searchable.
          // The house's LATIN wordmark is in here too. It is what a customer
          // reads on the bottle and on the tile, so "maison" has to find
          // MAISON NOUR — the fold lowercases Latin for exactly this.
          foldArabic([
            p.name, p.sku, house.name, house.nameEn,
            ...p.top, ...p.heart, ...p.base,
          ].join(' ')),
        ],
      );
      const productId = created.rows[0]!.id;
      seededProducts.push({ slug: p.slug, productId });

      /*
       * A REAL file, and the facts read from it.
       *
       * This used to write `products/<slug>.jpg` — a path with nothing behind it
       * and no facts. The storefront refuses to render such a row (0021) while
       * the publish gate accepted it (0001), so the seeded catalogue published
       * three perfumes whose own editors said the image could not be displayed.
       * 0024 closes the gate; this gives the seed something true to publish.
       *
       * The key is the shape the server issues — `products/{id}/{24 hex}.png` —
       * so the development serving route and `assertMediaKey` accept it.
       */
      const photo = photoFor(p.slug);
      const imageKey = `products/${productId}/${randomBytes(12).toString('hex')}.${EXTENSION[photo.type]}`;
      const imagePath = join(MEDIA_DIR, imageKey);
      mkdirSync(dirname(imagePath), { recursive: true });
      writeFileSync(imagePath, photo.bytes);

      await pg.query(
        `INSERT INTO product_media (product_id, storage_path, alt_text, is_primary, ownership_confirmed,
           content_type, byte_size, width, height)
         VALUES ($1,$2,$3,true,true,$4,$5,$6,$7)`,
        [productId, imageKey, `زجاجة عطر ${p.name} من ${house.name}`,
          photo.type, photo.bytes.length, photo.width, photo.height],
      );

      // Publishing runs the real gate. If anything above is incomplete, this
      // throws and names the missing field.
      await pg.query(`UPDATE products SET status='published', published_at=now() WHERE id=$1`, [productId]);
      console.log(`  · published ${p.name} (${house.name})`);
    }
  }

  // One operator, so the ops console can be opened on a first run. Without a
  // platform_staff row it is a locked door with no key — the platform role was
  // enforced everywhere and granted nowhere.
  await pg.query(
    `INSERT INTO platform_staff (auth_user_id, full_name, phone, role)
     VALUES ($1, 'مشغّل المنصّة', '01000000001', 'admin')
     ON CONFLICT (auth_user_id) DO NOTHING`,
    [PLATFORM],
  );

  /*
   * Editorial content.
   *
   * Two pages, both published, because an empty CMS tells you nothing about
   * whether the CMS works. `care` exercises every block kind the renderer
   * knows — a fixture that only uses headings and passages leaves the other
   * five untested on every screen anybody actually looks at.
   */
  const staffId = (await pg.query<{ id: string }>(
    `SELECT id FROM platform_staff WHERE auth_user_id = $1`, [PLATFORM])).rows[0]!.id;

  /*
   * Reliefs for the mock-up photographs (Le Dévoilement, 0032), so the reveal
   * can be seen locally without making each one in the console first.
   *
   * From `scripts/mock-photos/derived/` — git-ignored like the photographs
   * themselves, and made from them with hand-traced outlines by
   * design-reference/experiences/tools/bottle_to_25d.py (the stock photographs
   * are not packshots, which is exactly when the console's own tool asks for a
   * traced outline too). A perfume with no files simply has no reveal, as on a
   * fresh clone and in CI. Each file is held to the relief limits a console
   * upload is held to.
   */
  const placementsFile = join(MOCK_PHOTOS, 'derived', 'placements.json');
  const placements = existsSync(placementsFile)
    ? JSON.parse(readFileSync(placementsFile, 'utf8')) as Record<string, { centre: [number, number]; height: number; angle: number }>
    : {};
  for (const { slug, productId } of seededProducts) {
    const at = placements[slug];
    const cutoutFile = join(MOCK_PHOTOS, 'derived', `${slug}-cutout.png`);
    const reliefFile = join(MOCK_PHOTOS, 'derived', `${slug}-height.png`);
    if (!at || !existsSync(cutoutFile) || !existsSync(reliefFile) || !existsSync(join(MOCK_PHOTOS, `${slug}.jpg`))) continue;

    const files = [readFileSync(cutoutFile), readFileSync(reliefFile)];
    const facts = files.map((bytes) => sniffImage(new Uint8Array(bytes)));
    const [cutFacts, mapFacts] = facts;
    if (!cutFacts || !mapFacts || cutFacts.type !== 'image/png' || cutFacts.width !== mapFacts.width || cutFacts.height !== mapFacts.height
      || files.some((bytes, i) => objectionsToImage({ facts: facts[i]!, declaredType: 'image/png', byteSize: bytes.length, limits: RELIEF_LIMITS }).length > 0)) {
      throw new Error(`Relief files for ${slug} would be refused as a console upload.`);
    }
    const keys = files.map((bytes) => {
      const key = `reliefs/${productId}/${randomBytes(12).toString('hex')}.png`;
      const path = join(MEDIA_DIR, key);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, bytes);
      return key;
    });
    const mediaId = (await pg.query<{ id: string }>(
      `SELECT id FROM product_media WHERE product_id = $1 AND is_primary`, [productId])).rows[0]!.id;
    await pg.query(
      `INSERT INTO product_media_reliefs (media_id, cutout_key, relief_key, width, height, cutout_bytes, relief_bytes,
         centre_x_ppm, centre_y_ppm, height_ppm, angle_centidegrees, method, opaque, made_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'traced',$12,$13)`,
      [mediaId, keys[0], keys[1], cutFacts.width, cutFacts.height, files[0]!.length, files[1]!.length,
        Math.round(at.centre[0] * 1_000_000), Math.round(at.centre[1] * 1_000_000),
        Math.round(at.height * 1_000_000), Math.round(at.angle * 100),
        // The frosted green bottle of نخيل shows nothing through it.
        slug === 'nakhil', staffId],
    );
    console.log(`  · relief for ${slug}`);
  }

  const pages = [
    {
      slug: 'about',
      title: 'عن ديار',
      blocks: [
        { kind: 'passage', text: 'ديار سوق للعطور المصرية المستقلّة.\n\nنعمل مع دور صغيرة تصنع بكميات محدودة، وتُجهّز كل طلب وتشحنه بنفسها. لا مخزن مركزي، ولا وسيط بين الدار والعميل.' },
        { kind: 'heading', level: 2, text: 'لماذا الدور المستقلّة' },
        { kind: 'passage', text: 'العطر المصري له تقليد أقدم من السوق الحديثة، وأغلبه اليوم يُباع دون اسم. الدار التي تضع اسمها على الزجاجة تتحمّل مسؤوليتها.' },
        { kind: 'pull_quote', text: 'ما نبيعه ليس عطرًا فقط؛ هو اسم أحدهم على زجاجة.', attribution: 'من ميثاق ديار' },
        { kind: 'divider' },
        { kind: 'heading', level: 2, text: 'كيف نعمل' },
        { kind: 'note_list', items: [
          { term: 'التجهيز', detail: 'كل دار تُجهّز طلبها بنفسها، وتُخطر العميل عند الشحن.' },
          { term: 'الدفع', detail: 'الدفع عند الاستلام في كل الطلبات حاليًا.' },
          { term: 'الأسعار', detail: 'بالجنيه المصري وشاملة الضريبة، والتوصيل مذكور منفصلًا لكل دار.' },
        ] },
        { kind: 'call_to_action', label: 'تصفّح العطور', href: '/' },
      ],
    },
    /*
     * The three legal pages.
     *
     * THE CMS COULD PUBLISH THESE FROM THE DAY IT WAS BUILT, and nobody had
     * written them — so the site had a returns policy on every product page, a
     * line at checkout saying "by confirming you agree to the terms of sale",
     * and no terms of sale anywhere. A link to a document that does not exist
     * is worse than no link: it is a claim that the document exists.
     *
     * They are written to be READ, not to be survived. Egypt's Consumer
     * Protection Law 181/2018 requires the material terms to be clear and in
     * Arabic, and a page of untranslated boilerplate satisfies neither the law
     * nor the person trying to work out whether they can send a bottle back.
     *
     * THEY ARE NOT A LAWYER'S REVIEW. Every number in them matches what the
     * code actually enforces — fourteen days for a change of mind, thirty for a
     * fault, the phone as the identity, cash on delivery only — so they are
     * true today. A lawyer still has to read them before launch, and the two
     * places most likely to need changing are the limitation of liability and
     * the data-retention period, both of which are marked.
     */
    {
      slug: 'terms',
      title: 'شروط البيع',
      blocks: [
        { kind: 'passage', text: 'هذه الشروط تحكم الشراء من ديار. اقرأها قبل أن تطلب؛ بتأكيد الطلب فأنت توافق عليها.\n\nآخر تحديث: سبتمبر ٢٠٢٦.' },

        { kind: 'heading', level: 2, text: 'من يبيع لك' },
        { kind: 'passage', text: 'ديار سوق، لا مصنع ولا مستورد. كل عطر تشتريه تبيعه دار مستقلّة تضع اسمها على الزجاجة، وهي المسؤولة عن المنتج وعن تجهيزه وشحنه.\n\nدور ديار أن تعرض، وتحصّل الثمن، وتفصل في النزاع حين يقع. اسم الدار مذكور على صفحة كل عطر وفي كل طلب.' },

        { kind: 'heading', level: 2, text: 'الأسعار والدفع' },
        { kind: 'note_list', items: [
          { term: 'العملة', detail: 'كل الأسعار بالجنيه المصري وشاملة ضريبة القيمة المضافة.' },
          { term: 'التوصيل', detail: 'يُحسب لكل دار على حدة، ويظهر في الحقيبة قبل التأكيد. الطلب من دارين يعني شحنتين ومصروف شحن مرّتين.' },
          { term: 'الدفع', detail: 'الدفع عند الاستلام فقط في الوقت الحالي. لا نطلب بيانات بطاقة ولا نحفظها.' },
          { term: 'السعر الملزم', detail: 'السعر الملزم هو الظاهر في صفحة تأكيد الطلب. إن اختلف عن سعر رأيته قبلها، نعرض عليك الفرق ولا نُتمّ الطلب دون موافقتك.' },
        ] },

        { kind: 'heading', level: 2, text: 'التجهيز والتسليم' },
        { kind: 'passage', text: 'تؤكّد الدار الطلب خلال المدة المذكورة على صفحتها، ثم تجهّزه وتسلّمه لشركة الشحن. تصلك رسالة برقم الشحنة عند الخروج.\n\nمواعيد التسليم تقديرية لا وعدًا تعاقديًا: الشحن داخل مصر يتأثر بالأعياد وبالزحام وبعنوان ناقص. إن تأخّر طلبك عن المدة المذكورة بأكثر من ثلاثة أيام عمل، تواصل معنا ونتابعه بدلًا منك.' },

        { kind: 'heading', level: 2, text: 'الإلغاء والإرجاع' },
        { kind: 'passage', text: 'يمكنك إلغاء الطلب قبل خروجه من الدار دون أي رسوم. بعد الشحن تنطبق سياسة الإرجاع.' },
        { kind: 'call_to_action', label: 'اقرأ سياسة الإرجاع', href: '/returns' },

        { kind: 'heading', level: 2, text: 'ما لا نبيعه' },
        { kind: 'passage', text: 'لا نعرض عطورًا تُقدَّم على أنها تقليد أو نسخة من دار أخرى، ولا نسمح بادّعاء وكالة أو ترخيص لا تملكه الدار. كل منتج يمرّ على مراجعة قبل النشر، والادّعاء المخالف يُرفض ويُسحب المنتج.' },

        { kind: 'heading', level: 2, text: 'التقييمات' },
        { kind: 'passage', text: 'لا يكتب تقييمًا إلا من استلم المنتج فعلًا من خلال ديار. لا نشتري تقييمات ولا نحذف تقييمًا لأنه سيّئ. نخفي ما فيه إساءة أو بيانات شخصية أو محتوى مخالف للقانون، ونسجّل سبب الإخفاء.' },

        { kind: 'heading', level: 2, text: 'حدود المسؤولية' },
        { kind: 'passage', text: 'مسؤوليتنا عن أي طلب لا تتجاوز المبلغ المدفوع فيه. هذا لا يمسّ حقوقك المقرّرة في قانون حماية المستهلك رقم ١٨١ لسنة ٢٠١٨، ولا يُعفي أحدًا من مسؤولية الغش أو الإضرار الجسيم.\n\nالعطر مادة تُلامس الجلد. اختبر أي عطر جديد على مساحة صغيرة أولًا، ولا تستخدمه على جلد متهيّج. إن ظهر رد فعل تحسّسي، أوقف الاستخدام وراجع طبيبًا.' },

        { kind: 'heading', level: 2, text: 'القانون والاختصاص' },
        { kind: 'passage', text: 'تخضع هذه الشروط للقانون المصري، وتختص محاكم القاهرة بأي نزاع بشأنها.' },

        { kind: 'divider' },
        { kind: 'passage', text: 'لأي سؤال عن هذه الشروط، اكتب لنا.' },
        { kind: 'call_to_action', label: 'تواصل معنا', href: '/support' },
      ],
    },
    {
      slug: 'returns',
      title: 'سياسة الإرجاع',
      blocks: [
        { kind: 'passage', text: 'العطر منتج يُلامس الجلد، وزجاجة فُتحت لا تعود للمخزون. لذلك سياستنا مبنيّة على فرق واحد واضح: هل المشكلة عيب أم تغيير رأي؟' },

        { kind: 'heading', level: 2, text: 'إن كان هناك عيب' },
        { kind: 'passage', text: 'العيب يُقبل دائمًا، مهما كانت سياسة الدار، ولا شيء في هذه الصفحة يسقط هذا الحق. لديك ٣٠ يومًا من الاستلام لتطلب الإرجاع في هذه الحالات:' },
        { kind: 'note_list', items: [
          { term: 'وصل مكسورًا أو تالفًا', detail: 'صوّر العبوة كما وصلت إن أمكن. التكلفة على شركة الشحن.' },
          { term: 'وصل منتج غير الذي طلبته', detail: 'التكلفة على الدار، والشحن مجانًا في الاتجاهين.' },
          { term: 'لا يطابق الوصف المكتوب', detail: 'التكلفة على الدار. المقصود اختلاف حقيقي في الحجم أو التركيز أو المكوّنات، لا اختلاف الذوق.' },
          { term: 'به عيب صناعة', detail: 'بخّاخ لا يعمل، تسريب، أو رائحة تغيّرت. التكلفة على الدار.' },
        ] },

        { kind: 'heading', level: 2, text: 'إن غيّرت رأيك' },
        { kind: 'passage', text: 'لديك ١٤ يومًا من الاستلام، وهي المدة المقرّرة في البيع عن بُعد. شرطان:\n\nأن تكون العبوة مغلقة بختمها الأصلي ولم تُفتح، وأن تسمح سياسة الدار بذلك — وهي مذكورة على صفحة كل عطر قبل الشراء.\n\nفي هذه الحالة مصروف الشحن في الاتجاهين على العميل، ويُخصم من المبلغ المردود.' },

        { kind: 'heading', level: 2, text: 'كيف يتم الإرجاع' },
        { kind: 'note_list', items: [
          { term: 'اطلب', detail: 'من صفحة تتبّع الطلب: اكتب رقم الطلب ورقم الموبايل، ثم اختر المنتج والسبب.' },
          { term: 'انتظر ردّ الدار', detail: 'الدار تراجع الطلب وتوافق أو ترفض مع ذكر السبب.' },
          { term: 'سلّم العبوة', detail: 'نرتّب استلامها منك. ضعها كما وصلتك بقدر الإمكان.' },
          { term: 'الفحص', detail: 'تُفحص العبوة خلال ٤٨ ساعة من وصولها.' },
          { term: 'ردّ المبلغ', detail: 'خلال ٧ أيام عمل من الفحص. لا يُردّ أي مبلغ قبل وصول العبوة إلينا.' },
        ] },

        { kind: 'pull_quote', text: 'لا نردّ مبلغًا على وعد. العبوة تصل، وتُفحص، ثم يُردّ المبلغ.', attribution: 'من سياسة ديار' },

        { kind: 'heading', level: 2, text: 'ما لا يُقبل' },
        { kind: 'note_list', items: [
          { term: 'زجاجة مفتوحة لتغيير الرأي', detail: 'لا يمكن إعادة بيعها، ولا إعادتها للمخزون.' },
          { term: 'بعد انتهاء المدة', detail: '١٤ يومًا لتغيير الرأي، و٣٠ يومًا للعيب، من تاريخ الاستلام.' },
          { term: 'ضرر بعد الاستلام', detail: 'كسر أو تلف حدث عندك بعد التسليم.' },
        ] },

        { kind: 'divider' },
        { kind: 'call_to_action', label: 'ابدأ من صفحة تتبّع الطلب', href: '/order' },
      ],
    },
    {
      slug: 'privacy',
      title: 'الخصوصية',
      blocks: [
        { kind: 'passage', text: 'هذه الصفحة تشرح ما نجمعه عنك، ولماذا، ومن يراه، وكيف تطلب حذفه. مكتوبة لتُقرأ، لا لتُتجاوَز.\n\nآخر تحديث: سبتمبر ٢٠٢٦.' },

        { kind: 'heading', level: 2, text: 'ما نجمعه' },
        { kind: 'note_list', items: [
          { term: 'رقم الموبايل', detail: 'هو هويّتك عندنا. به يُفتح طلبك، وبه تتابعه، وبه نتصل عند التسليم.' },
          { term: 'الاسم والعنوان', detail: 'لتوصيل الطلب فقط. تُنسخ على الشحنة لتصل للدار وشركة الشحن.' },
          { term: 'محتوى طلبك', detail: 'ما اشتريته وكم دفعت. مطلوب للفاتورة وللمحاسبة وللإرجاع.' },
          { term: 'ما تكتبه لنا', detail: 'رسائل الدعم وطلبات الإرجاع والتقييمات.' },
        ] },
        { kind: 'passage', text: 'لا نجمع بيانات بطاقات، لأن الدفع عند الاستلام. لا نطلب رقمًا قوميًا ولا تاريخ ميلاد ولا صورة.' },

        { kind: 'heading', level: 2, text: 'من يرى ماذا' },
        { kind: 'note_list', items: [
          { term: 'الدار', detail: 'ترى ما اشتريته منها هي، واسمك وعنوانك ورقمك لتوصيله. لا ترى ما اشتريته من دار أخرى، ولا سجلّ طلباتك.' },
          { term: 'شركة الشحن', detail: 'ترى الاسم والعنوان والرقم والمبلغ المطلوب تحصيله.' },
          { term: 'فريق ديار', detail: 'يرى ما يلزم لحل مشكلتك، وكل اطّلاع إداري مقيّد في سجل.' },
          { term: 'أي جهة أخرى', detail: 'لا. لا نبيع بياناتك ولا نؤجّرها ولا نشاركها للإعلان.' },
        ] },

        { kind: 'heading', level: 2, text: 'التقييمات' },
        { kind: 'passage', text: 'يظهر مع تقييمك اسمك الأول وحرف واحد من الاسم الثاني — «ليلى م.» — ولا يظهر رقمك ولا عنوانك ولا ما اشتريته غيره.' },

        { kind: 'heading', level: 2, text: 'كم نحتفظ بها' },
        // 180 days, because that is what `app.purge_analytics_events` actually
        // deletes at (migration 0023) and what A-1 proposes to counsel. This
        // said thirteen months, written before the browsing trail existed — a
        // published promise that no longer matched the code. If counsel changes
        // the figure, BOTH this sentence and the purge change together.
        { kind: 'passage', text: 'بيانات الطلبات تُحفظ سبع سنوات، وهي المدة التي يلزمنا القانون التجاري والضريبي بحفظ الدفاتر خلالها.\n\nرسائل الدعم تُحفظ سنتين. سجلات التصفّح المجهولة تُحفظ ١٨٠ يومًا.' },

        { kind: 'heading', level: 2, text: 'حقوقك' },
        { kind: 'passage', text: 'يمكنك أن تطلب نسخة من بياناتك، أو تصحيحها، أو حذفها. نردّ خلال ٣٠ يومًا.\n\nما لا نستطيع حذفه هو ما يلزمنا القانون بحفظه: فاتورة طلب تمّ فعلًا تبقى في الدفاتر حتى تنتهي مدّتها القانونية. نحذف كل ما عداه.' },
        { kind: 'call_to_action', label: 'اطلب بياناتك أو حذفها', href: '/support' },

        { kind: 'heading', level: 2, text: 'الأمان' },
        { kind: 'passage', text: 'الوصول للبيانات مقيّد بالدور: كل دار ترى صفوفها هي فقط، والقيد مطبَّق في قاعدة البيانات نفسها لا في واجهة الاستخدام. الاتصال بالموقع مشفّر بالكامل.' },

        { kind: 'divider' },
        { kind: 'passage', text: 'لأي سؤال عن خصوصيتك، أو لتقديم شكوى، اكتب لنا وسنردّ عليك.' },
        { kind: 'call_to_action', label: 'تواصل معنا', href: '/support' },
      ],
    },
    {
      slug: 'care',
      title: 'العناية بالعطر',
      blocks: [
        { kind: 'passage', text: 'العطر مادة حيّة تتغيّر بالحرارة والضوء. القواعد التالية تطيل عمره سنوات.' },
        { kind: 'heading', level: 2, text: 'التخزين' },
        { kind: 'note_list', items: [
          { term: 'الحرارة', detail: 'أقل من ٢٥ درجة. الحمّام أسوأ مكان في البيت.' },
          { term: 'الضوء', detail: 'بعيدًا عن الشمس المباشرة. العلبة الأصلية تكفي.' },
          { term: 'الهواء', detail: 'أغلق الزجاجة جيدًا؛ الأكسجين يغيّر القمة أولًا.' },
        ] },
        { kind: 'heading', level: 3, text: 'الثلاجة' },
        { kind: 'passage', text: 'ليست ضرورية، ولا تضرّ. المهم هو ثبات الحرارة لا انخفاضها.' },
        { kind: 'call_to_action', label: 'تتبّع طلبك', href: '/order' },
      ],
    },
  ] as const;

  for (const page of pages) {
    const pageId = (await pg.query<{ id: string }>(
      `INSERT INTO content_pages (slug, title, draft_blocks)
       VALUES ($1,$2,$3::jsonb)
       ON CONFLICT (slug) DO UPDATE SET title = EXCLUDED.title, draft_blocks = EXCLUDED.draft_blocks
       RETURNING id`,
      [page.slug, page.title, JSON.stringify(page.blocks)])).rows[0]!.id;

    const revisionId = (await pg.query<{ id: string }>(
      `INSERT INTO content_revisions (page_id, title, blocks, published_by)
       VALUES ($1,$2,$3::jsonb,$4) RETURNING id`,
      [pageId, page.title, JSON.stringify(page.blocks), staffId])).rows[0]!.id;

    await pg.query(
      `UPDATE content_pages SET published_revision_id=$2, state='published' WHERE id=$1`,
      [pageId, revisionId]);
  }
  console.log(`\u00b7 published ${pages.length} content pages`);

  /*
   * A DELIVERED order, and the reviews it produced.
   *
   * Without this the review screens are correct and empty, which is the state
   * every reviews feature is in on the day it ships and the state in which
   * nobody notices it is broken. It also gives the end-to-end suite something
   * real to open: reviewing requires an order reference, a matching phone and
   * a sub-order that actually arrived, and none of those can be faked from the
   * browser.
   *
   * The sub-order is WALKED through the state machine one legal step at a time
   * rather than inserted as `delivered`. The trigger in 0001 only guards
   * UPDATE, so the shortcut would work — and would seed an order that could
   * not exist, on top of which every assertion about reviews would be resting.
   */
  const REVIEWER_PHONE = '01000000123';
  /*
   * A reference the ALPHABET actually contains.
   *
   * `DY-SEEDREV1` read nicely and could not exist: S, E and 1 are all excluded
   * from `REFERENCE_ALPHABET` — S pairs with 5, E is a vowel, 1 pairs with I
   * and L — so `normaliseOrderReference` refused it and the seeded order was
   * unreachable from the tracking screen. The review it produced still showed
   * on the product page, which is why it looked like it worked.
   *
   * Built from the domain's own alphabet rather than typed out, so a fixture
   * cannot drift from the rule again.
   */
  const REVIEW_ORDER_REF = `${REFERENCE_PREFIX}-${REFERENCE_ALPHABET.slice(0, 8)}`;

  const customerId = (await pg.query<{ id: string }>(
    `INSERT INTO customers (phone, full_name) VALUES ($1, $2)
     ON CONFLICT (phone) DO UPDATE SET full_name = EXCLUDED.full_name
     RETURNING id`,
    [REVIEWER_PHONE, 'ليلى محمود حسن'])).rows[0]!.id;

  // Two published perfumes from two different houses, so the seeded order is a
  // multi-house one — the shape this marketplace actually produces.
  const bought = (await pg.query<{
    id: string; seller_id: string; name: string; sku: string;
    volume_ml: number; price_piastres: number; brand: string;
  }>(
    `SELECT p.id, p.seller_id, p.name, p.sku, p.volume_ml, p.price_piastres, b.name AS brand
     FROM products p JOIN brands b ON b.id = p.brand_id
     WHERE p.status = 'published'
     ORDER BY p.created_at
     LIMIT 2`)).rows;

  if (bought.length === 2) {
    const merchandise = bought.reduce((sum, row) => sum + row.price_piastres, 0);
    const SHIPPING = 5_000;

    const orderId = (await pg.query<{ id: string }>(
      `INSERT INTO orders (
         reference, customer_id, contact_phone, contact_name,
         governorate, city, area, street, building,
         source, merchandise_piastres, shipping_piastres, total_piastres,
         payment_method, payment_state)
       VALUES ($1,$2,$3,$4,'cairo','مدينة نصر','الحي السابع','شارع عباس العقاد','14',
         'unknown',$5,$6,$7,'cod','pending')
       RETURNING id`,
      [REVIEW_ORDER_REF, customerId, REVIEWER_PHONE, 'ليلى محمود حسن',
        merchandise, SHIPPING * bought.length, merchandise + SHIPPING * bought.length],
    )).rows[0]!.id;

    const lineIds: string[] = [];
    for (const [index, row] of bought.entries()) {
      const subOrderId = (await pg.query<{ id: string }>(
        `INSERT INTO sub_orders (
           order_id, seller_id, reference, merchandise_piastres, shipping_piastres,
           recipient_name, recipient_phone, governorate, city, area, street, building,
           delivery_fulfilled_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'cairo','مدينة نصر','الحي السابع','شارع عباس العقاد','14',
           'seller')
         RETURNING id`,
        [orderId, row.seller_id, `${REVIEW_ORDER_REF}-${index + 1}`,
          row.price_piastres, SHIPPING, 'ليلى محمود حسن', REVIEWER_PHONE],
      )).rows[0]!.id;

      lineIds.push((await pg.query<{ id: string }>(
        `INSERT INTO order_line_items (
           sub_order_id, product_id, product_name, brand_name, sku, volume_ml,
           quantity, unit_price_piastres, line_piastres,
           commission_source, commission_bps, commission_rule_set_version, commission_piastres)
         VALUES ($1,$2,$3,$4,$5,$6,1,$7,$7,'unknown',500,1,0)
         RETURNING id`,
        [subOrderId, row.id, row.name, row.brand, row.sku, row.volume_ml, row.price_piastres],
      )).rows[0]!.id);

      // One legal step at a time. See the note above.
      for (const state of ['awaiting_seller', 'confirmed', 'dispatched', 'delivered']) {
        await pg.query(`UPDATE sub_orders SET state = $2::sub_order_state WHERE id = $1`,
          [subOrderId, state]);
      }
      await pg.query(`UPDATE sub_orders SET delivered_at = now() WHERE id = $1`, [subOrderId]);
    }

    /*
     * One review, not two.
     *
     * The second line stays unreviewed on purpose: the tracking screen has two
     * states to show — "قيّم" and "تم التقييم" — and a fixture that reviews
     * everything renders only one of them.
     *
     * The scores are deliberately uneven, and the low one is on مطابقة الوصف.
     * A seed where every dimension is 5 makes the six-bar block look like
     * decoration; the whole reason it exists is that a house can be excellent
     * at perfume and careless about its own listing.
     */
    await pg.query(
      `INSERT INTO reviews (
         sub_order_id, line_item_id, product_id, customer_id,
         rating_scent, rating_longevity, rating_projection,
         rating_value, rating_packaging, rating_description_accuracy, body, author_label)
       SELECT li.sub_order_id, li.id, li.product_id, $2, 5, 4, 3, 5, 5, 2, $3,
         -- Masked and frozen at write time, exactly as the repository writes
         -- it. A seed that stored the full name would put a customer's legal
         -- name on a public page.
         $4
       FROM order_line_items li WHERE li.id = $1
       ON CONFLICT (line_item_id) DO NOTHING`,
      [lineIds[0]!, customerId,
        'الرائحة أجمل مما توقّعت، والثبات محترم على الملابس أكثر من الجلد. '
        + 'الوصف في الصفحة بالغ في الانتشار قليلًا: هو عطر قريب، لا يملأ غرفة.',
        publicAuthorName('ليلى محمود حسن')],
    );

    console.log('\u00b7 seeded a delivered order with one review');
    console.log(`  Track it at /order — ${REVIEW_ORDER_REF} / ${REVIEWER_PHONE}`);
  }

  const count = await pg.query<{ n: number }>(`SELECT count(*)::int n FROM products WHERE status='published'`);
  console.log(`\n✓ seeded ${count.rows[0]!.n} published products across ${houses.length} houses`);
  console.log(String.fromCharCode(10) + '  Seller portal — /seller. Sign in with any of these numbers;');
  console.log('  the one-time code is printed to the dev server console.');
  for (const house of houses) console.log(`    ${house.phone}  ${house.name}`);
  console.log(String.fromCharCode(10) + '  Operations console — /ops. Sign in with 01000000001.');

  await seedEnglish(pg, staffId);
  await pg.close();
}

main().catch((e) => {
  console.error('\n✗ seed failed:', (e as Error).message);
  process.exit(1);
});
