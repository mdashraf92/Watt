import { Router, Request, Response } from 'express';
import { randomBytes, createHash } from 'crypto';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { pool } from '../../db/pool';
import { asyncHandler } from '../../middleware/error';
import { verifyPassword } from '../../lib/password';
import { badRequest, forbidden, notFound, unauthorized } from '../../lib/errors';
import { transaction } from '../marketplace/marketplace.service';
import adminRoutes from '../admin/admin.routes';
import superadminRoutes from '../superadmin/superadmin.routes';
import marketplaceRoutes from '../marketplace/marketplace.routes';
import notificationsRoutes from '../notifications/notifications.routes';
import packageRoutes from '../packages/admin.routes';
import mobileRoutes from '../mobile/admin.routes';
import reportsRoutes from '../reports/reports.routes';
import sessionsRoutes from '../sessions/admin.routes';
import payoutsRoutes from '../payouts/payouts.routes';
import cafeRoutes from '../cafe/cafe.routes';
import { env } from '../../config/env';

const router=Router();
const cookieName='gowatt_dashboard';
const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
const token=(req:Request)=>req.headers.cookie?.split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'='))?.slice(cookieName.length+1)||'';
const cookieOptions=(req:Request)=>({httpOnly:true,secure:req.secure,sameSite:'strict' as const,path:'/api/dashboard'});
const query=(sql:string,params:unknown[]=[])=>pool.query(sql,params).then(r=>r.rows);
function parse<S extends z.ZodTypeAny>(schema:S,value:unknown):z.output<S>{const r=schema.safeParse(value);if(!r.success)throw badRequest(r.error.issues[0]?.message);return r.data;}
router.use((req,res,next)=>{
 res.setHeader('Cache-Control','no-store');
 if(!['GET','HEAD','OPTIONS'].includes(req.method)) {
  const origin=req.get('origin');
  if(!origin || origin!==`${req.protocol}://${req.get('host')}`)return next(forbidden('Dashboard requests must come from the same origin'));
 }
 next();
});
router.post('/login',rateLimit({windowMs:15*60_000,max:10,standardHeaders:true,legacyHeaders:false}),asyncHandler(async(req,res)=>{
 const b=parse(z.object({email:z.string().email(),password:z.string().min(1).max(200)}),req.body);
 const u=(await query(`select p.id,p.full_name,p.role,p.is_active,u.encrypted_password from auth.users u join profiles p on p.id=u.id where lower(u.email)=lower($1)`,[b.email.trim()]))[0];
 if(!u||!u.is_active||!['admin','superadmin'].includes(u.role)||!(await verifyPassword(u.encrypted_password,b.password)))throw unauthorized('Invalid credentials or no dashboard access');
 const value=randomBytes(32).toString('hex');
 await transaction(async c=>{
  if(token(req))await c.query('delete from dashboard_sessions where token_hash=$1',[digest(token(req))]);
  await c.query('delete from dashboard_sessions where expires_at<now()');
  await c.query("insert into dashboard_sessions(token_hash,user_id,expires_at) values($1,$2,now()+interval '8 hours')",[digest(value),u.id]);
 });
 res.cookie(cookieName,value,{...cookieOptions(req),maxAge:8*60*60*1000});res.json({id:u.id,name:u.full_name,role:u.role});
}));
router.use(asyncHandler(async(req,res,next)=>{
 const value=token(req);if(!/^[a-f0-9]{64}$/.test(value))throw unauthorized('Sign in to the dashboard');
 const u=(await query(`select p.id,p.full_name,p.role,p.is_active from dashboard_sessions s join profiles p on p.id=s.user_id where s.token_hash=$1 and s.expires_at>now()`,[digest(value)]))[0];
 if(!u||!u.is_active||!['admin','superadmin'].includes(u.role)){res.clearCookie(cookieName,cookieOptions(req));throw unauthorized('Dashboard access expired or was revoked');}
 req.user={id:u.id,role:u.role};res.locals.dashboardUser=u;
 // Audit method/path/status only. Never store passwords, tokens, or request bodies.
 if(!['GET','HEAD','OPTIONS'].includes(req.method))res.on('finish',()=>{void pool.query('insert into dashboard_audit(actor_id,method,path,status) values($1,$2,$3,$4)',[u.id,req.method,req.originalUrl.split('?')[0],res.statusCode]).catch(()=>console.error('Dashboard audit write failed'));});
 next();
}));
router.get('/session',(req,res)=>res.json({id:req.user!.id,name:res.locals.dashboardUser.full_name,role:req.user!.role}));
router.post('/logout',asyncHandler(async(req,res)=>{await query('delete from dashboard_sessions where token_hash=$1',[digest(token(req))]);res.clearCookie(cookieName,cookieOptions(req));res.json({ok:true});}));
router.get('/platform-status',asyncHandler(async(req,res)=>{
 if(req.user!.role!=='superadmin')throw forbidden('Only super admins can inspect platform configuration');
 await query('select 1');
 const exists=(await query("select to_regclass('public.operations_job_runs') as name"))[0].name;
 const jobs=exists?await query('select * from operations_job_runs order by name'):[];
 res.json({database:'connected',monitor_ready:!!exists,integrations:{payments:!!(env.THAWANI_SECRET_KEY&&env.THAWANI_PUBLISHABLE_KEY),devices:!!(env.TUYA_CLIENT_ID&&env.TUYA_CLIENT_SECRET),sms:!!(env.ISMARTSMS_USER_ID&&env.ISMARTSMS_PASSWORD&&env.ISMARTSMS_HEADER),email:!!env.SMTP_HOST,routing:!!env.OSRM_URL},features:{package_purchase:env.PACKAGES_PURCHASE_ENABLED,package_charging:env.PACKAGES_CHARGING_ENABLED,package_monitor:env.PACKAGES_MONITOR_ENABLED,cafe_orders:env.CAFE_ORDERS_ENABLED},jobs});
}));

