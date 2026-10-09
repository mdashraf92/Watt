// Persistent, loopback-only dashboard sandbox. Copies schema, never customer rows.
const fs=require('node:fs');const path=require('node:path');const {execFileSync}=require('node:child_process');
const {randomBytes}=require('node:crypto');const bcrypt=require('bcryptjs');const {Client}=require('pg');
const root=path.resolve(__dirname,'../../.artifacts/dashboard-sandbox');fs.mkdirSync(root,{recursive:true});
const bin=process.env.PG_BIN||'C:/Program Files/PostgreSQL/18/bin';
const exe=n=>path.join(bin,n+(process.platform==='win32'?'.exe':''));
const data=path.join(root,'postgres');const configPath=path.join(root,'database.json');
const run=(n,args,env={})=>execFileSync(exe(n),args,{windowsHide:true,stdio:n==='pg_ctl'?'ignore':'pipe',env:{...process.env,...env},timeout:60000});
const migrations=[
 'backend-compat.sql','backend-tables.sql','backend-notifications.sql','backend-station-status.sql','backend-realtime.sql',
 'backend-saved-cards.sql','backend-superadmin-application-actions.sql','backend-mobile-charging.sql','backend-trips.sql',
 'backend-waitlist.sql','backend-support-reports.sql','backend-session-photo.sql','backend-overstay-and-refund.sql',
 'backend-billing-overrun-fix.sql','backend-mobile-settings.sql','backend-unique-email.sql','backend-packages.sql',
 'backend-package-purchase-safety.sql','backend-package-redemption.sql','backend-package-venues.sql','backend-signup-otp.sql',
 'backend-email-otp.sql','backend-password-reset-otp.sql','backend-phone-otp.sql','backend-marketplace.sql','backend-dashboard.sql',
 'backend-signup-steps.sql','backend-marketplace-sellers.sql','backend-seller-portal.sql','backend-cafe-orders.sql','backend-operations-monitor.sql'];
