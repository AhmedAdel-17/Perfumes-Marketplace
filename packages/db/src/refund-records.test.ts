import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyMigrations, MIGRATIONS_DIR } from './migrate';
import { copyFileSync, mkdtempSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
let pg:PGlite,seller:string,otherSeller:string,brand:string,customer:string,sequence=0;
const actor='99999999-9999-4999-8999-999999999999',owner='88888888-8888-4888-8888-888888888888',staff='77777777-7777-4777-8777-777777777777',otherOwner='66666666-6666-4666-8666-666666666666';
const insertId=async(q:string,v:unknown[]=[]) => (await pg.query<{id:string}>(q,v)).rows[0]!.id;
async function parcel(){
 const key=++sequence;
 const order=await insertId(`INSERT INTO orders(reference,customer_id,contact_phone,contact_name,governorate,city,area,street,building,source,merchandise_piastres,shipping_piastres,total_piastres,payment_method) VALUES($1,$2,'01012345678','Buyer','cairo','City','Area','Street','1','unknown',30000,5000,35000,'cod') RETURNING id`,['DY-REFUND-'+key,customer]);
 const sub=await insertId(`INSERT INTO sub_orders(order_id,seller_id,reference,merchandise_piastres,shipping_piastres,delivery_fulfilled_by,recipient_name,recipient_phone,governorate,city,area,street,building) VALUES($1,$2,$3,30000,5000,'seller','Buyer','01012345678','cairo','City','Area','Street','1') RETURNING id`,[order,seller,'DY-REFUND-'+key+'-A']);
 const lines:string[]=[];
 for(const [index,price] of [10000,20000].entries()){
  const sku='REFUND-'+key+'-'+index;
  const product=await insertId(`INSERT INTO products(seller_id,brand_id,name,slug,sku,price_piastres,volume_ml,stock) VALUES($1,$2,$3,$3,$3,$4,50,10) RETURNING id`,[seller,brand,sku,price]);
  lines.push(await insertId(`INSERT INTO order_line_items(sub_order_id,product_id,product_name,brand_name,sku,volume_ml,quantity,unit_price_piastres,line_piastres,commission_source,commission_bps,commission_rule_set_version,commission_piastres) VALUES($1,$2,$3,'Test',$3,50,1,$4,$4,'unknown',500,1,$5) RETURNING id`,[sub,product,sku,price,price/20]));
 }return{order,sub,lines};
}
const ask=(sub:string,line:string|null)=>insertId(`INSERT INTO returns(sub_order_id,line_item_id,reason,status,cost_bearer) VALUES($1,$2,'defective','requested','seller') RETURNING id`,[sub,line]);
async function received(id:string){for(const state of ['approved','in_transit','received'])await pg.query(`UPDATE returns SET status=$2::return_status WHERE id=$1`,[id,state]);}
const refund=(id:string,amount:number)=>pg.query(`UPDATE returns SET status='refunded',refund_piastres=$2,decided_by=$3,decided_at=now() WHERE id=$1`,[id,amount,actor]);
beforeAll(async()=>{
 pg=new PGlite();await applyMigrations(pg);await pg.exec(`SET app.actor_role='platform'; SET app.actor_id='${actor}';`);
 seller=await insertId(`INSERT INTO sellers(trading_name,owner_name,slug,status) VALUES('Refund house','Owner','refund-house','live') RETURNING id`);
 otherSeller=await insertId(`INSERT INTO sellers(trading_name,owner_name,slug,status) VALUES('Other house','Owner','other-refund-house','live') RETURNING id`);
 brand=await insertId(`INSERT INTO brands(seller_id,name,slug) VALUES($1,'Refund house','refund-house-brand') RETURNING id`,[seller]);
 customer=await insertId(`INSERT INTO customers(phone) VALUES('01012345678') RETURNING id`);
 await pg.query(`INSERT INTO seller_staff(seller_id,auth_user_id,role,full_name) VALUES($1,$2,'owner','Owner'),($1,$3,'fulfilment','Staff'),($4,$5,'owner','Other owner')`,[seller,owner,staff,otherSeller,otherOwner]);
},120000);
afterAll(async()=>{await pg?.close();});
describe('immutable refund recording',()=>{
 it('records an immutable fact, preserves it after close and changes no payouts',async()=>{
  const{sub,lines}=await parcel();const id=await ask(sub,lines[0]!);await received(id);await refund(id,12000);
  expect((await pg.query(`SELECT amount_piastres,source FROM return_refund_records WHERE return_id=$1`,[id])).rows).toEqual([{amount_piastres:12000,source:'recorded'}]);
  await pg.query(`UPDATE returns SET status='closed' WHERE id=$1`,[id]);
  await expect(refund(id,13000)).rejects.toThrow();
  await expect(pg.query(`UPDATE return_refund_records SET amount_piastres=1 WHERE return_id=$1`,[id])).rejects.toThrow();
  await expect(pg.query(`DELETE FROM return_refund_records WHERE return_id=$1`,[id])).rejects.toThrow();
  expect((await pg.query(`SELECT amount_piastres FROM return_refund_records WHERE return_id=$1`,[id])).rows).toEqual([{amount_piastres:12000}]);
  expect((await pg.query(`SELECT count(*)::int n FROM payout_lines WHERE sub_order_id=$1`,[sub])).rows).toEqual([{n:0}]);
 });
 it('allows partial monetary amounts including shipping but caps purchased value',async()=>{
  const{sub,lines}=await parcel();const first=await ask(sub,lines[0]!),second=await ask(sub,lines[1]!);await received(first);await received(second);
  await expect(refund(first,15001)).rejects.toThrow();await refund(first,15000);
  await expect(refund(second,20001)).rejects.toThrow();await refund(second,20000);
  expect((await pg.query(`SELECT sum(amount_piastres)::int total FROM return_refund_records WHERE sub_order_id=$1`,[sub])).rows).toEqual([{total:35000}]);
 });
 it('caps sibling sellers at the original discounted order total without allocating the discount',async()=>{
  const first=await parcel();
  await pg.query(`UPDATE orders SET merchandise_piastres=50000,discount_piastres=10000,total_piastres=45000 WHERE id=$1`,[first.order]);
  const otherBrand=await insertId(`INSERT INTO brands(seller_id,name,slug) VALUES($1,'Discount second','discount-second-brand') RETURNING id`,[otherSeller]);
  const otherProduct=await insertId(`INSERT INTO products(seller_id,brand_id,name,slug,sku,price_piastres,volume_ml,stock) VALUES($1,$2,'Second','discount-second','DISCOUNT-SECOND',20000,50,10) RETURNING id`,[otherSeller,otherBrand]);
  const secondSub=await insertId(`INSERT INTO sub_orders(order_id,seller_id,reference,merchandise_piastres,shipping_piastres,delivery_fulfilled_by,recipient_name,recipient_phone,governorate,city,area,street,building) VALUES($1,$2,'DY-DISCOUNT-SECOND',20000,0,'seller','Buyer','01012345678','cairo','City','Area','Street','1') RETURNING id`,[first.order,otherSeller]);
  const secondLine=await insertId(`INSERT INTO order_line_items(sub_order_id,product_id,product_name,brand_name,sku,volume_ml,quantity,unit_price_piastres,line_piastres,commission_source,commission_bps,commission_rule_set_version,commission_piastres) VALUES($1,$2,'Second','Second','DISCOUNT-SECOND',50,1,20000,20000,'unknown',500,1,1000) RETURNING id`,[secondSub,otherProduct]);
  const whole=await ask(first.sub,null),second=await ask(secondSub,secondLine);await received(whole);await received(second);await refund(whole,35000);
  await expect(refund(second,20000)).rejects.toThrow(/discounted order total/);
  expect((await pg.query(`SELECT status,refund_piastres FROM returns WHERE id=$1`,[second])).rows).toEqual([{status:'received',refund_piastres:null}]);
  await refund(second,10000);
  expect((await pg.query(`SELECT sum(f.amount_piastres)::int total FROM return_refund_records f JOIN sub_orders s ON s.id=f.sub_order_id WHERE s.order_id=$1`,[first.order])).rows).toEqual([{total:45000}]);
 });
 it('rejects overlapping whole-parcel and line claims in both directions',async()=>{
  const first=await parcel();await ask(first.sub,null);await expect(ask(first.sub,first.lines[0]!)).rejects.toThrow();
  const second=await parcel();await ask(second.sub,second.lines[0]!);await expect(ask(second.sub,null)).rejects.toThrow();await expect(ask(second.sub,second.lines[0]!)).rejects.toThrow();await ask(second.sub,second.lines[1]!);
 });
 it('requires received/platform status and refuses inserted refund facts',async()=>{
  const{sub,lines}=await parcel();const id=await ask(sub,lines[0]!);await expect(refund(id,500)).rejects.toThrow();
  await expect(pg.query(`INSERT INTO returns(sub_order_id,line_item_id,status,reason,refund_piastres) VALUES($1,$2,'refunded','defective',500)`,[sub,lines[1]!])).rejects.toThrow();await received(id);
  await pg.exec(`SET app.actor_role='seller'; SET app.actor_id='${owner}'; SET ROLE app_user;`);
  try{await expect(refund(id,500)).rejects.toThrow();}finally{await pg.exec(`RESET ROLE; SET app.actor_role='platform'; SET app.actor_id='${actor}';`);}
  expect((await pg.query(`SELECT count(*)::int n FROM return_refund_records WHERE return_id=$1`,[id])).rows).toEqual([{n:0}]);
 });
 it('exposes records only to platform or the matching seller owner',async()=>{
  const{sub,lines}=await parcel();const id=await ask(sub,lines[0]!);await received(id);await refund(id,1000);
  for(const[role,user,expected]of [['seller',owner,1],['seller',staff,0],['seller',otherOwner,0],['anon','',0],['aftercare','',0]] as const){
   await pg.query(`SELECT set_config('app.actor_role',$1,false),set_config('app.actor_id',$2,false)`,[role,user]);await pg.exec('SET ROLE app_user');
   try{expect((await pg.query(`SELECT count(*)::int n FROM return_refund_records WHERE return_id=$1`,[id])).rows).toEqual([{n:expected}]);}finally{await pg.exec(`RESET ROLE; SET app.actor_role='platform'; SET app.actor_id='${actor}';`);}
  }
 });
 it('imports an existing refund unchanged, even above the new ceiling',async()=>{
  // Copy only SQL into an isolated fixture directory: this never migrates a
  // project or staging database, and preserves the historical observation.
  const dir=mkdtempSync(join(tmpdir(),'diyar-refund-baseline-'));
  for(const file of readdirSync(MIGRATIONS_DIR).filter(file=>file.endsWith('.sql')&&file<'0044_'))copyFileSync(join(MIGRATIONS_DIR,file),join(dir,file));
  const original=pg; const priorSeller=seller,priorBrand=brand,priorCustomer=customer;
  const legacy=new PGlite();
  try{
   await applyMigrations(legacy,{dir}); pg=legacy;
   await pg.exec(`SET app.actor_role='platform'; SET app.actor_id='${actor}';`);
   seller=await insertId(`INSERT INTO sellers(trading_name,owner_name,slug,status) VALUES('Legacy','Owner','legacy-refund','live') RETURNING id`);
   brand=await insertId(`INSERT INTO brands(seller_id,name,slug) VALUES($1,'Legacy','legacy-refund-brand') RETURNING id`,[seller]);
   customer=await insertId(`INSERT INTO customers(phone) VALUES('01012345678') RETURNING id`);
   const{sub,lines}=await parcel(); const id=await ask(sub,lines[0]!); await received(id); await refund(id,40000);
   const before=(await pg.query(`SELECT refund_piastres,decided_at FROM returns WHERE id=$1`,[id])).rows;
   copyFileSync(join(MIGRATIONS_DIR,'0044_return_refund_records.sql'),join(dir,'0044_return_refund_records.sql'));
   await applyMigrations(pg,{dir});
   expect((await pg.query(`SELECT refund_piastres,decided_at FROM returns WHERE id=$1`,[id])).rows).toEqual(before);
   expect((await pg.query(`SELECT amount_piastres,source FROM return_refund_records WHERE return_id=$1`,[id])).rows).toEqual([{amount_piastres:40000,source:'historical_import'}]);
  }finally{pg=original;seller=priorSeller;brand=priorBrand;customer=priorCustomer;await legacy.close();}
 },60000);

});