// A bounded queue of decisions, linked to the existing record/action screens.
router.get('/attention',asyncHandler(async(req,res)=>{
 const filter=parse(z.object({resource:z.string().max(40).default('')}),req.query);
 const sources=[
  {resource:'chargers',table:'stations',title:'name',date:'null::timestamptz',where:"status::text in ('fault','offline')",priority:'urgent',action:'Check charger connectivity'},
  {resource:'sessions',table:'charging_sessions',title:'id::text',date:'started_at',where:'flagged_review',priority:'urgent',action:'Review charging session'},
  {resource:'cafe_orders',table:'cafe_orders',title:'order_no::text',date:'paid_at',where:"refund_status in ('pending','failed')",priority:'urgent',action:'Review café refund'},
  {resource:'support',table:'support_reports',title:'id::text',date:'created_at',where:"status::text in ('open','in_review')",priority:'normal',action:'Respond to customer'},
  {resource:'applications',table:'charger_applications',title:'full_name',date:'created_at',where:"status::text in ('pending','under_review')",priority:'normal',action:'Review application'},
  {resource:'vendors',table:'market_vendors',title:'name',date:'created_at',where:"status='pending'",priority:'normal',action:'Review seller'},
  {resource:'products',table:'market_products',title:'name',date:'updated_at',where:"status='pending'",priority:'normal',action:'Moderate listing'},
  {resource:'returns',table:'market_returns',title:'reason',date:'created_at',where:"status in ('requested','approved')",priority:'urgent',action:'Review refund'},
  {resource:'payouts',table:'payout_requests',title:'id::text',date:'requested_at',where:"status::text='pending'",priority:'normal',action:'Review payout'},
 ];
 if(filter.resource&&!sources.some(s=>s.resource===filter.resource))throw badRequest('Unknown queue section');
 const unavailable:string[]=[];
 const groups=await Promise.all(sources.filter(s=>!filter.resource||s.resource===filter.resource).map(async s=>{
  if(!(await query('select to_regclass($1) as name',[`public.${s.table}`]))[0].name){unavailable.push(s.resource);return {resource:s.resource,total:0,items:[]};}
  const rows=await query(`select id,${s.title} as title,status::text as status,${s.date} as created_at,count(*) over()::int as total from public.${s.table} where ${s.where} order by ${s.date==='null::timestamptz'?'id':s.date+' asc nulls last,id'} limit 50`);
  return {resource:s.resource,total:rows[0]?.total??0,items:rows.map(({total,...row})=>({...row,resource:s.resource,priority:s.priority,next_action:s.action}))};
 }));
 const items=groups.flatMap(g=>g.items).sort((a,b)=>Number(b.priority==='urgent')-Number(a.priority==='urgent')||Date.parse(a.created_at??'9999-01-01')-Date.parse(b.created_at??'9999-01-01'));
 res.json({items:items.slice(0,50),total:groups.reduce((n,g)=>n+g.total,0),counts:Object.fromEntries(groups.map(g=>[g.resource,g.total])),unavailable,has_more:items.length>50||groups.some(g=>g.total>50)});
}));

