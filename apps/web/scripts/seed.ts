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

  for (const file of ['0000_initial.sql', '0001_constraints.sql', '0002_rls.sql', '0003_checkout.sql']) {
    const sql = readFileSync(join(MIGRATIONS, file), 'utf8').replace(/--> statement-breakpoint/g, '');
    try {
      await pg.exec(sql);
      console.log('· applied', file);
    } catch (e) {
      const message = (e as Error).message;
      if (/already exists/i.test(message)) {
        console.log('· skipped', file, '(already applied)');
      } else {
        throw e;
      }
    }
  }

  await pg.exec(`SET app.actor_role='platform'; SET app.actor_id='${PLATFORM}';`);

  const existing = await pg.query<{ n: number }>(`SELECT count(*)::int n FROM products`);
  if (existing.rows[0]!.n > 0) {
    console.log(`\n· ${existing.rows[0]!.n} products already present — nothing to do`);
    await pg.close();
    return;
  }

  for (const house of houses) {
    const s = await pg.query<{ id: string }>(
      `INSERT INTO sellers (trading_name, name_en, owner_name, contact_phone, slug, city, status)
       VALUES ($1,$2,$3,'01001234567',$4,$5,'applied') RETURNING id`,
      [house.name, house.nameEn, house.owner, house.slug, house.city],
    ).catch(async () =>
      // `name_en` does not exist on sellers; fall back to the real columns.
      pg.query<{ id: string }>(
        `INSERT INTO sellers (trading_name, owner_name, contact_phone, slug, city, status)
         VALUES ($1,$2,'01001234567',$3,$4,'applied') RETURNING id`,
        [house.name, house.owner, house.slug, house.city],
      ),
    );
    const sellerId = s.rows[0]!.id;

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

  const count = await pg.query<{ n: number }>(`SELECT count(*)::int n FROM products WHERE status='published'`);
  console.log(`\n✓ seeded ${count.rows[0]!.n} published products across ${houses.length} houses`);
  await pg.close();
}

main().catch((e) => {
  console.error('\n✗ seed failed:', (e as Error).message);
  process.exit(1);
});
