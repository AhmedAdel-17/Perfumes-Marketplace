/**
 * Migration 0021 — a stored photograph's facts, held by the database.
 *
 * Every case here is a write the database must accept or refuse on its own,
 * whatever the application sends: the upload flow is one writer among the
 * seeder, the fixtures and anyone with a SQL client.
 */
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyMigrations } from './migrate';

const PLATFORM = '99999999-9999-9999-9999-999999999999';

let db: PGlite;
let productId: string;

const refuses = async (work: () => Promise<unknown>): Promise<string> => {
  try {
    await work();
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error('expected the database to refuse this write, but it succeeded');
};

async function newProduct(): Promise<string> {
  const suffix = Math.random().toString(36).slice(2, 8);
  const seller = await db.query<{ id: string }>(
    `INSERT INTO sellers (trading_name, owner_name, slug)
     VALUES ('دار الورد', 'خالد', $1) RETURNING id`, [`ward-${suffix}`]);
  const brand = await db.query<{ id: string }>(
    `INSERT INTO brands (seller_id, name, slug) VALUES ($1, 'دار الورد', $2) RETURNING id`,
    [seller.rows[0]!.id, `ward-brand-${suffix}`]);
  const product = await db.query<{ id: string }>(
    `INSERT INTO products (seller_id, brand_id, name, slug, sku, price_piastres, volume_ml)
     VALUES ($1, $2, 'ورد الطائف', $3, $4, 38000, 30) RETURNING id`,
    [seller.rows[0]!.id, brand.rows[0]!.id, `taif-${suffix}`, `WRD-${suffix}`]);
  return product.rows[0]!.id;
}

const insertMedia = (values: {
  product?: string;
  primary?: boolean;
  type?: string | null;
  bytes?: number | null;
  width?: number | null;
  height?: number | null;
}) => db.query(
  `INSERT INTO product_media
     (product_id, storage_path, alt_text, is_primary, ownership_confirmed,
      content_type, byte_size, width, height)
   VALUES ($1, $2, 'زجاجة العطر', $3, true, $4, $5, $6, $7)`,
  [
    values.product ?? productId,
    `products/${Math.random().toString(16).slice(2)}.jpg`,
    values.primary ?? false,
    values.type === undefined ? 'image/jpeg' : values.type,
    values.bytes === undefined ? 2_400_000 : values.bytes,
    values.width === undefined ? 2400 : values.width,
    values.height === undefined ? 3000 : values.height,
  ],
);

beforeAll(async () => {
  db = new PGlite();
  await applyMigrations(db);
  await db.exec(`SET app.actor_role='platform'; SET app.actor_id='${PLATFORM}';`);
  productId = await newProduct();
}, 120_000);

afterAll(async () => { await db?.close(); });

describe('0021 — a photograph’s facts are all present or all absent', () => {
  it('accepts a verified upload with every fact', async () => {
    await expect(insertMedia({})).resolves.toBeDefined();
  });

  it('accepts a row with NO facts — written before the upload flow existed', async () => {
    // The seeder and the fixtures write these. The shop does not render them
    // as photographs, but they are not invalid rows.
    await expect(insertMedia({ type: null, bytes: null, width: null, height: null }))
      .resolves.toBeDefined();
  });

  it('refuses a half-written row — a size with no dimensions is neither', async () => {
    const message = await refuses(() => insertMedia({ width: null, height: null }));
    expect(message).toMatch(/product_media_facts_all_or_none/);
  });

  it('refuses a type this site does not serve as a photograph', async () => {
    // Stored as `text/html`, a file served from this domain is a page, not a
    // picture. The upload flow reads the real type; this is the lock behind it.
    const message = await refuses(() => insertMedia({ type: 'text/html' }));
    expect(message).toMatch(/product_media_facts_all_or_none/);
  });

  it('refuses zero dimensions', async () => {
    const message = await refuses(() => insertMedia({ width: 0 }));
    expect(message).toMatch(/product_media_facts_all_or_none/);
  });
});

describe('0021 — one primary photograph per product', () => {
  it('refuses a second primary on the same product', async () => {
    const product = await newProduct();
    await insertMedia({ product, primary: true });
    const message = await refuses(() => insertMedia({ product, primary: true }));
    expect(message).toMatch(/product_media_one_primary/);
  });

  it('allows any number of non-primary photographs beside it', async () => {
    const product = await newProduct();
    await insertMedia({ product, primary: true });
    await expect(insertMedia({ product })).resolves.toBeDefined();
    await expect(insertMedia({ product })).resolves.toBeDefined();
  });

  it('allows a primary on each product — the rule is per product, not global', async () => {
    const first = await newProduct();
    const second = await newProduct();
    await insertMedia({ product: first, primary: true });
    await expect(insertMedia({ product: second, primary: true })).resolves.toBeDefined();
  });
});