// Explicit summary projections avoid sending customer identities to the overview.
router.get('/overview',asyncHandler(async(_req,res)=>{
 const domains:Record<string,string>={users:'profiles',chargers:'stations',sessions:'charging_sessions',bookings:'bookings',vendors:'market_vendors',products:'market_products',orders:'market_orders',appointments:'market_appointments',returns:'market_returns',packages:'venue_packages',fleet:'service_vans',support:'support_reports',applications:'charger_applications'};
 const counts:Record<string,number|null>={};const unavailable:string[]=[];
 for(const [name,table] of Object.entries(domains)){
  const exists=(await query('select to_regclass($1) as name',[`public.${table}`]))[0].name;
  if(!exists){counts[name]=null;unavailable.push(name);}else counts[name]=(await query(`select count(*)::int as n from public.${table}`))[0].n;
 }
 const chargers=counts.chargers===null?[]:await query('select id,name,name_ar,address,latitude,longitude,status,total_connectors from stations order by name limit 100');
 const commerce=counts.orders===null?null:(await query(`select count(*)::int as orders,coalesce(sum(total),0)::bigint as gross_baisa,coalesce(sum(refunded_total),0)::bigint as refunds_baisa from market_orders`))[0];
 const vendorSummary=counts.vendors===null?[]:await query('select id,name,name_ar,seller_type,address,status from market_vendors order by created_at desc limit 100');
 // What is waiting on an admin decision in the marketplace.
 const review=counts.vendors===null||counts.products===null?null:(await query(`select
   (select count(*)::int from market_vendors where status='pending') as vendors_pending,
   (select count(*)::int from market_products where status='pending') as products_pending,
   (select count(*)::int from market_vendors where status='approved' and seller_type<>'service') as shops,
   (select count(*)::int from market_vendors where status='approved' and seller_type<>'shop') as service_providers`))[0];
 // Optional blocks: each is guarded so a missing module never breaks the overview.
 const safe=async<T>(fn:()=>Promise<T>):Promise<T|null>=>{try{return await fn();}catch{return null;}};
 const has=async(t:string)=>(await query('select to_regclass($1) as name',[`public.${t}`]))[0].name!==null;
 const cafe=await has('cafe_orders')?await safe(async()=>(await query(`select
   (select count(*)::int from stations where cafe_enabled) as cafes,
   (select count(*)::int from cafe_orders where status in ('paid','accepted','ready')) as live,
   (select count(*)::int from cafe_orders where paid_at>=date_trunc('day',now())) as today_orders,
   (select coalesce(sum(total),0)::float from cafe_orders where paid_at>=date_trunc('day',now()) and status not in ('rejected','cancelled')) as today_gross,
   (select coalesce(sum(cafe_net),0)::float from cafe_ledger where settlement_id is null and voided_at is null) as owed_to_cafes,
   (select count(*)::int from cafe_orders where refund_status in ('failed','pending')) as refunds_open`))[0]):null;
 // What needs a human today, across modules.
 const attention={
  support:await has('support_reports')?await safe(async()=>(await query(`select count(*)::int as n from support_reports where status in ('open','in_review')`))[0].n):null,
  applications:await has('charger_applications')?await safe(async()=>(await query(`select count(*)::int as n from charger_applications where status::text in ('pending','under_review')`))[0].n):null,
  payouts:await has('payout_requests')?await safe(async()=>(await query(`select count(*)::int as n from payout_requests where status::text='pending'`))[0].n):null,
  flagged_sessions:await safe(async()=>(await query(`select count(*)::int as n from charging_sessions where flagged_review`))[0].n),
  cafe_refunds:cafe?.refunds_open??null,
 };
 // Last 14 days of activity for the overview chart.
 const activity=await safe(async()=>query(`select to_char(d,'YYYY-MM-DD') as day,
   (select count(*)::int from charging_sessions s where s.started_at>=d and s.started_at<d+interval '1 day') as sessions,
   ${counts.orders===null?'0':`(select count(*)::int from market_orders o where o.created_at>=d and o.created_at<d+interval '1 day')`} as orders,
   ${cafe?`(select count(*)::int from cafe_orders c where c.paid_at>=d and c.paid_at<d+interval '1 day')`:'0'} as cafe_orders
   from generate_series(date_trunc('day',now())-interval '13 days',date_trunc('day',now()),interval '1 day') d order by d`));
 res.json({counts,chargers,vendors:vendorSummary,commerce,review,unavailable,cafe,attention,activity:activity??[]});
}));

