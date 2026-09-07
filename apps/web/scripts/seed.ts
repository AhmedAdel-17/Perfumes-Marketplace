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
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const DATA_DIR = process.env.PGLITE_DIR ?? './.data/pg';
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
  }
  // PGlite opens the directory but does not create the parent chain.
  mkdirSync(DATA_DIR, { recursive: true });

  const pg = new PGlite(DATA_DIR);

  await applyMigrations(pg, { onApplied: (file) => console.log('· applied', file) });

  await pg.exec(`SET app.actor_role='platform'; SET app.actor_id='${PLATFORM}';`);

  const existing = await pg.query<{ n: number }>(`SELECT count(*)::int n FROM products`);
  if (existing.rows[0]!.n > 0) {
    console.log(`\n· ${existing.rows[0]!.n} products already present — nothing to do`);
    await pg.close();
    return;
  }

  for (const house of houses) {
    const s = await pg.query<{ id: string }>(
      `INSERT INTO sellers (trading_name, owner_name, contact_phone, slug, city, status,
         bio, story, founded_year, service_governorates)
       VALUES ($1,$2,$3,$4,$5,'applied',$6,$7,$8,$9::governorate[]) RETURNING id`,
      [
        house.name, house.owner, house.phone, house.slug, house.city,
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
           responsible_party_name, return_eligibility, defect_route, fulfilment_hours, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,
           $9::concentration,'spray',$10::gender_positioning,$11::scent_family,
           $12,$13,$14,
           $15::season[],$16::occasion[],$17::day_night,$18::projection_band,$19::longevity_band,
           $20::performance_source,
           $21,'sealed_only','يُستلم المنتج من العميل ويُفحص خلال ٤٨ ساعة',48,'draft')
         RETURNING id`,
        [
          sellerId, brandId, p.name, p.slug, p.sku, p.price, p.volume, p.stock,
          p.concentration, p.gender, p.family,
          pgArray(p.top), pgArray(p.heart), pgArray(p.base),
          pgArray(p.seasons), pgArray(p.occasions), p.dayNight, p.projection, p.longevity, p.source,
          house.name,
        ],
      );
      const productId = created.rows[0]!.id;

      await pg.query(
        `INSERT INTO product_media (product_id, storage_path, alt_text, is_primary, ownership_confirmed)
         VALUES ($1,$2,$3,true,true)`,
        [productId, `products/${p.slug}.jpg`, `زجاجة عطر ${p.name} من ${house.name}`],
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

  const count = await pg.query<{ n: number }>(`SELECT count(*)::int n FROM products WHERE status='published'`);
  console.log(`\n✓ seeded ${count.rows[0]!.n} published products across ${houses.length} houses`);
  console.log(String.fromCharCode(10) + '  Seller portal — /seller. Sign in with any of these numbers;');
  console.log('  the one-time code is printed to the dev server console.');
  for (const house of houses) console.log(`    ${house.phone}  ${house.name}`);
  console.log(String.fromCharCode(10) + '  Operations console — /ops. Sign in with 01000000001.');
  await pg.close();
}

main().catch((e) => {
  console.error('\n✗ seed failed:', (e as Error).message);
  process.exit(1);
});