const uid=n=>`da500000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const accounts=[['superadmin','superadmin'],['admin','admin'],['shop','customer'],['service','customer'],['host','host'],['investor','investor'],['cafe','customer'],['operator','operator'],['customer','customer']];
async function main(){
 let config=fs.existsSync(configPath)?JSON.parse(fs.readFileSync(configPath,'utf8')):{password:randomBytes(24).toString('hex'),port:55439};
 if(!fs.existsSync(data)){
  fs.writeFileSync(configPath,JSON.stringify(config),{mode:0o600});
  const pw=path.join(root,'init-password');fs.writeFileSync(pw,config.password,{mode:0o600});
  try{run('initdb',['-D',data,'-U','postgres','--auth=scram-sha-256','--pwfile='+pw,'--encoding=UTF8','--no-locale']);}finally{fs.unlinkSync(pw);}
 }
 try{run('pg_ctl',['-D',data,'status']);}catch{run('pg_ctl',['-D',data,'-l',path.join(root,'postgres.log'),'-o',`-h 127.0.0.1 -p ${config.port}`,'-w','start']);}
 const url=`postgresql://postgres:${config.password}@127.0.0.1:${config.port}/postgres`;
 const c=new Client({connectionString:url});await c.connect();
 try{
  const fresh=!(await c.query("select to_regclass('public.profiles') as name")).rows[0].name;
  if(fresh){
   await c.query("create schema if not exists dashboard_sandbox; create table if not exists dashboard_sandbox.marker(id boolean primary key default true)");
   await c.query("insert into dashboard_sandbox.marker values(true) on conflict do nothing");
   for(const role of ['anon','authenticated','service_role','supabase_admin','supabase_auth_admin'])await c.query(`do $$ begin if not exists(select 1 from pg_roles where rolname='${role}') then create role ${role} nologin; end if; end $$`);
   await c.query('create extension if not exists pgcrypto;create extension if not exists btree_gist;');
   const psql=(file)=>run('psql',['-h','127.0.0.1','-p',String(config.port),'-U','postgres','-d','postgres','-X','-v','ON_ERROR_STOP=1','-f',file],{PGPASSWORD:config.password});
   psql(path.join(__dirname,'../sql/local-auth-bootstrap.sql'));psql(path.join(__dirname,'../sql/backend-compat.sql'));
   let dump=fs.readFileSync(path.join(__dirname,'../../db/dumps/gowatt_public.sql'),'utf8');
   dump=dump.replace(/^COPY [^\r\n]+ FROM stdin;\r?\n[\s\S]*?^\\\.\r?\n/gm,'')
    .replace(/^SELECT pg_catalog\.setval[^\r\n]*\r?\n/gm,'')
    .replace(/^CREATE SCHEMA public;$/m,'');
   if(/^COPY |^INSERT INTO /m.test(dump))throw Error('Unexpected data statement in schema source');
   const schema=path.join(root,'schema-only.sql');fs.writeFileSync(schema,dump);psql(schema);
   console.log('Created isolated schema without imported customer records.');
  }
  if(!(await c.query("select to_regclass('dashboard_sandbox.marker') as name")).rows[0].name)throw Error('Not a dashboard sandbox database');
  for(const file of migrations)await c.query(fs.readFileSync(path.join(__dirname,'../sql',file),'utf8'));
  const reportPath=path.join(root,'test-users.json');let previous=fs.existsSync(reportPath)?JSON.parse(fs.readFileSync(reportPath,'utf8')).accounts:[];
  const report=[];await c.query('begin');
  for(const [index,[kind,role]] of accounts.entries()){
   const email=`test-${kind}@gowatt.invalid`;const password=previous.find(x=>x.email===email)?.password||'GwTest-'+randomBytes(9).toString('base64url')+'!';const id=uid(index+1);
   const hash=await bcrypt.hash(password,12);
   await c.query(`insert into auth.users(id,email,encrypted_password,email_confirmed_at,created_at,updated_at) values($1,$2,$3,now(),now(),now()) on conflict(id) do update set encrypted_password=excluded.encrypted_password,email_confirmed_at=now()`,[id,email,hash]);
   await c.query(`insert into profiles(id,full_name,phone,role,is_active,car_make,car_model,battery_kwh,connector_type,profile_prompted) values($1,$2,$3,$4,true,'Tesla','Model 3',60,'Type2',true) on conflict(id) do update set role=excluded.role,is_active=true`,[id,`Test ${kind}`,'96899000'+String(index+1).padStart(3,'0'),role]);
   report.push({kind,role,id,email,password,dashboard:['admin','superadmin'].includes(kind)?'/dashboard/':['shop','service'].includes(kind)?'/seller/':'Mobile app'});
  }
  for(const [n,kind,type,owner] of [[101,'shop','shop',3],[102,'service','service',4]])await c.query(`insert into market_vendors(id,owner_id,name,name_ar,cr_number,contact_phone,email,address,bank_details,status,commission_bps,seller_type,pickup_enabled) values($1,$2,$3,$3,'TEST-ONLY','96899000003',$4,'Muscat test venue','TEST ONLY - no bank account','approved',1000,$5,true) on conflict(id) do nothing`,[uid(n),uid(owner),`Test ${kind}`,`test-${kind}@gowatt.invalid`,type]);
  await c.query(`insert into stations(id,name,name_ar,address,governorate,latitude,longitude,cafe_enabled) values($1,'Test café and venue','مقهى وموقع تجريبي','Muscat test venue','Muscat',23.6,58.4,true) on conflict(id) do nothing`,[uid(201)]);
  await c.query('insert into venue_staff(station_id,user_id) values($1,$2) on conflict do nothing',[uid(201),uid(7)]);
  for(const [n,owner] of [[301,5],[302,6]])await c.query(`insert into charger_listings(id,host_id,station_name,address,latitude,longitude,description,is_available,tuya_verified) values($1,$2,$3,'Muscat test location',23.6,58.4,'Test listing - no real device',false,false) on conflict(id) do nothing`,[uid(n),uid(owner),`Test ${owner===5?'host':'investor'} charger`]);
  await c.query(`insert into service_vans(id,label,plate,operator_id,capacity_kwh,current_kwh,status,is_active,governorate) values($1,'Test mobile charger','TEST ONLY',$2,40,40,'offline',true,'Muscat') on conflict(id) do nothing`,[uid(401),uid(8)]);
  for(const [n,vendor,kind,category,name,price] of [[501,101,'physical','cables','Test cable',1500],[502,102,'service','maintenance','Test EV inspection',2500]]){
   await c.query(`insert into market_products(id,vendor_id,category_id,kind,name,name_ar,description,description_ar,image_url,warranty,warranty_ar,return_days,status,duration_minutes,service_location,price_basis) values($1,$2,$3,$4,$5,$5,'Test listing','Test listing','https://example.invalid/test.png','Test warranty','Test warranty',0,'published',$6,'at_centre','fixed') on conflict(id) do nothing`,[uid(n),uid(vendor),category,kind,name,kind==='service'?60:null]);
   await c.query(`insert into market_variants(id,product_id,sku,name,name_ar,price,stock) values($1,$2,$3,'Standard','Standard',$4,3) on conflict(id) do nothing`,[uid(n+100),uid(n),`DASHBOARD-TEST-${n}`,price]);
  }
  await c.query(`insert into market_slots(product_id,starts_at,capacity) values($1,date_trunc('day',now())+interval '1 day 9 hours',2) on conflict(product_id,starts_at) do nothing`,[uid(502)]);
  // Visible, explicitly fictional work for each dashboard. No provider calls.
  await c.query("select credit_wallet_topup($1,100,$2,'manual')",[uid(9),'DASHBOARD-TEST-FUNDS']);
  await c.query(`insert into support_reports(id,user_id,category,description) values($1,$2,'other','TEST ONLY: please review my sample booking') on conflict(id) do nothing`,[uid(701),uid(9)]);
  await c.query(`insert into charger_applications(id,user_id,full_name,phone,governorate,city,latitude,longitude,charger_type,power_kw,electricity_form_name,commercial_registration,id_card_number,station_name) values($1,$2,'Test partner applicant','96899000009','Muscat','Muscat',23.6,58.4,'Type2',7.4,'TEST FORM','TEST CR','TEST ID','Test applicant charger') on conflict(id) do nothing`,[uid(702),uid(9)]);
  await c.query(`insert into market_vehicles(id,user_id,make,model,year,connector) values($1,$2,'Tesla','Model 3',2026,'Type2') on conflict(id) do nothing`,[uid(703),uid(9)]);
  const slot=(await c.query('select id from market_slots where product_id=$1 and starts_at>now() order by starts_at limit 1',[uid(502)])).rows[0];
  if(slot)await c.query(`insert into market_appointments(id,user_id,product_id,vehicle_id,slot_id,request_key,customer_notes) values($1,$2,$3,$4,$5,'DASHBOARD-TEST-BOOKING','TEST ONLY: inspect the battery and brakes') on conflict(id) do nothing`,[uid(704),uid(9),uid(502),uid(703),slot.id]);
  await c.query(`insert into bookings(id,user_id,listing_id,booked_at,booked_end,duration_minutes,estimated_kwh,estimated_cost) values($1,$2,$3,now()+interval '1 day',now()+interval '1 day 1 hour',60,7,0.175) on conflict(id) do nothing`,[uid(705),uid(9),uid(301)]);
  await c.query(`insert into venue_packages(id,station_id,name,name_ar,description,description_ar,partner_benefit,partner_benefit_ar,price,included_minutes,is_active) values($1,$2,'Test coffee pass','باقة قهوة تجريبية','TEST ONLY - no hardware','TEST ONLY','Test coffee','قهوة تجريبية',2,30,false) on conflict(id) do nothing`,[uid(706),uid(201)]);
  await c.query(`insert into entitlements(id,user_id,package_id,station_id,price_paid,minutes_total,redeem_code,expires_at,package_name,package_name_ar,partner_benefit,partner_benefit_ar) values($1,$2,$3,$4,2,30,'GW-TEST-COFFEE',now()+interval '1 day','Test coffee pass','باقة قهوة تجريبية','Test coffee','قهوة تجريبية') on conflict(id) do nothing`,[uid(707),uid(9),uid(706),uid(201)]);
  await c.query(`insert into cafe_orders(id,user_id,station_id,package_id,status,package_price,items_total,total,request_key,offer_version,note,paid_reference,entitlement_id,paid_at) values($1,$2,$3,$4,'paid',2,0,2,'DASHBOARD-TEST-CAFE','test','TEST ONLY - fictional payment','DASHBOARD-TEST-CAFE',$5,now()) on conflict(id) do nothing`,[uid(708),uid(9),uid(201),uid(706),uid(707)]);
  await c.query(`insert into cafe_order_items(id,order_id,name,name_ar,unit_price,quantity,in_package) values($1,$2,'Test coffee','قهوة تجريبية',0,1,true) on conflict(id) do nothing`,[uid(709),uid(708)]);
  await c.query('commit');
  fs.writeFileSync(reportPath,JSON.stringify({accounts:report},null,2),{mode:0o600});
  const oldEnv=fs.existsSync(path.join(root,'backend.env'))?require('dotenv').parse(fs.readFileSync(path.join(root,'backend.env'))):{};
  const envText=`NODE_ENV=development\nPORT=8081\nDATABASE_URL=${url}\nJWT_ACCESS_SECRET=${oldEnv.JWT_ACCESS_SECRET||randomBytes(32).toString('hex')}\nJWT_REFRESH_SECRET=${oldEnv.JWT_REFRESH_SECRET||randomBytes(32).toString('hex')}\nJOB_SECRET=${oldEnv.JOB_SECRET||randomBytes(24).toString('hex')}\nPUBLIC_URL=http://127.0.0.1:8081\nCORS_ORIGIN=http://127.0.0.1:8081\n`;
  fs.writeFileSync(path.join(root,'backend.env'),envText,{mode:0o600});
  process.env.DOTENV_CONFIG_PATH=path.join(root,'backend.env');
  require('dotenv').config({path:process.env.DOTENV_CONFIG_PATH,override:true});
  require('ts-node/register/transpile-only');
  try{
   if(!(await c.query("select 1 from market_orders where user_id=$1 and request_key='DASHBOARD-TEST-SHOP-ORDER'",[uid(9)])).rows.length){
    const variant=(await c.query('select v.*,p.version as product_version from market_variants v join market_products p on p.id=v.product_id where v.id=$1',[uid(601)])).rows[0];
    await require('../src/modules/marketplace/marketplace.service').checkout(uid(9),{request_key:'DASHBOARD-TEST-SHOP-ORDER',expected_total:1500,phone:'96899000009',address:'',lines:[{variant_id:variant.id,quantity:1,version:variant.version,product_version:variant.product_version}],fulfilment:{[uid(101)]:'pickup'}});
   }
  }finally{await require('../src/db/pool').pool.end();}
  console.log(`Created/verified ${report.length} test users. Credentials: .artifacts/dashboard-sandbox/test-users.json`);
 }catch(e){await c.query('rollback').catch(()=>{});throw e;}finally{await c.end();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
