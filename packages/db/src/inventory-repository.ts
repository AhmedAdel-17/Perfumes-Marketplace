/** Repository + compare-and-set command. The caller's existing seller RLS
 * scopes every row; product locks serialize corrections against checkout holds. */
import { sql, type SQL } from 'drizzle-orm';
import type { InventoryRepository, InventoryStock } from '@diyar/domain';
import type { DiyarDatabase } from './repositories';

type StockRow = { id: string; stock: number | null; reserved_stock: number; seller_id: string };
const project = (row: StockRow): InventoryStock => ({ productId: row.id, onHand: row.stock ?? 0,
  reserved: row.reserved_stock, available: (row.stock ?? 0) - row.reserved_stock });

export function inventoryRepository(db: DiyarDatabase): InventoryRepository {
  const query = async <T>(statement: SQL): Promise<{rows:T[]}> => {
    const result: unknown = await db.execute(statement);
    const rows = Array.isArray(result) ? result : result && typeof result === 'object' && 'rows' in result ? result.rows : null;
    if (!Array.isArray(rows)) throw new Error('Invalid inventory database result');
    return { rows: rows as T[] };
  };
  return {
    async summary(productId) {
      const result = await query<StockRow>(sql`SELECT id,stock,reserved_stock,seller_id FROM products
        WHERE id=${productId}::uuid AND (seller_id=app.staff_seller_id() OR app.actor_role()='platform')`);
      return result.rows[0] ? project(result.rows[0]) : null;
    },
    async movements(productId, limit) {
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('Invalid inventory history limit');
      const result = await query<{ id: string; product_id: string; kind: string; delta_on_hand: number;
        delta_reserved: number; reason: string; occurred_at: string | Date }>(sql`
        SELECT id,product_id,kind,delta_on_hand,delta_reserved,reason,occurred_at FROM inventory_movements
        WHERE product_id=${productId}::uuid ORDER BY occurred_at DESC,id DESC LIMIT ${limit}`);
      return result.rows.map(row => ({ id: row.id, productId: row.product_id, kind: row.kind,
        deltaOnHand: row.delta_on_hand, deltaReserved: row.delta_reserved, reason: row.reason,
        occurredAt: new Date(row.occurred_at) }));
    },
    async adjust(input) {
      if (!Number.isSafeInteger(input.expectedOnHand) || input.expectedOnHand < 0 || input.expectedOnHand > 100000
        || !Number.isSafeInteger(input.delta) || input.delta === 0 || Math.abs(input.delta) > 100000
        || !['restock','count_correction','damage','return_inspected'].includes(input.reason)
        || (['restock','return_inspected'].includes(input.reason) && input.delta < 0)
        || (input.reason === 'damage' && input.delta > 0) || !Number.isFinite(input.occurredAt.getTime())) {
        return { ok: false, reason: 'invalid' };
      }
      await db.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended('inventory-adjust:' || coalesce(app.staff_seller_id()::text,'') || ':' || ${input.requestId},0))`);
      const locked = await query<StockRow>(sql`SELECT id,stock,reserved_stock,seller_id FROM products
        WHERE id=${input.productId}::uuid AND seller_id=app.staff_seller_id() FOR UPDATE`);
      const row = locked.rows[0];
      if (!row) return { ok: false, reason: 'not_found' };
      const previous = await query<{ product_id: string; delta_on_hand: number; reason: string; stock_before: number }>(sql`
        SELECT product_id,delta_on_hand,reason,stock_before FROM inventory_movements
        WHERE seller_id=${row.seller_id}::uuid AND request_id=${input.requestId}::uuid`);
      const replay = previous.rows[0];
      if (replay) return replay.product_id === input.productId && replay.delta_on_hand === input.delta
        && replay.reason === input.reason && replay.stock_before === input.expectedOnHand
        ? { ok: true, stock: project(row) } : { ok: false, reason: 'conflict' };
      if ((row.stock ?? 0) !== input.expectedOnHand) return { ok: false, reason: 'conflict' };
      const next = input.expectedOnHand + input.delta;
      if (next < row.reserved_stock) return { ok: false, reason: 'insufficient_stock' };
      if (next > 100000) return { ok: false, reason: 'invalid' };
      await db.execute(sql`SELECT set_config('app.inventory_reason',${input.reason},true),
        set_config('app.inventory_request_id',${input.requestId},true),
        set_config('app.inventory_at',${input.occurredAt.toISOString()},true)`);
      await db.execute(sql`UPDATE products SET stock=${next} WHERE id=${row.id}::uuid`);
      await db.execute(sql`SELECT set_config('app.inventory_reason','',true),set_config('app.inventory_request_id','',true),set_config('app.inventory_at','',true)`);
      return { ok: true, stock: project({ ...row, stock: next }) };
    },
  };
}
