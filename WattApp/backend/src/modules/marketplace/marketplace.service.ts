import { createHash } from 'crypto';
import { PoolClient } from 'pg';
import { pool } from '../../db/pool';
import { AppError, badRequest, conflict, forbidden, notFound } from '../../lib/errors';

export async function transaction<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try { await c.query('BEGIN'); const result = await fn(c); await c.query('COMMIT'); return result; }
  catch (e) { await c.query('ROLLBACK'); throw e; }
  finally { c.release(); }
}
export async function admin(userId: string, c: Pick<PoolClient, 'query'> = pool) {
  const { rows } = await c.query(`select 1 from profiles where id=$1 and is_active=true and role::text in ('admin','superadmin')`, [userId]);
  if (!rows.length) throw forbidden();
}
export async function vendorAccess(userId: string, vendorId: string, c: Pick<PoolClient, 'query'> = pool) {
  const { rows } = await c.query(`select v.* from market_vendors v where v.id=$2 and
    (v.owner_id=$1 or exists(select 1 from market_vendor_users where vendor_id=v.id and user_id=$1)
     or exists(select 1 from profiles where id=$1 and is_active=true and role::text in ('admin','superadmin')))`, [userId,vendorId]);
  if (!rows.length) throw forbidden();
  return rows[0];
}
export async function event(c: Pick<PoolClient, 'query'>, actor: string, entity: string, action: string, detail: object = {}) {
  await c.query('insert into market_events(actor_id,entity_id,action,detail) values($1,$2,$3,$4)',[actor,entity,action,JSON.stringify(detail)]);
}
async function wallet(c: PoolClient, user: string, amount: number, reference: string, description: string) {
  const { rows } = await c.query('select wallet_balance, held_balance, is_active from profiles where id=$1 for update',[user]);
  if (!rows[0] || (amount>0&&!rows[0].is_active)) throw forbidden('Account is inactive');
  const available = Math.round((Number(rows[0].wallet_balance)-Number(rows[0].held_balance||0))*1000);
  if (amount>available) throw new AppError(402,'insufficient_balance',`INSUFFICIENT_BALANCE|required=${(amount/1000).toFixed(3)}|available=${(available/1000).toFixed(3)}|shortfall=${((amount-available)/1000).toFixed(3)}`);
  const result = await c.query('update profiles set wallet_balance=wallet_balance-$2::numeric/1000 where id=$1 returning wallet_balance',[user,amount]);
  if(Math.round(Number(result.rows[0].wallet_balance)*1000)!==Math.round(Number(rows[0].wallet_balance)*1000)-amount)
    throw conflict('Wallet update was rejected by the database');
  await c.query(`insert into wallet_transactions(user_id,type,amount,balance_after,description,reference_id)
    values($1,$2,$3,$4,$5,$6)`,[user,amount>0?'charge':'refund',-amount/1000,result.rows[0].wallet_balance,description,reference]);
}
export type Checkout = {
 request_key: string; expected_total: number; phone: string; address: string;
 lines: { variant_id: string; quantity: number; version: number; product_version: number }[];
 fulfilment: Record<string,'pickup'|'delivery'>;
};
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export async function checkout(user: string, input: Checkout) {
  return transaction(async c => {
    // Serialize checkout retries and cart changes for this buyer.
    await c.query('select pg_advisory_xact_lock(hashtextextended($1,0))',[user]);
    const lines = [...input.lines].sort((a,b)=>a.variant_id.localeCompare(b.variant_id));
    if (new Set(lines.map(x=>x.variant_id)).size!==lines.length) throw badRequest('Duplicate cart item');
    const fingerprint = hash({lines,phone:input.phone,address:input.address,total:input.expected_total,fulfilment:Object.entries(input.fulfilment).sort()});
    const old = (await c.query('select * from market_orders where user_id=$1 and request_key=$2',[user,input.request_key])).rows[0];
    if (old) { if (old.request_hash!==fingerprint) throw conflict('Checkout key already used for a different basket'); return old; }
    const { rows: items } = await c.query(`select v.*, p.vendor_id,p.kind,p.status,p.name as product_name,p.name_ar as product_name_ar,
      p.version as product_version,p.warranty,p.warranty_ar,p.return_days,p.image_url,p.updated_at,
      m.status as vendor_status,m.commission_bps,m.pickup_enabled,m.delivery_enabled,m.delivery_fee,m.address as pickup_address,m.delivery_area
      from market_variants v join market_products p on p.id=v.product_id join market_vendors m on m.id=p.vendor_id
      where v.id=any($1::uuid[]) order by v.id for update of v,p,m`,[lines.map(l=>l.variant_id)]);
    if(items.length!==lines.length) throw conflict('An item is no longer available');
    const groups = new Map<string,{method:string;fee:number;address:string}>();
    let total=0;
    for(const item of items) {
      const line=lines.find(l=>l.variant_id===item.id)!;
      if(item.kind!=='physical'||item.status!=='published'||item.vendor_status!=='approved'||item.commission_bps===null||Date.now()-Date.parse(item.updated_at)>30*864e5)
        throw conflict('An item is no longer available');
      if(item.version!==line.version||item.product_version!==line.product_version) throw conflict('Product details changed. Refresh your basket before paying.');
      if(item.stock<line.quantity) throw conflict('Not enough stock');
      const method=input.fulfilment[item.vendor_id];
      if(method==='pickup'&&!item.pickup_enabled) throw badRequest('Pickup is not available');
      if(method==='delivery'&&(!item.delivery_enabled||!item.delivery_area||!input.address.trim())) throw badRequest('Delivery is not available or the address is missing');
      if(!method) throw badRequest('Choose fulfilment for each vendor');
      groups.set(item.vendor_id,{method,fee:method==='delivery'?item.delivery_fee:0,address:item.pickup_address});
      total+=item.price*line.quantity;
    }
    total += [...groups.values()].reduce((n,g)=>n+g.fee,0);
    if(total!==input.expected_total) throw conflict('Total changed. Review your basket again.');
    const order=(await c.query(`insert into market_orders(user_id,request_key,request_hash,total,delivery_address,phone)
      values($1,$2,$3,$4,$5,$6) returning *`,[user,input.request_key,fingerprint,total,input.address,input.phone])).rows[0];
    await wallet(c,user,total,order.id,'Go Watt marketplace order');
    for(const [vendor,g] of groups) {
      const fulfilment=(await c.query(`insert into market_fulfilments(order_id,vendor_id,method,delivery_fee) values($1,$2,$3,$4) returning id`,[order.id,vendor,g.method,g.fee])).rows[0];
      for(const item of items.filter(i=>i.vendor_id===vendor)) {
        const line=lines.find(l=>l.variant_id===item.id)!;
        const snapshot={name:item.product_name,name_ar:item.product_name_ar,variant:item.name,variant_ar:item.name_ar,warranty:item.warranty,warranty_ar:item.warranty_ar,return_days:item.return_days,image_url:item.image_url,pickup_address:g.address};
        await c.query(`insert into market_order_items(order_id,fulfilment_id,variant_id,quantity,unit_price,commission_bps,snapshot)
          values($1,$2,$3,$4,$5,$6,$7)`,[order.id,fulfilment.id,item.id,line.quantity,item.price,item.commission_bps,JSON.stringify(snapshot)]);
        await c.query('update market_variants set stock=stock-$2,version=version+1 where id=$1',[item.id,line.quantity]);
        await c.query('delete from market_cart where user_id=$1 and variant_id=$2',[user,item.id]);
      }
    }
    await event(c,user,order.id,'order_paid',{total});
    return order;
  });
}
export async function refundItem(actor: string, returnId: string) {
  return transaction(async c=>{
    await admin(actor,c);
    const ret=(await c.query('select * from market_returns where id=$1',[returnId])).rows[0];
    if(!ret) throw notFound();
    const base=(await c.query('select order_id from market_order_items where id=$1',[ret.item_id])).rows[0];
    // Order lock serializes refunds of different items on the same order.
    await c.query('select id from market_orders where id=$1 for update',[base.order_id]);
    const item=(await c.query(`select i.*, f.vendor_id,f.status as fulfilment_status,f.delivery_fee,f.method,o.user_id
      from market_order_items i join market_fulfilments f on f.id=i.fulfilment_id join market_orders o on o.id=i.order_id
      where i.id=$1 for update of i,f`,[ret.item_id])).rows[0];
    const current=(await c.query('select * from market_returns where id=$1 for update',[returnId])).rows[0];
    if(current.status==='refunded') return {ok:true};
    if(current.status!=='approved') throw conflict('Approve the return after receiving the item');
    if((await c.query('select 1 from market_settlement_items where item_id=$1',[item.id])).rows.length) throw conflict('Vendor has been settled; reconcile the payout before refunding');
    if(item.refunded) throw conflict('Already refunded');
    let amount=item.quantity*item.unit_price;
    await c.query('update market_order_items set refunded=true where id=$1',[item.id]);
    const remaining=(await c.query('select count(*)::int as n from market_order_items where fulfilment_id=$1 and refunded=false',[item.fulfilment_id])).rows[0].n;
    if(remaining===0 && !['shipped','completed'].includes(item.fulfilment_status)) amount+=item.delivery_fee;
    await wallet(c,item.user_id,-amount,item.order_id,'Marketplace refund');
    // Returns are not automatically restocked: a vendor must inspect their condition.
    await c.query("update market_returns set status='refunded' where id=$1",[returnId]);
    await c.query(`update market_orders set refunded_total=refunded_total+$2,status=case when refunded_total+$2=total then 'refunded' else 'partially_refunded' end where id=$1`,[item.order_id,amount]);
    if(!remaining) await c.query("update market_fulfilments set status='cancelled' where id=$1",[item.fulfilment_id]);
    const appointment=(await c.query("update market_appointments set status='cancelled' where order_id=$1 and status in ('booked') returning slot_id",[item.order_id])).rows[0];
    if(appointment) await c.query('update market_slots set booked=booked-1 where id=$1',[appointment.slot_id]);
    await event(c,actor,item.order_id,'refund',{returnId,amount});
    return {ok:true};
  });
}
export async function bookAppointment(user:string, id:string, key:string, expectedPrice:number, version:number) {
  return transaction(async c=>{
    await c.query('select pg_advisory_xact_lock(hashtextextended($1,0))',[user]);
    const a=(await c.query('select * from market_appointments where id=$1 and user_id=$2 for update',[id,user])).rows[0];
    if(!a) throw notFound();
    if(a.order_id) return (await c.query('select * from market_orders where id=$1',[a.order_id])).rows[0];
    if(a.status!=='quoted'||a.quoted_price!==expectedPrice||a.quote_version!==version) throw conflict('Quote changed or is unavailable');
    const p=(await c.query(`select p.*,v.commission_bps,v.status as vendor_status from market_products p join market_vendors v on v.id=p.vendor_id where p.id=$1 for update of p,v`,[a.product_id])).rows[0];
    if(p.status!=='published'||p.vendor_status!=='approved'||p.commission_bps===null) throw conflict('Service is unavailable');
    const slot=(await c.query('select * from market_slots where id=$1 for update',[a.slot_id])).rows[0];
    if(Date.parse(slot.starts_at)<=Date.now()||slot.booked>=slot.capacity) throw conflict('Time slot is no longer available');
    const variant=(await c.query('select * from market_variants where product_id=$1 order by id limit 1',[p.id])).rows[0];
    const order=(await c.query(`insert into market_orders(user_id,request_key,request_hash,total,phone) values($1,$2,$3,$4,'') returning *`,[user,key,hash({appointment:id,version}),a.quoted_price])).rows[0];
    await wallet(c,user,a.quoted_price,order.id,'Go Watt service appointment');
    const f=(await c.query(`insert into market_fulfilments(order_id,vendor_id,method) values($1,$2,'appointment') returning id`,[order.id,p.vendor_id])).rows[0];
    await c.query(`insert into market_order_items(order_id,fulfilment_id,variant_id,quantity,unit_price,commission_bps,snapshot) values($1,$2,$3,1,$4,$5,$6)`,[order.id,f.id,variant.id,a.quoted_price,p.commission_bps,JSON.stringify({name:p.name,name_ar:p.name_ar,warranty:p.warranty,warranty_ar:p.warranty_ar,return_days:p.return_days,starts_at:slot.starts_at})]);
    await c.query('update market_slots set booked=booked+1 where id=$1',[slot.id]);
    await c.query("update market_appointments set status='booked',order_id=$2 where id=$1",[id,order.id]);
    await event(c,user,id,'appointment_paid',{order_id:order.id});
    return order;
  });
}
