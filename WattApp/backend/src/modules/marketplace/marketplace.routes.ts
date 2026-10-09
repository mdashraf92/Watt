import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../../db/pool';
import { asyncHandler } from '../../middleware/error';
import { requireAuth } from '../../middleware/auth';
import { badRequest, conflict, notFound } from '../../lib/errors';
import * as svc from './marketplace.service';
import * as tell from './marketplace.notify';

const router=Router();
const uuid=z.string().uuid();
const text=z.string().trim().min(1).max(2000);
const money=z.number().int().min(1).max(10000000);
const key=z.string().min(16).max(120);
const productBody=z.object({
 category_id:text,kind:z.enum(['physical','service']),name:text,name_ar:text,description:text,description_ar:text,
 image_url:z.string().url().refine(v=>v.startsWith('https://'),'Use an HTTPS image'),
 images:z.array(z.string().url().refine(v=>v.startsWith('https://'),'Use HTTPS images')).max(6).default([]),
 warranty:text,warranty_ar:text,return_days:z.number().int().min(0).max(365),
 compatibility:z.array(z.object({make:text,model:text,year_from:z.number().int().min(1990).max(2100),year_to:z.number().int().min(1990).max(2100)}).refine(v=>v.year_to>=v.year_from)).max(100).default([]),
 specifications:z.record(z.string().max(100),z.string().max(500)).default({}),
 duration_minutes:z.number().int().min(15).max(1440).nullable().default(null),
 service_location:z.enum(['at_centre','mobile']).default('at_centre'),price_basis:z.enum(['fixed','quote']).default('fixed'),
 variants:z.array(z.object({id:uuid.optional(),sku:z.string().trim().min(1).max(80),name:text,name_ar:text,price:money,stock:z.number().int().min(0).max(1000000)})).min(1).max(50),
 version:z.number().int().optional(),
});
function parse<S extends z.ZodTypeAny>(schema:S, value:unknown):z.output<S> {
 const result=schema.safeParse(value); if(!result.success) throw badRequest(result.error.issues[0]?.message||'Invalid input'); return result.data;
}
const id=(value:unknown)=>parse(uuid,value);
const query=(sql:string,params:unknown[]=[])=>pool.query(sql,params).then(r=>r.rows);
const published=`p.status='published' and m.status='approved' and m.commission_bps is not null and p.updated_at > now()-interval '30 days'`;

