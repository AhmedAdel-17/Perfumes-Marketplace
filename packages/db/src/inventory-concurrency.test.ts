/** Two real PostgreSQL sessions, disposable empty localhost database only.
 * PGlite's single writer cannot prove the locking guarantees exercised here. */
import postgres from 'postgres';
import {Address,FixedClock,Money,PlaceOrder} from '@diyar/domain';
import { randomUUID } from 'node:crypto';
import { drizzle } from 'drizzle-orm/postgres-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyMigrations } from './migrate';
import { DrizzleUnitOfWork, type DiyarDatabase } from './repositories';
import * as schema from './schema';
const url=process.env.DIYAR_INVENTORY_TEST_URL;
describe.skipIf(!url)('independent PostgreSQL inventory transactions',()=>{
 let admin:ReturnType<typeof postgres>,a:ReturnType<typeof postgres>,b:ReturnType<typeof postgres>;
 let seller:string,brand:string,customer:string;let seq=0;
 const owner='88888888-8888-4888-8888-888888888888';
 beforeAll(async()=>{
  const parsed=new URL(url!);if(!['localhost','127.0.0.1','[::1]'].includes(parsed.hostname)||!/^\/diyar_concurrency_/.test(parsed.pathname))throw new Error('An isolated localhost test database is required');
  admin=postgres(url!,{max:1});a=postgres(url!,{max:1});b=postgres(url!,{max:1});
  const tables=await admin`SELECT count(*)::int n FROM pg_tables WHERE schemaname='public'`;
  if(tables[0]!.n!==0)throw new Error('Refusing to migrate a nonempty database');
  await applyMigrations({exec:q=>admin.unsafe(q),query:async<T>(q:string)=>({rows:await admin.unsafe(q) as unknown as T[]})});
  await admin`SELECT set_config('app.actor_role','platform',false)`;
  seller=(await admin`INSERT INTO sellers(trading_name,owner_name,slug,status) VALUES('Inventory','Owner','inventory-concurrency','live') RETURNING id`)[0]!.id;
  brand=(await admin`INSERT INTO brands(seller_id,name,slug) VALUES(${seller},'Inventory','inventory-concurrency') RETURNING id`)[0]!.id;
  customer=(await admin`INSERT INTO customers(phone) VALUES('01012345678') RETURNING id`)[0]!.id;
  await admin`INSERT INTO seller_staff(seller_id,auth_user_id,role,full_name) VALUES(${seller},${owner},'owner','Owner')`;
 },120000);
 afterAll(async()=>{await Promise.all([admin?.end(),a?.end(),b?.end()]);});
 async function product(stock:number){
 const key='inventory-'+(++seq);
 const id=(await admin`INSERT INTO products(seller_id,brand_id,name,slug,sku,stock,price_piastres,volume_ml,
 concentration,form,gender_positioning,scent_family,notes_top,notes_heart,notes_base,seasons,occasions,day_night,projection_band,longevity_band,performance_source,responsible_party_name,return_eligibility,defect_route)
 VALUES(${seller},${brand},${key},${key},${key},${stock},10000,50,'eau_de_parfum','spray','unisex','amber',ARRAY['citrus'],ARRAY['rose'],ARRAY['amber'],ARRAY['winter']::season[],ARRAY['daily']::occasion[],'both','moderate','long','seller_provided','House','sealed_only','Support') RETURNING id`)[0]!.id as string;
 await admin`INSERT INTO product_media(product_id,storage_path,alt_text,is_primary,ownership_confirmed,content_type,byte_size,width,height) VALUES(${id},${'products/'+id+'/aaaaaaaaaaaaaaaaaaaaaaaa.jpg'},'Bottle',true,true,'image/jpeg',10000,1000,1000)`;
 await admin`UPDATE products SET status='published' WHERE id=${id}`;return id;
}
 async function suborder(){const ref='DY-INVENTORY-'+(++seq);const order=(await admin`INSERT INTO orders(reference,customer_id,contact_phone,contact_name,governorate,city,area,street,building,source,merchandise_piastres,shipping_piastres,total_piastres,payment_method) VALUES(${ref},${customer},'01012345678','Buyer','cairo','City','Area','Street','1','unknown',10000,0,10000,'cod') RETURNING id`)[0]!.id;return(await admin`INSERT INTO sub_orders(order_id,seller_id,reference,merchandise_piastres,shipping_piastres,delivery_fulfilled_by,recipient_name,recipient_phone,governorate,city,area,street,building) VALUES(${order},${seller},${ref+'-A'},10000,0,'seller','Buyer','01012345678','cairo','City','Area','Street','1') RETURNING id`)[0]!.id as string;}
 async function reserve(client:ReturnType<typeof postgres>,sub:string,p:string,rollback=false){return client.begin(async tx=>{
  await tx`SET LOCAL ROLE app_user`;await tx`SELECT set_config('app.actor_role','checkout',true)`;
  await tx`INSERT INTO order_line_items(sub_order_id,product_id,product_name,brand_name,sku,volume_ml,quantity,unit_price_piastres,line_piastres,commission_source,commission_bps,commission_rule_set_version,commission_piastres) VALUES(${sub},${p},'P','B','S',50,1,10000,10000,'unknown',500,1,500)`;
  if(rollback)throw new Error('intentional rollback');return true;
 });}
 it('lets exactly one checkout reserve the last unit',async()=>{
  const p=await product(1),s1=await suborder(),s2=await suborder();
  const result=await Promise.allSettled([reserve(a,s1,p),reserve(b,s2,p)]);
  expect(result.filter(r=>r.status==='fulfilled')).toHaveLength(1);
  expect(result.filter(r=>r.status==='rejected')).toHaveLength(1);
  expect((await admin`SELECT stock,reserved_stock FROM products WHERE id=${p}`)[0]).toEqual({stock:1,reserved_stock:1});
  expect((await admin`SELECT count(*)::int n FROM order_line_items WHERE product_id=${p}`)[0]!.n).toBe(1);
 });
 it('rolls the hold, counter and journal back with an abandoned checkout',async()=>{
  const p=await product(1),sub=await suborder();await expect(reserve(a,sub,p,true)).rejects.toThrow('intentional rollback');
  expect((await admin`SELECT stock,reserved_stock FROM products WHERE id=${p}`)[0]).toEqual({stock:1,reserved_stock:0});
  expect((await admin`SELECT count(*)::int n FROM inventory_movements WHERE product_id=${p} AND kind='reserve'`)[0]!.n).toBe(0);
  await expect(reserve(b,sub,p)).resolves.toBe(true);
 });
 it('places opposite-order multi-product carts without deadlocking',async()=>{
  const p=await product(4),q=await product(4),clock=new FixedClock(new Date('2026-11-08T00:00:00Z'));
  const draft=(ids:string[],ref:string)=>new PlaceOrder(clock).build({reference:ref,customerId:customer,
   contactPhone:'01012345678',contactName:'Buyer',address:Address.create({governorate:'cairo',city:'City',area:'Area',street:'Street',building:'1'}),
   lines:ids.map(id=>({productId:id,sellerId:seller,productName:'Perfume',brandName:'House',sku:id,volumeMl:50,quantity:1,unitPrice:Money.fromMinor(10000)})),
   shipping:[{sellerId:seller,amount:Money.zero(),etaDaysMin:2,etaDaysMax:4}],terms:[{sellerId:seller,confirmationSlaHours:24,dispatchSlaHours:48}],
   paymentMethod:'cod',touches:[],priorPurchaseSellerIds:new Set(),orderedAt:clock.now()});
  const ca=new DrizzleUnitOfWork(drizzle(a,{schema}) as unknown as DiyarDatabase,{role:'checkout',id:null});
  const cb=new DrizzleUnitOfWork(drizzle(b,{schema}) as unknown as DiyarDatabase,{role:'checkout',id:null});
  const map=new Map([[seller,seller]]);
  const results=await Promise.allSettled([ca.transaction(r=>r.orders.save(draft([p,q],'DY-REVERSE-A'),map)),cb.transaction(r=>r.orders.save(draft([q,p],'DY-REVERSE-B'),map))]);
  expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(2);
  const rows=await admin`SELECT reserved_stock FROM products WHERE id IN (${p},${q})`;
  expect(rows.map(r=>r.reserved_stock)).toEqual([2,2]);
 });
 it('applies simultaneous retries once through the real postgres-js adapter',async()=>{
  const p=await product(5),requestId=randomUUID();const actor={role:'seller' as const,id:owner,sellerId:seller};
  const uowA=new DrizzleUnitOfWork(drizzle(a,{schema}) as unknown as DiyarDatabase,actor);
  const uowB=new DrizzleUnitOfWork(drizzle(b,{schema}) as unknown as DiyarDatabase,actor);
  const input={productId:p,expectedOnHand:5,delta:2,reason:'restock' as const,requestId,occurredAt:new Date('2026-11-07T00:00:00Z')};
  const results=await Promise.all([uowA.transaction(r=>r.inventory.adjust(input)),uowB.transaction(r=>r.inventory.adjust(input))]);
  expect(results.every(r=>r.ok&&r.stock.onHand===7)).toBe(true);
  expect((await admin`SELECT count(*)::int n FROM inventory_movements WHERE request_id=${requestId}`)[0]!.n).toBe(1);
  expect(await uowA.transaction(r=>r.inventory.adjust({...input,delta:3}))).toEqual({ok:false,reason:'conflict'});
 });
});
