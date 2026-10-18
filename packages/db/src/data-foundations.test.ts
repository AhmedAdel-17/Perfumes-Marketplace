import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyMigrations } from './migrate';
let db:PGlite; let seller:string; let brand:string; let product:string; let order:string; let sub:string; let line:string;
const OWNER='11111111-1111-4111-8111-111111111111';
const id=async(sql:string,p:unknown[]=[])=>(await db.query<{id:string}>(sql,p)).rows[0]!.id;
beforeAll(async()=>{
  db=new PGlite(); await applyMigrations(db); await db.exec("SET app.actor_role='platform'; SET app.actor_id='99999999-9999-4999-8999-999999999999'");
  seller=await id("INSERT INTO sellers(trading_name,owner_name,slug,status) VALUES('A','A','foundation-a','live') RETURNING id");
  await db.query("INSERT INTO seller_staff(seller_id,auth_user_id,role,full_name) VALUES($1,$2,'owner','Owner')",[seller,OWNER]);
  brand=await id("INSERT INTO brands(seller_id,name,slug) VALUES($1,'A','foundation-brand') RETURNING id",[seller]);
  product=await id("INSERT INTO products(seller_id,brand_id,name,slug,sku,price_piastres,volume_ml,stock) VALUES($1,$2,'A','foundation-product','A',10000,50,5) RETURNING id",[seller,brand]);
  const customer=await id("INSERT INTO customers(phone) VALUES('01055555555') RETURNING id");
  order=await id(`INSERT INTO orders(reference,customer_id,contact_phone,contact_name,governorate,city,area,street,building,source,merchandise_piastres,shipping_piastres,total_piastres,payment_method)
    VALUES('DY-FOUNDATION',$1,'01055555555','Buyer','cairo','City','Area','Street','1','unknown',10000,0,10000,'cod') RETURNING id`,[customer]);
  sub=await id(`INSERT INTO sub_orders(order_id,seller_id,reference,merchandise_piastres,shipping_piastres,delivery_fulfilled_by,recipient_name,recipient_phone,governorate,city,area,street,building)
    VALUES($1,$2,'DY-FOUNDATION-A',10000,0,'seller','Buyer','01055555555','cairo','City','Area','Street','1') RETURNING id`,[order,seller]);
  line=await id(`INSERT INTO order_line_items(sub_order_id,product_id,product_name,brand_name,sku,volume_ml,quantity,unit_price_piastres,line_piastres,commission_source,commission_bps,commission_rule_set_version,commission_piastres)
    VALUES($1,$2,'A','A','A',50,2,5000,10000,'unknown',0,1,0) RETURNING id`,[sub,product]);
},180000);
afterAll(async()=>db?.close());
describe('inventory ledger and reservation boundary',()=>{
  it('seeds existing stock, reserves atomically and consumes idempotently',async()=>{
    await db.exec("SET app.actor_role='checkout'; RESET app.actor_id"); const key=crypto.randomUUID();
    const reservation=(await db.query<{id:string}>("SELECT app.reserve_inventory($1,2,$2,now()+interval '15 minutes') id",[product,key])).rows[0]!.id;
    expect((await db.query<{stock:number}>('SELECT stock FROM products WHERE id=$1',[product])).rows[0]!.stock).toBe(3);
    expect((await db.query<{id:string}>("SELECT app.reserve_inventory($1,2,$2,now()+interval '15 minutes') id",[product,key])).rows[0]!.id).toBe(reservation);
    await db.query('SELECT app.consume_inventory($1,$2)',[reservation,line]); await db.query('SELECT app.consume_inventory($1,$2)',[reservation,line]);
    expect((await db.query<{on_hand:number;reserved:number}>('SELECT on_hand,reserved FROM inventory_balances WHERE product_id=$1',[product])).rows[0]).toEqual({on_hand:3,reserved:0});
    expect((await db.query('SELECT id FROM inventory_movements WHERE reservation_id=$1',[reservation])).rows).toHaveLength(2);
  });
  it('refuses overselling and makes movement history append-only',async()=>{
    await db.exec("SET app.actor_role='seller'; SET app.actor_id='"+OWNER+"'; SET ROLE app_user");
    await db.query('UPDATE products SET stock=4 WHERE id=$1',[product]);
    await db.exec("RESET ROLE; SET app.actor_role='checkout'; RESET app.actor_id");
    expect((await db.query<{on_hand:number}>('SELECT on_hand FROM inventory_balances WHERE product_id=$1',[product])).rows[0]!.on_hand).toBe(4);
    await expect(db.query("SELECT app.reserve_inventory($1,5,$2,now()+interval '15 minutes')",[product,crypto.randomUUID()])).rejects.toThrow('Insufficient');
    await db.exec("SET app.actor_role='platform'");
    await expect(db.exec('DELETE FROM inventory_movements')).rejects.toThrow('append-only');
  });
});
describe('financial correctness primitives',()=>{
  it('prevents paying one sub-order in two statements',async()=>{
    await db.exec("UPDATE sub_orders SET state='awaiting_seller' WHERE id='"+sub+"'; UPDATE sub_orders SET state='confirmed' WHERE id='"+sub+"'; UPDATE sub_orders SET state='dispatched' WHERE id='"+sub+"'; UPDATE sub_orders SET state='delivered' WHERE id='"+sub+"'");
    const p1=await id("INSERT INTO payouts(seller_id,reference,period_start,period_end) VALUES($1,'PF-1',now(),now()) RETURNING id",[seller]);
    const p2=await id("INSERT INTO payouts(seller_id,reference,period_start,period_end) VALUES($1,'PF-2',now(),now()) RETURNING id",[seller]);
    await db.query("INSERT INTO payout_lines(payout_id,sub_order_id,gross_piastres,commission_piastres,commission_source,commission_bps,shipping_piastres,net_piastres) VALUES($1,$2,10000,0,'unknown',0,0,10000)",[p1,sub]);
    await expect(db.query('UPDATE payout_lines SET gross_piastres=1 WHERE payout_id=$1',[p1])).rejects.toThrow('append-only');
    await expect(db.query("INSERT INTO payout_lines(payout_id,sub_order_id,gross_piastres,commission_piastres,commission_source,commission_bps,shipping_piastres,net_piastres) VALUES($1,$2,10000,0,'unknown',0,0,10000)",[p2,sub])).rejects.toThrow();
  });
  it('deduplicates provider commands, bounds allocations and preserves postings',async()=>{
    const key=crypto.randomUUID();
    await db.query("INSERT INTO payment_attempts(order_id,provider,idempotency_key,amount_piastres) VALUES($1,'cod',$2,10000)",[order,key]);
    await expect(db.query("INSERT INTO payment_attempts(order_id,provider,idempotency_key,amount_piastres) VALUES($1,'cod',$2,10000)",[order,key])).rejects.toThrow();
    await expect(db.query("UPDATE payment_attempts SET status='refunded' WHERE provider='cod' AND idempotency_key=$1",[key])).rejects.toThrow('Illegal');
    await expect(db.query("DELETE FROM payment_attempts WHERE provider='cod' AND idempotency_key=$1",[key])).rejects.toThrow('cannot be deleted');
    const refund=await id("INSERT INTO refunds(order_id,provider,idempotency_key,amount_piastres,created_by) VALUES($1,'manual',$2,5000,'99999999-9999-4999-8999-999999999999') RETURNING id",[order,crypto.randomUUID()]);
    await expect(db.query("INSERT INTO refunds(order_id,provider,idempotency_key,amount_piastres,created_by) VALUES($1,'manual',$2,5001,'99999999-9999-4999-8999-999999999999')",[order,crypto.randomUUID()])).rejects.toThrow('order total');
    await db.query('INSERT INTO refund_allocations(refund_id,line_item_id,amount_piastres) VALUES($1,$2,5000)',[refund,line]);
    await expect(db.query('UPDATE refund_allocations SET amount_piastres=5001 WHERE refund_id=$1 AND line_item_id=$2',[refund,line])).rejects.toThrow('exceed');
    await db.query("UPDATE refunds SET status='submitted' WHERE id=$1",[refund]);
    await db.query("UPDATE refunds SET status='succeeded',completed_at=now() WHERE id=$1",[refund]);
    await expect(db.query('UPDATE refund_allocations SET amount_piastres=4999 WHERE refund_id=$1 AND line_item_id=$2',[refund,line])).rejects.toThrow('immutable');
    await expect(db.query('DELETE FROM refunds WHERE id=$1',[refund])).rejects.toThrow('append-only');
    await db.query("INSERT INTO financial_postings(idempotency_key,seller_id,order_id,sub_order_id,kind,amount_piastres) VALUES('sale:foundation',$1,$2,$3,'sale',10000)",[seller,order,sub]);
    await expect(db.exec("UPDATE financial_postings SET amount_piastres=1 WHERE idempotency_key='sale:foundation'")).rejects.toThrow('append-only');
  });
});