router.get('/catalog',asyncHandler(async(req,res)=>{
 const q=parse(z.object({q:z.string().max(100).default(''),category:z.string().max(100).default(''),kind:z.enum(['physical','service']).default('physical'),offset:z.coerce.number().int().min(0).max(10000).default(0),sort:z.enum(['newest','price_asc','price_desc']).default('newest'),make:z.string().max(100).default(''),model:z.string().max(100).default(''),year:z.coerce.number().int().min(1990).max(2100).optional()}),req.query);
 const rows=await query(`select p.*,m.name as vendor_name,m.name_ar as vendor_name_ar,
   (select min(price) from market_variants where product_id=p.id) as price,
   (select coalesce(sum(stock),0) from market_variants where product_id=p.id) as stock
   from market_products p join market_vendors m on m.id=p.vendor_id where ${published}
   and p.kind=$1 and ($2='' or p.category_id=$2) and ($3='' or p.name ilike '%'||$3||'%' or p.name_ar ilike '%'||$3||'%')
   and ($5='' or exists(select 1 from jsonb_array_elements(p.compatibility) c where lower(c->>'make')=lower($5) and lower(c->>'model')=lower($6) and $7 between (c->>'year_from')::int and (c->>'year_to')::int))
   order by ${q.sort==='price_asc'?'price asc':q.sort==='price_desc'?'price desc':'p.created_at desc'},p.id limit 30 offset $4`,[q.kind,q.category,q.q,q.offset,q.make,q.model,q.year||2026]);
 res.json(rows);
}));
// Categories carry a kind so the Products and Services tabs each show only their own.
router.get('/categories',asyncHandler(async(req,res)=>{
 const kind=parse(z.enum(['physical','service']).optional(),req.query.kind||undefined);
 res.json(await query('select * from market_categories where ($1::text is null or kind=$1) order by kind,sort_order,id',[kind??null]));
}));
router.get('/products/:id',asyncHandler(async(req,res)=>{
 const rows=await query(`select p.*,m.name as vendor_name,m.name_ar as vendor_name_ar,m.address as pickup_address,m.pickup_enabled,
   m.delivery_enabled,m.delivery_fee,m.delivery_area from market_products p join market_vendors m on m.id=p.vendor_id where p.id=$1 and ${published}`,[id(req.params.id)]);
 if(!rows[0])throw notFound();
 res.json({...rows[0],variants:await query('select * from market_variants where product_id=$1 order by price,id',[req.params.id]),
 slots:await query('select * from market_slots where product_id=$1 and starts_at>now() and booked<capacity order by starts_at limit 100',[req.params.id]),
 reviews:await query('select rating,comment,created_at from market_reviews where product_id=$1 order by created_at desc limit 50',[req.params.id])});
}));
router.use(requireAuth,asyncHandler(async(req,_res,next)=>{
 if(!(await query('select 1 from profiles where id=$1 and is_active=true',[req.user!.id])).length)throw new (require('../../lib/errors').AppError)(403,'inactive','Account inactive');
 next();
}));
router.get('/vehicles',asyncHandler(async(req,res)=>{res.json(await query('select * from market_vehicles where user_id=$1 order by created_at',[req.user!.id]));}));
router.post('/vehicles',asyncHandler(async(req,res)=>{
 const b=parse(z.object({make:text,model:text,year:z.number().int().min(1990).max(2100),connector:z.enum(['Type2','CCS','CHAdeMO','GBT','Tesla','Other'])}),req.body);
 res.status(201).json((await query('insert into market_vehicles(user_id,make,model,year,connector) values($1,$2,$3,$4,$5) returning *',[req.user!.id,b.make,b.model,b.year,b.connector]))[0]);
}));
router.delete('/vehicles/:id',asyncHandler(async(req,res)=>{
 if((await query('select 1 from market_appointments where vehicle_id=$1',[id(req.params.id)])).length)throw conflict('This vehicle has service history and must be retained');
 await query('delete from market_vehicles where id=$1 and user_id=$2',[req.params.id,req.user!.id]);res.json({ok:true});
}));
router.get('/cart',asyncHandler(async(req,res)=>{
 res.json(await query(`select c.quantity,v.*,p.name as product_name,p.name_ar as product_name_ar,p.image_url,p.version as product_version,
 p.vendor_id,p.status,p.updated_at,m.name as vendor_name,m.name_ar as vendor_name_ar,m.status as vendor_status,
 m.pickup_enabled,m.delivery_enabled,m.delivery_fee,m.delivery_area,m.address as pickup_address
 from market_cart c join market_variants v on v.id=c.variant_id join market_products p on p.id=v.product_id
 join market_vendors m on m.id=p.vendor_id where c.user_id=$1 order by p.vendor_id,v.id`,[req.user!.id]));
}));
router.put('/cart/:id',asyncHandler(async(req,res)=>{
 const b=parse(z.object({quantity:z.number().int().min(0).max(99)}),req.body);const variant=id(req.params.id);
 await svc.transaction(async c=>{
  await c.query('select pg_advisory_xact_lock(hashtextextended($1,0))',[req.user!.id]);
  if(!b.quantity){await c.query('delete from market_cart where user_id=$1 and variant_id=$2',[req.user!.id,variant]);return;}
  const p=(await c.query(`select v.stock from market_variants v join market_products p on p.id=v.product_id join market_vendors m on m.id=p.vendor_id where v.id=$1 and p.kind='physical' and ${published}`,[variant])).rows[0];
  if(!p||p.stock<b.quantity)throw conflict('Item is unavailable or has insufficient stock');
  await c.query(`insert into market_cart(user_id,variant_id,quantity) values($1,$2,$3) on conflict(user_id,variant_id) do update set quantity=excluded.quantity`,[req.user!.id,variant,b.quantity]);
 });res.json({ok:true});
}));
router.post('/checkout',asyncHandler(async(req,res)=>{
 const b=parse(z.object({request_key:key,expected_total:money,phone:z.string().trim().min(6).max(30),address:z.string().max(1000).default(''),
 lines:z.array(z.object({variant_id:uuid,quantity:z.number().int().min(1).max(99),version:z.number().int(),product_version:z.number().int()})).min(1).max(100),
 fulfilment:z.record(z.enum(['pickup','delivery']))}),req.body);
 res.json(await svc.checkout(req.user!.id,b));
}));
router.get('/orders',asyncHandler(async(req,res)=>{res.json(await query('select * from market_orders where user_id=$1 order by created_at desc limit 100',[req.user!.id]));}));
router.get('/orders/:id',asyncHandler(async(req,res)=>{
 const order=(await query('select * from market_orders where id=$1 and user_id=$2',[id(req.params.id),req.user!.id]))[0];if(!order)throw notFound();
 res.json({...order,fulfilments:await query(`select f.*,v.name as vendor_name,v.name_ar as vendor_name_ar from market_fulfilments f join market_vendors v on v.id=f.vendor_id where order_id=$1`,[order.id]),
 items:await query(`select i.*,v.product_id,r.id as return_id,r.status as return_status,r.resolution from market_order_items i join market_variants v on v.id=i.variant_id left join market_returns r on r.item_id=i.id where i.order_id=$1`,[order.id]),
 events:await query('select action,created_at from market_events where entity_id=$1 order by created_at',[order.id])});
}));
router.post('/returns',asyncHandler(async(req,res)=>{
 const b=parse(z.object({item_id:uuid,reason:text}),req.body);
 const item=(await query(`select i.*,o.user_id,f.status as fulfilment_status,f.completed_at from market_order_items i join market_orders o on o.id=i.order_id join market_fulfilments f on f.id=i.fulfilment_id where i.id=$1 and o.user_id=$2`,[b.item_id,req.user!.id]))[0];
 if(!item)throw notFound();if(item.refunded)throw conflict('Already refunded');
 if(item.completed_at&&Date.now()-Date.parse(item.completed_at)>Number(item.snapshot.return_days)*864e5)throw badRequest('Return window has ended. Contact support for warranty assistance.');
 res.json((await query(`insert into market_returns(item_id,user_id,reason) values($1,$2,$3) on conflict(item_id) do update set reason=market_returns.reason returning *`,[b.item_id,req.user!.id,b.reason]))[0]);
}));
router.post('/reviews',asyncHandler(async(req,res)=>{
 const b=parse(z.object({product_id:uuid,rating:z.number().int().min(1).max(5),comment:z.string().trim().min(1).max(1000)}),req.body);
 if(!(await query(`select 1 from market_order_items i join market_orders o on o.id=i.order_id join market_variants v on v.id=i.variant_id join market_fulfilments f on f.id=i.fulfilment_id where o.user_id=$1 and v.product_id=$2 and f.status='completed' and not i.refunded`,[req.user!.id,b.product_id])).length)throw badRequest('Reviews require a completed purchase');
 res.json((await query(`insert into market_reviews(user_id,product_id,rating,comment) values($1,$2,$3,$4) on conflict(user_id,product_id) do update set rating=excluded.rating,comment=excluded.comment returning *`,[req.user!.id,b.product_id,b.rating,b.comment]))[0]);
}));
router.get('/appointments',asyncHandler(async(req,res)=>{res.json(await query(`select a.*,p.name,p.name_ar,s.starts_at from market_appointments a join market_products p on p.id=a.product_id join market_slots s on s.id=a.slot_id where a.user_id=$1 order by a.created_at desc limit 100`,[req.user!.id]));}));
router.post('/appointments',asyncHandler(async(req,res)=>{
 const b=parse(z.object({product_id:uuid,vehicle_id:uuid,slot_id:uuid,request_key:key,customer_notes:z.string().max(2000).default('')}),req.body);
 res.json(await svc.transaction(async c=>{
  await c.query('select pg_advisory_xact_lock(hashtextextended($1,0))',[req.user!.id]);
  const old=(await c.query('select * from market_appointments where user_id=$1 and request_key=$2',[req.user!.id,b.request_key])).rows[0];
  if(old){if(old.product_id!==b.product_id||old.vehicle_id!==b.vehicle_id||old.slot_id!==b.slot_id)throw conflict('Request key was already used');return old;}
  const p=(await c.query(`select p.*, (select min(price) from market_variants where product_id=p.id) as price from market_products p join market_vendors m on m.id=p.vendor_id where p.id=$1 and p.kind='service' and ${published}`,[b.product_id])).rows[0];
  if(!p)throw notFound();
  if(!(await c.query('select 1 from market_vehicles where id=$1 and user_id=$2',[b.vehicle_id,req.user!.id])).rows.length)throw notFound('Vehicle not found');
  if(!(await c.query('select 1 from market_slots where id=$1 and product_id=$2 and starts_at>now() and booked<capacity',[b.slot_id,b.product_id])).rows.length)throw conflict('Time slot is unavailable');
  return (await c.query(`insert into market_appointments(user_id,product_id,vehicle_id,slot_id,request_key,customer_notes,status,quoted_price)
    values($1,$2,$3,$4,$5,$6,$7,$8) returning *`,[req.user!.id,b.product_id,b.vehicle_id,b.slot_id,b.request_key,b.customer_notes,p.price_basis==='fixed'?'quoted':'requested',p.price_basis==='fixed'?p.price:null])).rows[0];
 }));
}));
router.post('/appointments/:id/pay',asyncHandler(async(req,res)=>{
 const b=parse(z.object({request_key:key,expected_price:money,quote_version:z.number().int()}),req.body);
 res.json(await svc.bookAppointment(req.user!.id,id(req.params.id),b.request_key,b.expected_price,b.quote_version));
}));
router.post('/appointments/:id/cancel',asyncHandler(async(req,res)=>{
 const rows=await query(`update market_appointments set status='cancelled' where id=$1 and user_id=$2 and status in ('requested','quoted') returning id`,[id(req.params.id),req.user!.id]);
 if(!rows.length)throw conflict('Paid appointments require a refund request from your order');res.json({ok:true});
}));