// Bounded, searchable operational lists. Table names come exclusively from this allowlist.
// `filters` = columns an admin may filter by exact value (used by the marketplace pages).
const resources:Record<string,{table:string;columns:string;search:string;filters?:string[]}>={
 chargers:{table:'stations',columns:'id,name,name_ar,address,governorate,latitude,longitude,status,total_connectors,available_connectors',search:'name',filters:['status']},
 users:{table:'profiles',columns:'id,full_name,phone,role,is_active,wallet_balance,held_balance,total_sessions,total_kwh,created_at',search:"concat(full_name,' ',phone)"},
 sessions:{table:'charging_sessions',columns:'id,user_id,station_id,listing_id,status,started_at,kwh_delivered,cost',search:'id::text',filters:['status']},
 bookings:{table:'bookings',columns:'id,user_id,station_id,listing_id,status,booked_at,duration_minutes',search:'id::text',filters:['status']},
 orders:{table:'market_orders',columns:'id,user_id,total,refunded_total,status,phone,delivery_address,created_at',search:'id::text',filters:['status']},
 appointments:{table:'market_appointments',columns:'id,user_id,product_id,slot_id,status,quoted_price,customer_notes,technician_notes,created_at',search:'id::text',filters:['status']},
 vendors:{table:'market_vendors',columns:'id,owner_id,name,name_ar,seller_type,cr_number,contact_phone,email,address,about,about_ar,logo_url,bank_details,status,commission_bps,pickup_enabled,delivery_enabled,delivery_fee,delivery_area,rejection_reason,created_at',search:'name',filters:['status','seller_type']},
 products:{table:'market_products',columns:'id,vendor_id,name,name_ar,kind,category_id,status,version,price_basis,duration_minutes,description,description_ar,image_url,warranty,warranty_ar,return_days,compatibility,specifications,moderation_note,updated_at',search:'name',filters:['status','kind']},
 returns:{table:'market_returns',columns:'id,item_id,user_id,reason,status,resolution,created_at',search:'id::text',filters:['status']},
 packages:{table:'venue_packages',columns:'*,updated_at::text as offer_version',search:'name'},
 fleet:{table:'service_vans',columns:'*',search:'label'},
 support:{table:'support_reports',columns:'*',search:'id::text',filters:['status']},
 applications:{table:'charger_applications',columns:'*',search:'full_name',filters:['status']},
 settlements:{table:'market_settlements',columns:'*',search:'reference'},
 payouts:{table:'payout_requests',columns:'*',search:'id::text',filters:['status']},
 cafe_orders:{table:'cafe_orders',columns:'id,order_no,user_id,station_id,package_id,status,total,refund_status,reject_reason,note,created_at,paid_at,accepted_at,ready_at,collected_at',search:'id::text',filters:['status']},
};
// Tables whose rows belong to a customer: search also matches the customer's name or email.
const personTables=new Set(['cafe_orders','charging_sessions','bookings','market_orders','market_appointments','market_returns','payout_requests','charger_applications']);
// Replace raw ids with what an admin actually reads: who (name + email), where
// (station or home charger), which seller and which listing. One batched query
// per kind; raw ids stay on the row for the details view.
async function withNames(rows:any[]){
 if(!rows.length)return rows;
 const ids=(key:string)=>[...new Set(rows.map(r=>r[key]).filter(Boolean))];
 const map=async(key:string,sql:string)=>{const list=ids(key);if(!list.length)return new Map<string,any>();return new Map((await query(sql,[list])).map((x:any)=>[x.id,x]));};
 const [people,stations,listings,vendors,products]=await Promise.all([
  map('user_id',`select p.id,p.full_name as name,u.email,p.phone from profiles p left join auth.users u on u.id=p.id where p.id=any($1::uuid[])`),
  map('station_id','select id,name from stations where id=any($1::uuid[])'),
  map('listing_id',`select cl.id,coalesce(nullif(cl.station_name,''),cl.address) as name,p.full_name as host from charger_listings cl left join profiles p on p.id=cl.host_id where cl.id=any($1::uuid[])`),
  map('vendor_id','select id,name from market_vendors where id=any($1::uuid[])'),
  map('product_id','select id,name from market_products where id=any($1::uuid[])'),
 ]);
 return rows.map(r=>{
  const out:any={...r};
  if('user_id' in r){const p=people.get(r.user_id);out.customer=p?{name:p.name||'',email:p.email||p.phone||''}:null;}
  if('station_id' in r||'listing_id' in r){const st=stations.get(r.station_id);const li=listings.get(r.listing_id);
   out.location=st?{name:st.name,email:''}:li?{name:li.name,email:li.host?`Home charger · ${li.host}`:'Home charger'}:null;}
  if('vendor_id' in r)out.vendor=vendors.get(r.vendor_id)?.name??null;
  if('product_id' in r)out.product=products.get(r.product_id)?.name??null;
  return out;
 });
}
router.get('/records/:resource',asyncHandler(async(req,res)=>{
 const r=resources[req.params.resource];if(!r)throw notFound();
 if(!(await query('select to_regclass($1) as name',[`public.${r.table}`]))[0].name)throw notFound('This module needs database setup');
 const q=parse(z.object({q:z.string().max(100).default(''),offset:z.coerce.number().int().min(0).max(100000).default(0)}),req.query);
 // Exact-match filters, only for columns allowlisted on the resource; values are bound, never interpolated.
 const where:string[]=[];const params:unknown[]=[q.q,q.offset];
 for(const col of r.filters??[]){const v=req.query[col];if(typeof v==='string'&&v){params.push(parse(z.string().regex(/^[a-z_]{1,30}$/),v));where.push(`${col}::text=$${params.length}`);}}
 const people=personTables.has(r.table)?` or user_id in (select p.id from profiles p left join auth.users u on u.id=p.id where p.full_name ilike '%'||$1||'%' or u.email ilike '%'||$1||'%' or p.phone ilike '%'||$1||'%')`:r.table==='profiles'?` or id in(select id from auth.users where email ilike '%'||$1||'%')`:'';
 const rows=await query(`select ${r.columns} from public.${r.table} where ($1='' or ${r.search} ilike '%'||$1||'%'${people})${where.map(w=>' and '+w).join('')} order by id limit 50 offset $2`,params);
 res.json({rows:await withNames(rows),has_more:rows.length===50});
}));
router.get('/records/:resource/:id',asyncHandler(async(req,res)=>{
 const r=resources[req.params.resource];if(!r)throw notFound();const id=parse(z.string().uuid(),req.params.id);
 const raw=(await query(`select ${r.columns} from public.${r.table} where id=$1`,[id]))[0];if(!raw)throw notFound();const [row]=await withNames([raw]);
 const related:Record<string,unknown>={};
 if(req.params.resource==='chargers'){
  related.connectors=await query('select id,connector_type,power_kw,status from connectors where station_id=$1',[id]);
  related.sessions=await query(`select s.id,s.status,s.started_at,s.kwh_delivered,s.cost,p.full_name as customer_name,p.phone as customer_phone from charging_sessions s join profiles p on p.id=s.user_id where s.station_id=$1 order by s.started_at desc limit 100`,[id]);
  related.bookings=await query(`select b.id,b.status,b.booked_at,p.full_name as customer_name from bookings b join profiles p on p.id=b.user_id where b.station_id=$1 order by b.booked_at desc limit 100`,[id]);
 }
 if(req.params.resource==='users'){
  related.sessions=await query('select id,station_id,status,started_at,kwh_delivered,cost from charging_sessions where user_id=$1 order by started_at desc limit 50',[id]);
  related.orders=await query('select id,total,status,created_at from market_orders where user_id=$1 order by created_at desc limit 50',[id]);
  related.vehicles=await query('select * from market_vehicles where user_id=$1',[id]);
 }
 if(req.params.resource==='orders'){
  related.items=await query('select * from market_order_items where order_id=$1',[id]);
  related.fulfilments=await query('select * from market_fulfilments where order_id=$1',[id]);
  related.events=await query('select action,created_at,detail from market_events where entity_id=$1 order by created_at',[id]);
 }
 if(req.params.resource==='cafe_orders')related.items=await query('select name,quantity,unit_price,in_package,options from cafe_order_items where order_id=$1',[id]);
 if(req.params.resource==='products')related.variants=await query('select * from market_variants where product_id=$1',[id]);
 if(req.params.resource==='vendors')related.products=await query('select id,name,status,kind from market_products where vendor_id=$1',[id]);
 res.json({row,related});
}));
router.patch('/chargers/:id',asyncHandler(async(req,res)=>{
 const id=parse(z.string().uuid(),req.params.id);const b=parse(z.object({name:z.string().trim().min(1),name_ar:z.string().trim().min(1),address:z.string().trim().min(1),latitude:z.number().min(-90).max(90),longitude:z.number().min(-180).max(180)}).strict(),req.body);
 const row=(await query('update stations set name=$2,name_ar=$3,address=$4,latitude=$5,longitude=$6 where id=$1 returning id,name,address',[id,b.name,b.name_ar,b.address,b.latitude,b.longitude]))[0];if(!row)throw notFound();res.json(row);
}));
router.get('/administrators',asyncHandler(async(req,res)=>{
 if(req.user!.role!=='superadmin')throw forbidden();res.json(await query("select p.id,p.full_name,p.role,p.is_active,u.email from profiles p join auth.users u on u.id=p.id where p.role::text in ('admin','superadmin') order by p.full_name"));
}));
router.post('/administrators',asyncHandler(async(req,res)=>{
 if(req.user!.role!=='superadmin')throw forbidden();
 const b=parse(z.object({email:z.string().email(),role:z.enum(['admin','superadmin','customer'])}),req.body);
 await transaction(async c=>{
  await c.query("select pg_advisory_xact_lock(hashtextextended('dashboard-admin-management',0))");
  const actor=(await c.query('select role,is_active from profiles where id=$1 for update',[req.user!.id])).rows[0];if(actor?.role!=='superadmin'||!actor.is_active)throw forbidden();
  const u=(await c.query('select p.id,p.role from profiles p join auth.users u on u.id=p.id where lower(u.email)=lower($1) for update of p',[b.email])).rows[0];if(!u)throw notFound('Create the user account first');
  if(u.id===req.user!.id&&b.role!=='superadmin')throw badRequest('You cannot remove your own super admin access');
  if(u.role==='superadmin'&&b.role!=='superadmin'&&(await c.query("select id from profiles where role::text='superadmin' and is_active=true")).rows.length<=1)throw badRequest('Keep at least one active super admin');
  await c.query('update profiles set role=$2 where id=$1',[u.id,b.role]);await c.query('delete from dashboard_sessions where user_id=$1',[u.id]);
 });res.json({ok:true});
}));
router.get('/audit',asyncHandler(async(req,res)=>{if(req.user!.role!=='superadmin')throw forbidden();res.json(await query('select a.*,p.full_name as actor from dashboard_audit a left join profiles p on p.id=a.actor_id order by created_at desc limit 200'));}));
// Reuse the existing validated operations, under the browser session and CSRF guard.
router.use('/ops/admin',adminRoutes,mobileRoutes,sessionsRoutes,packageRoutes);
router.use('/ops/superadmin/admins',(_req,_res,next)=>next(notFound('Use administrator access management')));
router.use('/ops/superadmin',superadminRoutes);
router.use('/ops/marketplace',marketplaceRoutes);
// Same inbox as the app (/api/notifications), for the signed-in dashboard user.
router.use('/notifications', notificationsRoutes);
router.use('/ops/reports',reportsRoutes);
router.use('/ops/payouts',payoutsRoutes);
router.use('/ops/cafe',cafeRoutes);
export default router;
