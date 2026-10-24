/** Forward-only upgrade safety: 0038 accepts valid history and refuses to rewrite bad history. */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MIGRATIONS_DIR, migrationFiles } from './migrate';

const upgrade = readFileSync(join(MIGRATIONS_DIR, '0038_seller_integrity.sql'), 'utf8')
  .replace(/--> statement-breakpoint/g, '');

async function legacyFixture(mismatch: boolean) {
  const db = new PGlite();
  try {
    for (const file of migrationFiles().filter((name) => name < '0038')) {
      await db.exec(readFileSync(join(MIGRATIONS_DIR, file), 'utf8').replace(/--> statement-breakpoint/g, ''));
    }
    await db.exec("SET app.actor_role='platform'");
    const sellerA = (await db.query<{ id: string }>("INSERT INTO sellers (trading_name,owner_name,slug) VALUES ('A','A','upgrade-a') RETURNING id")).rows[0]!.id;
    const sellerB = (await db.query<{ id: string }>("INSERT INTO sellers (trading_name,owner_name,slug) VALUES ('B','B','upgrade-b') RETURNING id")).rows[0]!.id;
    const brand = (await db.query<{ id: string }>("INSERT INTO brands (seller_id,name,slug) VALUES ($1,'A','upgrade-brand') RETURNING id", [sellerA])).rows[0]!.id;
    await db.query(`INSERT INTO products (seller_id,brand_id,name,slug,sku,price_piastres,volume_ml,stock)
      VALUES ($1,$2,'Original','upgrade-original','ORIGINAL',12345,50,3)`, [mismatch ? sellerB : sellerA, brand]);
    return db;
  } catch (error) {
    await db.close();
    throw error;
  }
}

describe('0038 preserves legacy data while installing new invariants', () => {
  it('upgrades valid existing listings without changing identities, prices or stock', async () => {
    const db = await legacyFixture(false);
    try {
      const before = await db.query('SELECT * FROM products');
      await db.exec(upgrade);
      expect((await db.query('SELECT * FROM products')).rows).toEqual(before.rows);
      const fk = await db.query<{ convalidated: boolean }>("SELECT convalidated FROM pg_constraint WHERE conname='products_brand_seller_fk'");
      expect(fk.rows).toEqual([{ convalidated: true }]);
    } finally { await db.close(); }
  });
  it('stops on incompatible ownership without reassigning or deleting any history', async () => {
    const db = await legacyFixture(true);
    try {
      const before = await db.query('SELECT * FROM products');
      await expect(db.exec(upgrade)).rejects.toThrow('existing listing/brand ownership mismatches require manual review');
      expect((await db.query('SELECT * FROM products')).rows).toEqual(before.rows);
      expect((await db.query("SELECT 1 FROM pg_constraint WHERE conname='products_brand_seller_fk'")).rows).toHaveLength(0);
    } finally { await db.close(); }
  });

});


it('0039/0040 preserve a populated schema and stop on invalid legacy rates without repair', async () => {
  const db = await legacyFixture(false);
  try {
    await db.exec(upgrade);
    const before = (await db.query('SELECT * FROM products')).rows;
    await db.exec(readFileSync(join(MIGRATIONS_DIR, '0039_product_revision_capture.sql'), 'utf8'));
    expect((await db.query('SELECT * FROM products')).rows).toEqual(before);
    expect((await db.query('SELECT * FROM product_revisions')).rows).toHaveLength(0);
    await db.exec(`WITH rule AS (INSERT INTO commission_rule_sets(version,effective_from,approved_by,
      storefront_referral_bps,direct_repeat_bps,organic_search_bps,paid_campaign_bps,creator_affiliate_bps,email_crm_bps,unknown_bps)
      VALUES (1,now(),ARRAY['test-a','test-b'],500,500,500,500,500,500,500) RETURNING id)
      INSERT INTO commission_overrides(rule_set_id,seller_id,source,bps)
      SELECT rule.id,s.id,'unknown',10001 FROM rule CROSS JOIN sellers s LIMIT 1`);
    const graph = readFileSync(join(MIGRATIONS_DIR, '0040_tenant_graph_integrity.sql'), 'utf8');
    await expect(db.exec(graph)).rejects.toThrow('Data integrity preflight failed');
    expect((await db.query('SELECT bps FROM commission_overrides')).rows).toEqual([{ bps: 10001 }]);
    expect((await db.query('SELECT * FROM products')).rows).toEqual(before);
    // The operator repairs only this synthetic fixture; migration performs no repair.
    await db.exec('UPDATE commission_overrides SET bps=500');
    await db.exec(graph);
    expect((await db.query('SELECT * FROM products')).rows).toEqual(before);
    expect((await db.query('SELECT * FROM product_revisions')).rows).toHaveLength(0);
    await expect(db.exec('UPDATE commission_overrides SET bps=10001')).rejects.toThrow();
  } finally { await db.close(); }
});