// Vendor portal. Membership is separate from a customer's global profile role.
router.get('/portal',asyncHandler(async(req,res)=>{
 const vendors=await query(`select * from market_vendors v where owner_id=$1 or exists(select 1 from market_vendor_users where vendor_id=v.id and user_id=$1)`,[req.user!.id]);
 res.json({vendors,is_admin:!!(await query("select 1 from profiles where id=$1 and role::text in ('admin','superadmin')",[req.user!.id])).length});
}));
// Seller application. seller_type decides what they may list: a shop sells
// products, a service provider offers bookable services, 'both' does either.
const optionalText=z.string().trim().max(2000).default('');
const httpsUrl=z.string().url().refine(v=>v.startsWith('https://'),'Use an HTTPS image').nullable().default(null);
const sellerProfile={contact_phone:text,email:z.string().trim().email().or(z.literal('')).default(''),address:text,
 about:optionalText,about_ar:optionalText,logo_url:httpsUrl,bank_details:text};
router.post('/vendors',asyncHandler(async(req,res)=>{
 const b=parse(z.object({seller_type:z.enum(['shop','service','both']).default('both'),name:text,name_ar:text,cr_number:text,...sellerProfile}),req.body);
 try {
  const vendor=(await query(`insert into market_vendors(owner_id,seller_type,name,name_ar,cr_number,contact_phone,email,address,about,about_ar,logo_url,bank_details)
   values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning *`,
   [req.user!.id,b.seller_type,b.name,b.name_ar,b.cr_number,b.contact_phone,b.email,b.address,b.about,b.about_ar,b.logo_url,b.bank_details]))[0];
  void tell.sellerApplied(vendor);
  res.status(201).json(vendor);
 } catch(e:any) { if(e.code==='23505')throw conflict('You already have a seller account'); throw e; }
}));
// Owner edits the business profile. Name, CR number and seller type are what
// Go Watt approved, so only an admin changes those (admin PATCH below).
router.patch('/vendors/:id',asyncHandler(async(req,res)=>{
 const vendor=await svc.vendorAccess(req.user!.id,id(req.params.id));
 if(vendor.owner_id!==req.user!.id)await svc.admin(req.user!.id);
 const b=parse(z.object(sellerProfile),req.body);
 res.json((await query(`update market_vendors set contact_phone=$2,email=$3,address=$4,about=$5,about_ar=$6,logo_url=$7,bank_details=$8 where id=$1 returning *`,
  [vendor.id,b.contact_phone,b.email,b.address,b.about,b.about_ar,b.logo_url,b.bank_details]))[0]);
}));
router.get('/vendors/:id/dashboard',asyncHandler(async(req,res)=>{
 const v=await svc.vendorAccess(req.user!.id,id(req.params.id));
 res.json({vendor:v,products:await query('select p.*,(select json_agg(v) from market_variants v where product_id=p.id) as variants from market_products p where vendor_id=$1 order by created_at desc',[v.id]),
 fulfilments:await query(`select f.*,o.phone,o.delivery_address,o.created_at,(select json_agg(i) from market_order_items i where fulfilment_id=f.id) as items from market_fulfilments f join market_orders o on o.id=f.order_id where f.vendor_id=$1 order by o.created_at desc limit 100`,[v.id]),
 appointments:await query(`select a.*,p.name,p.name_ar,s.starts_at,v.make,v.model,v.year,customer.full_name as customer_name,customer.phone as customer_phone from market_appointments a join market_products p on p.id=a.product_id join market_slots s on s.id=a.slot_id join market_vehicles v on v.id=a.vehicle_id join profiles customer on customer.id=a.user_id where p.vendor_id=$1 order by a.created_at desc limit 100`,[v.id]),
 settlements:await query('select * from market_settlements where vendor_id=$1 order by created_at desc',[v.id]),
 returns:await query(`select r.*,i.snapshot from market_returns r join market_order_items i on i.id=r.item_id join market_fulfilments f on f.id=i.fulfilment_id where f.vendor_id=$1 order by r.created_at desc`,[v.id])});
}));
router.get('/vendors/:id/finance',asyncHandler(async(req,res)=>{
 const vendor=await svc.vendorAccess(req.user!.id,id(req.params.id));
 const [summary]=(await query(`with outstanding as (
  select i.quantity*i.unit_price-round(i.quantity*i.unit_price*i.commission_bps::numeric/10000) as net,
   f.status='completed' and f.completed_at+((i.snapshot->>'return_days')::int*interval '1 day')<now()
   and not exists(select 1 from market_returns r where r.item_id=i.id and r.status<>'rejected') as eligible
  from market_order_items i join market_fulfilments f on f.id=i.fulfilment_id
  where f.vendor_id=$1 and not i.refunded and f.status<>'cancelled'
  and not exists(select 1 from market_settlement_items s where s.item_id=i.id)
 ) select coalesce(sum(net) filter(where eligible),0)::bigint as eligible_baisa,
 coalesce(sum(net) filter(where not eligible),0)::bigint as pending_baisa,
 (select coalesce(sum(amount),0)::bigint from market_settlements where vendor_id=$1) as paid_baisa from outstanding`,[vendor.id]));
 res.json(summary);
}));
router.post('/vendors/:id/stock',asyncHandler(async(req,res)=>{
 const b=parse(z.object({variants:z.array(z.object({id:uuid,version:z.number().int().positive(),stock:z.number().int().min(0).max(1000000)})).min(1).max(100)}),req.body);
 if(new Set(b.variants.map(v=>v.id)).size!==b.variants.length)throw badRequest('Duplicate variant');
 await svc.transaction(async c=>{
  const vendor=await svc.vendorAccess(req.user!.id,id(req.params.id),c);
  const products=(await c.query('select distinct product_id from market_variants where id=any($1::uuid[]) order by product_id',[b.variants.map(v=>v.id)])).rows;
  // Match checkout's product-before-variant lock order to avoid deadlocks.
  await c.query('select id from market_products where id=any($1::uuid[]) order by id for update',[products.map(p=>p.product_id)]);
  for(const v of [...b.variants].sort((a,b)=>a.id.localeCompare(b.id))){
   const updated=await c.query(`update market_variants v set stock=$2,version=v.version+1 from market_products p where v.id=$1 and v.product_id=p.id and p.vendor_id=$3 and p.kind='physical' and v.version=$4 returning v.product_id`,[v.id,v.stock,vendor.id,v.version]);
   if(!updated.rows.length)throw conflict('Stock changed or variant is unavailable. Refresh before retrying.');
  }
  await c.query('update market_products set updated_at=now() where id=any($1::uuid[])',[products.map(p=>p.product_id)]);
  await svc.event(c,req.user!.id,vendor.id,'bulk_stock_updated',{variants:b.variants.length});
 });res.json({ok:true});
}));
router.post('/vendors/:id/members',asyncHandler(async(req,res)=>{
 const vendor=await svc.vendorAccess(req.user!.id,id(req.params.id));
 if(vendor.owner_id!==req.user!.id)await svc.admin(req.user!.id);
 const b=parse(z.object({email:z.string().email(),remove:z.boolean().default(false)}),req.body);
 const user=(await query('select id from auth.users where lower(email)=lower($1)',[b.email]))[0];if(!user)throw notFound('Account not found');
 if(b.remove)await query('delete from market_vendor_users where vendor_id=$1 and user_id=$2',[vendor.id,user.id]);
 else await query('insert into market_vendor_users values($1,$2) on conflict do nothing',[vendor.id,user.id]);res.json({ok:true});
}));
router.post('/vendors/:id/products',asyncHandler(async(req,res)=>{
 const vendor=await svc.vendorAccess(req.user!.id,id(req.params.id));const b=parse(productBody,req.body);
 const product=await saveProduct(req.user!.id,vendor.id,b);void tell.listingsSubmitted(vendor.id,[product.name]);
 res.status(201).json(product);
}));
router.post('/vendors/:id/import',asyncHandler(async(req,res)=>{
 const vendor=await svc.vendorAccess(req.user!.id,id(req.params.id));
 const rows=parse(z.array(productBody).min(1).max(100),req.body);
 const results=[];
 const names:string[]=[];
 for(let index=0;index<rows.length;index++) {
  try {const product=await saveProduct(req.user!.id,vendor.id,rows[index]);names.push(product.name);results.push({row:index+1,id:product.id,status:'submitted'});}
  catch(e:any) {results.push({row:index+1,status:'failed',message:e.code==='23505'?'SKU already exists':e.message});}
 }
 void tell.listingsSubmitted(vendor.id,names);
 res.json(results);
}));
router.put('/products/:id',asyncHandler(async(req,res)=>{
 const p=(await query('select vendor_id from market_products where id=$1',[id(req.params.id)]))[0];if(!p)throw notFound();
 await svc.vendorAccess(req.user!.id,p.vendor_id);const product=await saveProduct(req.user!.id,p.vendor_id,parse(productBody,req.body),req.params.id);
 void tell.listingsSubmitted(p.vendor_id,[product.name]);res.json(product);
}));
async function saveProduct(actor:string,vendor:string,b:z.infer<typeof productBody>,productId?:string) {
 return svc.transaction(async c=>{
  const seller=await svc.vendorAccess(actor,vendor,c);
  if(b.kind==='service'&&!b.duration_minutes)throw badRequest('Service duration is required');
  if(seller.seller_type==='shop'&&b.kind!=='physical')throw badRequest('Shops can list products only. Ask Go Watt to change your seller type to add services.');
  if(seller.seller_type==='service'&&b.kind!=='service')throw badRequest('Service providers can list services only. Ask Go Watt to change your seller type to sell products.');
  const category=(await c.query('select kind from market_categories where id=$1',[b.category_id])).rows[0];
  if(!category)throw badRequest('Choose a valid category');
  if(category.kind!==b.kind)throw badRequest(b.kind==='service'?'Choose a service category':'Choose a product category');
  if(productId) {
   const p=(await c.query('select * from market_products where id=$1 for update',[productId])).rows[0];
   if(p.version!==b.version)throw conflict('Listing changed. Reload before editing.');
   if(p.kind!==b.kind)throw conflict('A listing cannot change between a product and a service');
  }
  const values=[vendor,b.category_id,b.kind,b.name,b.name_ar,b.description,b.description_ar,b.image_url,b.warranty,b.warranty_ar,b.return_days,JSON.stringify(b.compatibility),JSON.stringify(b.specifications),b.duration_minutes,b.service_location,b.price_basis];
  let p;
  if(!productId)p=(await c.query(`insert into market_products(vendor_id,category_id,kind,name,name_ar,description,description_ar,image_url,warranty,warranty_ar,return_days,compatibility,specifications,duration_minutes,service_location,price_basis,status)
    values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'pending') returning *`,values)).rows[0];
  else p=(await c.query(`update market_products set category_id=$2,name=$4,name_ar=$5,description=$6,description_ar=$7,image_url=$8,warranty=$9,warranty_ar=$10,return_days=$11,compatibility=$12,specifications=$13,duration_minutes=$14,service_location=$15,price_basis=$16,status='pending',version=version+1,updated_at=now() where id=$17 and vendor_id=$1 and kind=$3 returning *`,[...values,productId])).rows[0];
  const existing=(await c.query('select id from market_variants where product_id=$1',[p.id])).rows;
  await c.query('update market_products set images=$2 where id=$1',[p.id,JSON.stringify(b.images)]);
  if(existing.some(v=>!b.variants.some(x=>x.id===v.id)))throw badRequest('Keep existing variants; set their stock to zero to stop sales');
  for(const v of b.variants) {
   if(v.id) {const updated=await c.query('update market_variants set sku=$2,name=$3,name_ar=$4,price=$5,stock=$6,version=version+1 where id=$1 and product_id=$7 returning id',[v.id,v.sku,v.name,v.name_ar,v.price,v.stock,p.id]);if(!updated.rows.length)throw badRequest('Variant does not belong to this product');}
   else await c.query('insert into market_variants(product_id,sku,name,name_ar,price,stock) values($1,$2,$3,$4,$5,$6)',[p.id,v.sku,v.name,v.name_ar,v.price,v.stock]);
  }
  await svc.event(c,actor,p.id,'submitted_for_review');return p;
 });
}
router.post('/products/:id/stock',asyncHandler(async(req,res)=>{
 const b=parse(z.object({variant_id:uuid,stock:z.number().int().min(0).max(1000000),version:z.number().int()}),req.body);
 res.json(await svc.transaction(async c=>{
  const p=(await c.query('select * from market_products where id=$1 for update',[id(req.params.id)])).rows[0];if(!p)throw notFound();
  await svc.vendorAccess(req.user!.id,p.vendor_id,c);
  const v=await c.query('update market_variants set stock=$2,version=version+1 where id=$1 and product_id=$3 and version=$4 returning *',[b.variant_id,b.stock,p.id,b.version]);
  if(!v.rows.length)throw conflict('Stock changed. Reload before updating.');
  await c.query('update market_products set updated_at=now() where id=$1',[p.id]);return v.rows[0];
 }));
}));
router.post('/products/:id/slots',asyncHandler(async(req,res)=>{
 const b=parse(z.object({starts_at:z.string().datetime({offset:true}),capacity:z.number().int().min(1).max(50)}),req.body);
 const p=(await query("select * from market_products where id=$1 and kind='service'",[id(req.params.id)]))[0];if(!p)throw notFound();await svc.vendorAccess(req.user!.id,p.vendor_id);
 if(Date.parse(b.starts_at)<=Date.now())throw badRequest('Choose a future slot');
 res.json((await query('insert into market_slots(product_id,starts_at,capacity) values($1,$2,$3) returning *',[p.id,b.starts_at,b.capacity]))[0]);
}));
// Availability editor: ownership is checked for reads and every write.
router.get('/products/:id/slots/manage',asyncHandler(async(req,res)=>{
 const p=(await query('select vendor_id,kind from market_products where id=$1',[id(req.params.id)]))[0];if(!p)throw notFound();await svc.vendorAccess(req.user!.id,p.vendor_id);
 res.json(await query('select * from market_slots where product_id=$1 and starts_at>now() order by starts_at limit 200',[id(req.params.id)]));
}));
router.patch('/slots/:id',asyncHandler(async(req,res)=>{
 const b=parse(z.object({capacity:z.number().int().min(1).max(50)}),req.body);
 res.json(await svc.transaction(async c=>{
  const s=(await c.query('select s.*,p.vendor_id from market_slots s join market_products p on p.id=s.product_id where s.id=$1 for update of s',[id(req.params.id)])).rows[0];if(!s)throw notFound();await svc.vendorAccess(req.user!.id,s.vendor_id,c);
  if(Date.parse(s.starts_at)<=Date.now()||b.capacity<s.booked)throw conflict('Capacity cannot remove booked places or change a past slot');
  return (await c.query('update market_slots set capacity=$2 where id=$1 returning *',[s.id,b.capacity])).rows[0];
 }));
}));
router.delete('/slots/:id',asyncHandler(async(req,res)=>{
 await svc.transaction(async c=>{
  const s=(await c.query('select s.*,p.vendor_id from market_slots s join market_products p on p.id=s.product_id where s.id=$1 for update of s',[id(req.params.id)])).rows[0];if(!s)throw notFound();await svc.vendorAccess(req.user!.id,s.vendor_id,c);
  if(s.booked|| (await c.query('select 1 from market_appointments where slot_id=$1 limit 1',[s.id])).rows.length)throw conflict('Slots with appointment history cannot be deleted');
  await c.query('delete from market_slots where id=$1',[s.id]);
 });res.status(204).end();
}));
router.post('/fulfilments/:id/status',asyncHandler(async(req,res)=>{
 const b=parse(z.object({status:z.enum(['accepted','ready','shipped','completed']),tracking:z.string().max(500).default('')}),req.body);
 await svc.transaction(async c=>{
  const f=(await c.query('select * from market_fulfilments where id=$1 for update',[id(req.params.id)])).rows[0];if(!f)throw notFound();await svc.vendorAccess(req.user!.id,f.vendor_id,c);
  if(f.method==='appointment')throw badRequest('Update the service appointment instead');
  if(f.status===b.status)return;
  const next:Record<string,string[]>={paid:['accepted'],accepted:f.method==='pickup'?['ready']:['shipped'],ready:['completed'],shipped:['completed']};
  if(!next[f.status]?.includes(b.status))throw conflict('Invalid order status change');
  if(b.status==='shipped'&&!b.tracking.trim())throw badRequest('Tracking details are required');
  await c.query("update market_fulfilments set status=$2,tracking=$3,completed_at=case when $2='completed' then now() else completed_at end where id=$1",[f.id,b.status,b.tracking]);
  await svc.event(c,req.user!.id,f.order_id,b.status,{vendor_id:f.vendor_id});
 });res.json({ok:true});
}));
router.post('/appointments/:id/vendor',asyncHandler(async(req,res)=>{
 const b=parse(z.object({action:z.enum(['quote','start','complete']),price:money.optional(),notes:z.string().max(2000).default('')}),req.body);
 await svc.transaction(async c=>{
  const a=(await c.query('select a.*,p.vendor_id from market_appointments a join market_products p on p.id=a.product_id where a.id=$1 for update of a',[id(req.params.id)])).rows[0];if(!a)throw notFound();await svc.vendorAccess(req.user!.id,a.vendor_id,c);
  if(b.action==='quote') {if(!['requested','quoted'].includes(a.status)||!b.price)throw conflict('Cannot quote this appointment');await c.query("update market_appointments set status='quoted',quoted_price=$2,quote_version=quote_version+1,technician_notes=$3 where id=$1",[a.id,b.price,b.notes]);}
  else {const required=b.action==='start'?'booked':'in_progress';if(a.status!==required)throw conflict('Invalid appointment status');await c.query('update market_appointments set status=$2,technician_notes=$3 where id=$1',[a.id,b.action==='start'?'in_progress':'completed',b.notes]);
   if(b.action==='complete')await c.query("update market_fulfilments set status='completed',completed_at=now() where order_id=$1",[a.order_id]);}
  await svc.event(c,req.user!.id,a.id,b.action);
 });res.json({ok:true});
}));

