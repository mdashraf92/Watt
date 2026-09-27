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
import packageRoutes from '../packages/admin.routes';
import mobileRoutes from '../mobile/admin.routes';
import reportsRoutes from '../reports/reports.routes';
import sessionsRoutes from '../sessions/admin.routes';
import payoutsRoutes from '../payouts/payouts.routes';

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
 res.json({counts,chargers,vendors:vendorSummary,commerce,review,unavailable});
}));

// Bounded, searchable operational lists. Table names come exclusively from this allowlist.
// `filters` = columns an admin may filter by exact value (used by the marketplace pages).
const resources:Record<string,{table:string;columns:string;search:string;filters?:string[]}>={
 chargers:{table:'stations',columns:'id,name,name_ar,address,governorate,latitude,longitude,status,total_connectors,available_connectors',search:'name'},
 users:{table:'profiles',columns:'id,full_name,phone,role,is_active,wallet_balance,held_balance,total_sessions,total_kwh,created_at',search:'full_name'},
 sessions:{table:'charging_sessions',columns:'id,user_id,station_id,status,started_at,kwh_delivered,cost',search:'id::text'},
 bookings:{table:'bookings',columns:'id,user_id,station_id,status,booked_at,duration_minutes',search:'id::text'},
 orders:{table:'market_orders',columns:'id,user_id,total,refunded_total,status,phone,delivery_address,created_at',search:'id::text'},
 appointments:{table:'market_appointments',columns:'id,user_id,product_id,slot_id,status,quoted_price,customer_notes,technician_notes,created_at',search:'id::text'},
 vendors:{table:'market_vendors',columns:'id,owner_id,name,name_ar,seller_type,cr_number,contact_phone,email,address,about,about_ar,logo_url,bank_details,status,commission_bps,pickup_enabled,delivery_enabled,delivery_fee,delivery_area,rejection_reason,created_at',search:'name',filters:['status','seller_type']},
 products:{table:'market_products',columns:'id,vendor_id,name,name_ar,kind,category_id,status,version,price_basis,duration_minutes,description,description_ar,image_url,warranty,warranty_ar,return_days,compatibility,specifications,moderation_note,updated_at',search:'name',filters:['status','kind']},
 returns:{table:'market_returns',columns:'id,item_id,user_id,reason,status,resolution,created_at',search:'id::text'},
 packages:{table:'venue_packages',columns:'*,updated_at::text as offer_version',search:'name'},
 fleet:{table:'service_vans',columns:'*',search:'label'},
 support:{table:'support_reports',columns:'*',search:'id::text'},
 applications:{table:'charger_applications',columns:'*',search:'full_name'},
 settlements:{table:'market_settlements',columns:'*',search:'reference'},
 payouts:{table:'payout_requests',columns:'*',search:'id::text'},
};
router.get('/records/:resource',asyncHandler(async(req,res)=>{
 const r=resources[req.params.resource];if(!r)throw notFound();
 if(!(await query('select to_regclass($1) as name',[`public.${r.table}`]))[0].name)throw notFound('This module needs database setup');
 const q=parse(z.object({q:z.string().max(100).default(''),offset:z.coerce.number().int().min(0).max(100000).default(0)}),req.query);
 // Exact-match filters, only for columns allowlisted on the resource; values are bound, never interpolated.
 const where:string[]=[];const params:unknown[]=[q.q,q.offset];
 for(const col of r.filters??[]){const v=req.query[col];if(typeof v==='string'&&v){params.push(parse(z.string().regex(/^[a-z_]{1,30}$/),v));where.push(`${col}::text=$${params.length}`);}}
 const rows=await query(`select ${r.columns} from public.${r.table} where ($1='' or ${r.search} ilike '%'||$1||'%')${where.map(w=>' and '+w).join('')} order by id limit 50 offset $2`,params);
 res.json({rows,has_more:rows.length===50});
}));
router.get('/records/:resource/:id',asyncHandler(async(req,res)=>{
 const r=resources[req.params.resource];if(!r)throw notFound();const id=parse(z.string().uuid(),req.params.id);
 const row=(await query(`select ${r.columns} from public.${r.table} where id=$1`,[id]))[0];if(!row)throw notFound();
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
router.use('/ops/reports',reportsRoutes);
router.use('/ops/payouts',payoutsRoutes);
export default router;