router.use('/admin',asyncHandler(async(req,_res,next)=>{await svc.admin(req.user!.id);next();}));
router.put('/admin/categories/:id',asyncHandler(async(req,res)=>{
 const category=parse(z.string().regex(/^[a-z0-9-]{1,60}$/),req.params.id);const b=parse(z.object({name:text,name_ar:text}),req.body);
 res.json((await query('insert into market_categories(id,name,name_ar) values($1,$2,$3) on conflict(id) do update set name=excluded.name,name_ar=excluded.name_ar returning *',[category,b.name,b.name_ar]))[0]);
}));
router.get('/admin/overview',asyncHandler(async(_req,res)=>{res.json({
 vendors:await query('select * from market_vendors order by created_at desc'),
 products:await query(`select p.*,v.name as vendor_name from market_products p join market_vendors v on v.id=p.vendor_id where p.status in ('pending','published','rejected') order by p.updated_at desc limit 200`),
 returns:await query(`select r.*,i.snapshot,i.quantity*i.unit_price as amount from market_returns r join market_order_items i on i.id=r.item_id order by r.created_at desc limit 100`),
 orders:await query('select * from market_orders order by created_at desc limit 100'),
 settlements:await query('select * from market_settlements order by created_at desc limit 100')});}));
router.get('/admin/vendors/:id/settlement-items',asyncHandler(async(req,res)=>{
 res.json(await query(`select i.*,f.completed_at from market_order_items i join market_fulfilments f on f.id=i.fulfilment_id
  where f.vendor_id=$1 and f.status='completed' and not i.refunded
  and f.completed_at + ((i.snapshot->>'return_days')::int * interval '1 day') < now()
  and not exists(select 1 from market_returns r where r.item_id=i.id and r.status<>'rejected')
  and not exists(select 1 from market_settlement_items where item_id=i.id) order by f.completed_at`,[id(req.params.id)]));
}));
router.patch('/admin/vendors/:id',asyncHandler(async(req,res)=>{
 const b=parse(z.object({seller_type:z.enum(['shop','service','both']).optional(),status:z.enum(['pending','approved','suspended']),commission_bps:z.number().int().min(0).max(10000),pickup_enabled:z.boolean(),delivery_enabled:z.boolean(),delivery_fee:z.number().int().min(0).max(100000),delivery_area:z.string().max(1000),rejection_reason:z.string().max(2000).default('')}),req.body);
 if(b.delivery_enabled&&!b.delivery_area.trim())throw badRequest('Delivery coverage is required');
 if(b.status==='approved'&&!b.pickup_enabled&&!b.delivery_enabled)throw badRequest('Enable a fulfilment method');
 const [before,after]=await svc.transaction(async c=>{const prev=(await c.query('select * from market_vendors where id=$1 for update',[id(req.params.id)])).rows[0];if(!prev)throw notFound();const v=(await c.query(`update market_vendors set status=$2,commission_bps=$3,pickup_enabled=$4,delivery_enabled=$5,delivery_fee=$6,delivery_area=$7,rejection_reason=$8,seller_type=coalesce($9,seller_type) where id=$1 returning *`,[id(req.params.id),b.status,b.commission_bps,b.pickup_enabled,b.delivery_enabled,b.delivery_fee,b.delivery_area,b.rejection_reason,b.seller_type??null])).rows[0];if(!v)throw notFound();await svc.event(c,req.user!.id,v.id,'vendor_updated',b);return [prev,v];});
 void tell.sellerReviewed(before,after);
 res.json(after);
}));
router.post('/admin/products/:id/moderate',asyncHandler(async(req,res)=>{
 const b=parse(z.object({status:z.enum(['published','rejected','paused']),note:z.string().max(2000),version:z.number().int(),images_checked:z.boolean().default(false)}),req.body);
 if(b.status==='published'&&!b.images_checked)throw badRequest('Confirm image quality and bilingual content before publishing');
 if(b.status==='rejected'&&!b.note.trim())throw badRequest('Explain the required changes');
 res.json(await svc.transaction(async c=>{
  const p=(await c.query(`select p.*,v.status as vendor_status,v.commission_bps from market_products p join market_vendors v on v.id=p.vendor_id where p.id=$1 for update of p,v`,[id(req.params.id)])).rows[0];if(!p)throw notFound();
  if(p.version!==b.version)throw conflict('Listing changed. Review the latest version.');
  if(b.status==='published'&&(p.vendor_status!=='approved'||p.commission_bps===null))throw conflict('Approve the vendor and set commission first');
  await c.query('update market_products set status=$2,moderation_note=$3,version=version+1,updated_at=now() where id=$1',[p.id,b.status,b.note]);await svc.event(c,req.user!.id,p.id,'moderated',b);
  void tell.listingReviewed(p,b.status,b.note);return {ok:true};
 }));
}));
router.post('/admin/returns/:id',asyncHandler(async(req,res)=>{
 const b=parse(z.object({status:z.enum(['approved','rejected','refunded']),resolution:text}),req.body);
 if(b.status==='refunded')res.json(await svc.refundItem(req.user!.id,id(req.params.id)));
 else {const r=await query("update market_returns set status=$2,resolution=$3 where id=$1 and status='requested' returning *",[id(req.params.id),b.status,b.resolution]);if(!r.length)throw conflict('Return is already reviewed');res.json(r[0]);}
}));
// Record a reconciled external payout; never claim that an API call moved bank funds.
router.post('/admin/vendors/:id/settlements',asyncHandler(async(req,res)=>{
 const b=parse(z.object({reference:text,item_ids:z.array(uuid).min(1).max(200)}),req.body);
 res.json(await svc.transaction(async c=>{
  const vendor=id(req.params.id);await c.query('select id from market_vendors where id=$1 for update',[vendor]);
  const items=(await c.query(`select i.*,f.completed_at from market_order_items i join market_fulfilments f on f.id=i.fulfilment_id
    where i.id=any($1::uuid[]) and f.vendor_id=$2 and f.status='completed' and not i.refunded
    and f.completed_at + ((i.snapshot->>'return_days')::int * interval '1 day') < now()
    and not exists(select 1 from market_returns r where r.item_id=i.id and r.status<>'rejected')
    and not exists(select 1 from market_settlement_items where item_id=i.id) order by i.id for update of i`,[b.item_ids,vendor])).rows;
  if(items.length!==b.item_ids.length)throw conflict('Some items are unpaid, returned, settled or within their return window');
  const amount=items.reduce((n,i)=>n+i.quantity*i.unit_price-Math.round(i.quantity*i.unit_price*i.commission_bps/10000),0);
  if(!amount)throw badRequest('Nothing to settle');
  const settlement=(await c.query('insert into market_settlements(vendor_id,amount,reference) values($1,$2,$3) returning *',[vendor,amount,b.reference])).rows[0];
  for(const i of items)await c.query('insert into market_settlement_items values($1,$2)',[i.id,settlement.id]);await svc.event(c,req.user!.id,settlement.id,'settlement_recorded',{amount,reference:b.reference});return settlement;
 }));
}));
export default router;
