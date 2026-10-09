// Isolated real-PostgreSQL API tests. Never reads project credentials or application data.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const fs=require('node:fs');const path=require('node:path');const os=require('node:os');const net=require('node:net');
const {randomUUID}=require('node:crypto');
const {Pool}=require('pg');

test('marketplace API and money invariants',async t=>{
 const bin=process.env.PG_BIN||(process.platform==='win32'?'C:/Program Files/PostgreSQL/18/bin':'/usr/bin');
 const dir=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'gowatt-market-test-'));
 const data=path.join(dir,'data');
 const port=await new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
 const run=(name,args)=>execFileSync(path.join(bin,name+(process.platform==='win32'?'.exe':'')),args,{windowsHide:true,stdio:'ignore',timeout:60000});
 let pool,appPool,server,started=false;
 try{
  run('initdb',['-D',data,'-U','postgres','--auth=trust','--encoding=UTF8','--no-locale']);
  run('pg_ctl',['-D',data,'-l',path.join(dir,'postgres.log'),'-o',`-h 127.0.0.1 -p ${port}`,'-w','start']);started=true;
  const url=`postgresql://postgres@127.0.0.1:${port}/postgres`;
  pool=new Pool({connectionString:url});
  await pool.query(`create table profiles(id uuid primary key,role text not null default 'customer',is_active boolean not null default true,wallet_balance numeric(12,3) not null default 100,held_balance numeric(12,3) not null default 0);
   create table wallet_transactions(id uuid default gen_random_uuid(),user_id uuid,type text,amount numeric(12,3),balance_after numeric(12,3),description text,reference_id text);
   create schema auth;create table auth.users(id uuid primary key,email text);`);
  const migration=fs.readFileSync(path.join(__dirname,'../sql/backend-marketplace.sql'),'utf8');
  await pool.query(migration);await pool.query(migration);
  const sellersMigration=fs.readFileSync(path.join(__dirname,'../sql/backend-marketplace-sellers.sql'),'utf8');
  await pool.query(sellersMigration);await pool.query(sellersMigration);
  await pool.query(fs.readFileSync(path.join(__dirname,'../sql/backend-seller-portal.sql'),'utf8'));
  await pool.query(fs.readFileSync(path.join(__dirname,'../sql/backend-dashboard.sql'),'utf8'));
  await pool.query(`alter table profiles add column full_name text default 'Test user';
   alter table auth.users add column encrypted_password text;
   create table stations(id uuid primary key,name text,name_ar text,address text,latitude numeric,longitude numeric,status text,total_connectors int,governorate text,available_connectors int);
   insert into stations values(gen_random_uuid(),'Test venue','موقع اختبار','Test address',23,58,'available',2);`);
  process.env.DOTENV_CONFIG_PATH=path.join(dir,'no-env');process.env.DATABASE_URL=url;process.env.NODE_ENV='test';
  process.env.JWT_ACCESS_SECRET='test-access-secret-marketplace-only';process.env.JWT_REFRESH_SECRET='test-refresh-secret-marketplace-only';
  require('ts-node/register/transpile-only');
  appPool=require('../src/db/pool').pool;
  const {signAccessToken}=require('../src/lib/jwt');
  const express=require('express');const {attachUser}=require('../src/middleware/auth');const {errorHandler}=require('../src/middleware/error');
  const app=express();app.use(express.json());app.use(attachUser);app.use('/api/marketplace',require('../src/modules/marketplace/marketplace.routes').default);app.use('/api/dashboard',require('../src/modules/dashboard/dashboard.routes').default);app.use('/api/seller',require('../src/modules/seller/seller.routes').default);app.use(errorHandler);
  server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}/api/marketplace`;
  const user=randomUUID(),other=randomUUID(),admin=randomUUID(),owner=randomUUID();
  for(const id of [user,other,admin,owner])await pool.query('insert into profiles(id,role) values($1,$2)',[id,id===admin?'admin':'customer']);
  async function api(method,p,body,as=user,expected=200){const r=await fetch(base+p,{method,headers:{'Content-Type':'application/json',...(as?{Authorization:`Bearer ${signAccessToken(as,'customer')}`}:{})},body:body===undefined?undefined:JSON.stringify(body)});const data=await r.json();assert.equal(r.status,expected,`${method} ${p}: ${JSON.stringify(data)}`);return data;}
  const vendor=(await api('POST','/vendors',{name:'Test vendor',name_ar:'تاجر اختبار',cr_number:'TEST',contact_phone:'96890000000',address:'Test location',bank_details:'Test only'},owner,201));
  const config={status:'approved',commission_bps:1000,pickup_enabled:true,delivery_enabled:false,delivery_fee:0,delivery_area:''};
  const productBody={category_id:'cables',kind:'physical',name:'Test cable',name_ar:'كابل اختبار',description:'Description',description_ar:'وصف',image_url:'https://example.invalid/product.jpg',warranty:'One year',warranty_ar:'سنة',return_days:7,variants:[{sku:'TEST-1',name:'Standard',name_ar:'قياسي',price:2500,stock:10}]};
  let product,variant,order;
  await t.test('vendor cannot approve itself or set commission',async()=>{await api('PATCH',`/admin/vendors/${vendor.id}`,config,owner,403);await api('PATCH',`/admin/vendors/${vendor.id}`,config,admin);});
  await t.test('seller accounts are unique and business profiles remain owner-scoped',async()=>{
   await api('POST','/vendors',{name:'Duplicate',name_ar:'Duplicate',cr_number:'TEST',contact_phone:'96890000000',address:'Test',bank_details:'Test'},owner,409);
   const profile={contact_phone:'96890000001',email:'seller@example.invalid',address:'New address',about:'Seller profile',about_ar:'Seller profile',bank_details:'Test only'};
   await api('PATCH',`/vendors/${vendor.id}`,profile,other,403);
   const updated=await api('PATCH',`/vendors/${vendor.id}`,profile,owner);
   assert.equal(updated.email,profile.email);assert.equal(updated.seller_type,'both');
  });
  await t.test('product and service categories cannot be mixed',async()=>{
   await api('POST',`/vendors/${vendor.id}/products`,{...productBody,category_id:'installation'},owner,400);
   await api('POST',`/vendors/${vendor.id}/products`,{...productBody,kind:'service',duration_minutes:60},owner,400);
  });
  await t.test('listing remains private until admin moderation',async()=>{
   product=await api('POST',`/vendors/${vendor.id}/products`,productBody,owner,201);
   assert.equal((await api('GET','/catalog',undefined,null)).length,0);
   await api('GET',`/products/${product.id}`,undefined,null,404);
   await api('POST',`/admin/products/${product.id}/moderate`,{status:'published',note:'',version:1,images_checked:true},admin);
   product=await api('GET',`/products/${product.id}`,undefined,null);variant=product.variants[0];
   assert.equal((await api('GET','/catalog',undefined,null)).length,1);
  });
  await t.test('cross-vendor product mutation denied',async()=>{await api('PUT',`/products/${product.id}`,{...productBody,version:product.version,variants:[variant]},other,403);});
  const checkout=(key,qty=1,total=2500,as=user,expected=200)=>api('POST','/checkout',{request_key:key,expected_total:total,phone:'96890000000',address:'',lines:[{variant_id:variant.id,quantity:qty,version:variant.version,product_version:product.version}],fulfilment:{[vendor.id]:'pickup'}},as,expected);
  await t.test('held wallet funds cannot be spent',async()=>{
   await pool.query('update profiles set held_balance=99 where id=$1',[user]);await checkout('held-funds-key-0001',1,2500,user,402);
   assert.equal((await pool.query('select count(*)::int as n from market_orders')).rows[0].n,0);
   await pool.query('update profiles set held_balance=0 where id=$1',[user]);
  });
  await t.test('concurrent identical checkouts debit exactly once',async()=>{
   const [a,b]=await Promise.all([checkout('same-request-key-0001'),checkout('same-request-key-0001')]);assert.equal(a.id,b.id);order=a;
   assert.equal(Number((await pool.query('select wallet_balance from profiles where id=$1',[user])).rows[0].wallet_balance),97.5);
   assert.equal((await pool.query('select stock from market_variants where id=$1',[variant.id])).rows[0].stock,9);
  });
  await t.test('a reused idempotency key rejects a different basket',async()=>{await checkout('same-request-key-0001',2,5000,user,409);});
  await t.test('server rejects tampered totals and stock shortages',async()=>{await checkout('wrong-total-key-0001',1,1,user,409);await checkout('too-many-key-000001',99,247500,user,409);});
  await t.test('order privacy and fulfilment transition validation',async()=>{
   await api('GET',`/orders/${order.id}`,undefined,other,404);const detail=await api('GET',`/orders/${order.id}`);
   await api('POST',`/fulfilments/${detail.fulfilments[0].id}/status`,{status:'completed'},owner,409);
   await api('POST',`/fulfilments/${detail.fulfilments[0].id}/status`,{status:'accepted'},other,403);
  });
  await t.test('refund review is admin-only and credits once',async()=>{
   const detail=await api('GET',`/orders/${order.id}`);const ret=await api('POST','/returns',{item_id:detail.items[0].id,reason:'Cancel test order'});
   await api('POST',`/admin/returns/${ret.id}`,{status:'approved',resolution:'Approved'},owner,403);
   await api('POST',`/admin/returns/${ret.id}`,{status:'approved',resolution:'Approved'},admin);
   await Promise.all([api('POST',`/admin/returns/${ret.id}`,{status:'refunded',resolution:'Refund'},admin),api('POST',`/admin/returns/${ret.id}`,{status:'refunded',resolution:'Refund'},admin)]);
   assert.equal(Number((await pool.query('select wallet_balance from profiles where id=$1',[user])).rows[0].wallet_balance),100);
  });
  await t.test('concurrent buyers cannot oversell the last item',async()=>{
   await pool.query('update market_variants set stock=1 where id=$1',[variant.id]);
   variant=(await pool.query('select * from market_variants where id=$1',[variant.id])).rows[0];
   const payload={expected_total:2500,phone:'96890000000',address:'',lines:[{variant_id:variant.id,quantity:1,version:variant.version,product_version:product.version}],fulfilment:{[vendor.id]:'pickup'}};
   const results=await Promise.all([user,other].map(async who=>{const r=await fetch(base+'/checkout',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${signAccessToken(who,'customer')}`},body:JSON.stringify({...payload,request_key:randomUUID()})});return r.status;}));
   assert.deepEqual(results.sort(),[200,409]);assert.equal((await pool.query('select stock from market_variants where id=$1',[variant.id])).rows[0].stock,0);
  });
  await t.test('service quote acceptance books a slot once and debits once',async()=>{
   const service=await api('POST',`/vendors/${vendor.id}/products`,{...productBody,kind:'service',category_id:'maintenance',duration_minutes:60,price_basis:'quote',variants:[{...productBody.variants[0],sku:'TEST-SERVICE'}]},owner,201);
   await api('POST',`/admin/products/${service.id}/moderate`,{status:'published',note:'',version:1,images_checked:true},admin);
   const slot=await api('POST',`/products/${service.id}/slots`,{starts_at:new Date(Date.now()+864e5).toISOString(),capacity:1},owner);
   const vehicle=await api('POST','/vehicles',{make:'Test',model:'EV',year:2026,connector:'Type2'},user,201);
   const a=await api('POST','/appointments',{product_id:service.id,vehicle_id:vehicle.id,slot_id:slot.id,request_key:'service-request-0001'});
   await api('POST',`/appointments/${a.id}/vendor`,{action:'quote',price:3000,notes:'Fixed scope'},owner);
   const updated=(await api('GET','/appointments'))[0];
   await api('POST',`/appointments/${a.id}/pay`,{request_key:'service-pay-0000001',expected_price:2000,quote_version:updated.quote_version},user,409);
   const payment={request_key:'service-pay-0000001',expected_price:3000,quote_version:updated.quote_version};
   const [a1,a2]=await Promise.all([api('POST',`/appointments/${a.id}/pay`,payment),api('POST',`/appointments/${a.id}/pay`,payment)]);
   assert.equal(a1.id,a2.id);assert.equal((await pool.query('select booked from market_slots where id=$1',[slot.id])).rows[0].booked,1);
   await api('POST',`/appointments/${a.id}/vendor`,{action:'complete'},owner,409);
   await api('POST',`/appointments/${a.id}/vendor`,{action:'start'},owner);
   await api('POST',`/appointments/${a.id}/vendor`,{action:'complete',notes:'Work complete'},owner);
  });
  let multi, secondVendor, secondProduct;
  await t.test('one checkout splits vendors, includes configured fees and snapshots commission',async()=>{
   const owner2=randomUUID();await pool.query('insert into profiles(id) values($1)',[owner2]);
   secondVendor=await api('POST','/vendors',{name:'Second',name_ar:'ثاني',cr_number:'TEST2',contact_phone:'96890000001',address:'Test2',bank_details:'Test'},owner2,201);
   await api('PATCH',`/admin/vendors/${secondVendor.id}`,{...config,delivery_enabled:true,delivery_fee:750,delivery_area:'Test area',commission_bps:1500},admin);
   const p=await api('POST',`/vendors/${secondVendor.id}/products`,{...productBody,variants:[{...productBody.variants[0],sku:'TEST-SECOND',price:4000}]},owner2,201);
   await api('POST',`/admin/products/${p.id}/moderate`,{status:'published',note:'',version:1,images_checked:true},admin);
   secondProduct=await api('GET',`/products/${p.id}`,undefined,null);
   await pool.query('update market_variants set stock=10 where id=$1',[variant.id]);
   product=await api('GET',`/products/${product.id}`,undefined,null);variant=product.variants[0];
   const before=Number((await pool.query('select wallet_balance from profiles where id=$1',[user])).rows[0].wallet_balance);
   multi=await api('POST','/checkout',{request_key:'mixed-checkout-0001',phone:'96890000000',address:'Test area',expected_total:7250,fulfilment:{[vendor.id]:'pickup',[secondVendor.id]:'delivery'},lines:[{variant_id:variant.id,quantity:1,version:variant.version,product_version:product.version},{variant_id:secondProduct.variants[0].id,quantity:1,version:1,product_version:secondProduct.version}]});
   const detail=await api('GET',`/orders/${multi.id}`);assert.equal(detail.fulfilments.length,2);assert.deepEqual(detail.items.map(i=>i.commission_bps).sort((a,b)=>a-b),[1000,1500]);
   assert.equal(Number((await pool.query('select wallet_balance from profiles where id=$1',[user])).rows[0].wallet_balance),before-7.25);
   await api('PATCH',`/admin/vendors/${secondVendor.id}`,{...config,commission_bps:2000},admin);
   assert.equal((await api('GET',`/orders/${multi.id}`)).items.find(i=>i.product_id===secondProduct.id).commission_bps,1500);
  });
  await t.test('unshipped mixed-vendor refunds return each delivery fee exactly once',async()=>{
   const detail=await api('GET',`/orders/${multi.id}`);
   for(const item of detail.items){const r=await api('POST','/returns',{item_id:item.id,reason:'Test return'});await api('POST',`/admin/returns/${r.id}`,{status:'approved',resolution:'Test'},admin);await api('POST',`/admin/returns/${r.id}`,{status:'refunded',resolution:'Test'},admin);}
   const updated=await api('GET',`/orders/${multi.id}`);assert.equal(updated.refunded_total,7250);assert.equal(updated.status,'refunded');
  });
  await t.test('stock edits reject a stale version after a purchase',async()=>{
   await api('POST',`/products/${product.id}/stock`,{variant_id:variant.id,version:variant.version,stock:100},owner,409);
  });
  await t.test('reviews require completed purchase and do not accept a stranger',async()=>{
   await api('POST','/reviews',{product_id:secondProduct.id,rating:5,comment:'Test'},other,400);
  });
  await t.test('settlement excludes orders that are refunded or incomplete',async()=>{
   const detail=await api('GET',`/orders/${multi.id}`);
   await api('POST',`/admin/vendors/${vendor.id}/settlements`,{reference:'test-bank-ref',item_ids:[detail.items.find(i=>i.product_id===product.id).id]},admin,409);
  });
  await t.test('stale listings disappear from the public catalog',async()=>{
   await pool.query("update market_products set updated_at=now()-interval '31 days' where id=$1",[secondProduct.id]);await api('GET',`/products/${secondProduct.id}`,undefined,null,404);
  });
  await t.test('all new tables have row-level security enabled',async()=>{const rows=(await pool.query("select relname from pg_class where relname like 'market_%' and relkind='r' and not relrowsecurity")).rows;assert.deepEqual(rows,[]);});
  await t.test('availability management enforces ownership and preserves booked slots',async()=>{
   const service=(await pool.query("select id from market_products where kind='service' and vendor_id=$1 limit 1",[vendor.id])).rows[0];
   const created=await api('POST',`/products/${service.id}/slots`,{starts_at:new Date(Date.now()+7*86400000).toISOString(),capacity:2},owner);
   await api('GET',`/products/${service.id}/slots/manage`,undefined,other,403);
   assert.ok((await api('GET',`/products/${service.id}/slots/manage`,undefined,owner)).some(s=>s.id===created.id));
   await api('PATCH',`/slots/${created.id}`,{capacity:3},other,403);
   assert.equal((await api('PATCH',`/slots/${created.id}`,{capacity:3},owner)).capacity,3);
   await pool.query('update market_slots set booked=2 where id=$1',[created.id]);
   await api('PATCH',`/slots/${created.id}`,{capacity:1},owner,409);
   await api('DELETE',`/slots/${created.id}`,undefined,owner,409);
   await pool.query('update market_slots set booked=0 where id=$1',[created.id]);
   const r=await fetch(base+`/slots/${created.id}`,{method:'DELETE',headers:{Authorization:`Bearer ${signAccessToken(owner,'customer')}`}});assert.equal(r.status,204);
  });
  await t.test('bulk stock changes are atomic, versioned and vendor-scoped',async()=>{
   const before=(await pool.query('select * from market_variants where id=$1',[variant.id])).rows[0];
   const update={id:before.id,version:before.version,stock:before.stock+2};
   await api('POST',`/vendors/${vendor.id}/stock`,{variants:[update]},other,403);
   await api('POST',`/vendors/${vendor.id}/stock`,{variants:[update,{id:randomUUID(),version:1,stock:1}]},owner,409);
   assert.equal((await pool.query('select stock from market_variants where id=$1',[variant.id])).rows[0].stock,before.stock);
   await api('POST',`/vendors/${vendor.id}/stock`,{variants:[update]},owner);
   await api('POST',`/vendors/${vendor.id}/stock`,{variants:[update]},owner,409);
  });
  await t.test('seller balances exclude refunds and expose only eligible untransferred items',async()=>{
   await api('GET',`/vendors/${vendor.id}/finance`,undefined,other,403);
   const appointment=(await pool.query("select a.* from market_appointments a join market_products p on p.id=a.product_id where p.vendor_id=$1 and a.status='completed' limit 1",[vendor.id])).rows[0];
   await pool.query("update market_fulfilments set completed_at=now()-interval '31 days' where order_id=$1",[appointment.order_id]);
   const balance=await api('GET',`/vendors/${vendor.id}/finance`,undefined,owner);
   assert.equal(Number(balance.eligible_baisa),2700);assert.equal(Number(balance.paid_baisa),0);
  });
  await t.test('seller cookie sessions reject foreign origins and suspended accounts',async()=>{
   const password='Seller-test-9381';const encrypted=await require('../src/lib/password').hashPassword(password);
   await pool.query('insert into auth.users(id,email,encrypted_password) values($1,$2,$3)',[owner,'seller-login@example.invalid',encrypted]);
   const origin=`http://127.0.0.1:${server.address().port}`;
   async function seller(path,body,cookie,expected=200,requestOrigin=origin){
    const r=await fetch(origin+'/api/seller'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',Origin:requestOrigin,...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined});
    const data=await r.json();assert.equal(r.status,expected,JSON.stringify(data));return {data,cookie:r.headers.get('set-cookie')?.split(';')[0],headers:r.headers};
   }
   await seller('/session',undefined,undefined,401);
   await seller('/login',{email:'seller-login@example.invalid',password},undefined,403,'https://untrusted.invalid');
   const login=await seller('/login',{email:'seller-login@example.invalid',password});
   assert.match(login.headers.get('set-cookie'),/HttpOnly/i);assert.match(login.headers.get('set-cookie'),/SameSite=Strict/i);
   assert.equal((await seller('/marketplace/portal',undefined,login.cookie)).data.vendors[0].id,vendor.id);
   await pool.query('update profiles set is_active=false where id=$1',[owner]);
   await seller('/session',undefined,login.cookie,401);
   await pool.query('update profiles set is_active=true where id=$1',[owner]);
   await seller('/logout',{},login.cookie);await seller('/session',undefined,login.cookie,401);
  });
  await t.test('dashboard cookie sessions, CSRF, role changes, and summary projections',async()=>{
   const superadmin=randomUUID();await pool.query("insert into profiles(id,role) values($1,'superadmin')",[superadmin]);
   const password='Dashboard-test-9381';const encrypted=await require('../src/lib/password').hashPassword(password);
   for(const [id,email] of [[admin,'admin@example.invalid'],[superadmin,'super@example.invalid'],[user,'customer@example.invalid']])await pool.query('insert into auth.users(id,email,encrypted_password) values($1,$2,$3)',[id,email,encrypted]);
   const origin=`http://127.0.0.1:${server.address().port}`;
   async function dash(path,body,cookie,expected=200,requestOrigin=origin){const r=await fetch(origin+'/api/dashboard'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',Origin:requestOrigin,...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined});const data=await r.json();assert.equal(r.status,expected,JSON.stringify(data));return {data,cookie:r.headers.get('set-cookie')?.split(';')[0],headers:r.headers};}
   await dash('/session',undefined,undefined,401);
   await dash('/login',{email:'customer@example.invalid',password},undefined,401);
   await dash('/login',{email:'admin@example.invalid',password},undefined,403,'https://untrusted.invalid');
   const adminLogin=await dash('/login',{email:'admin@example.invalid',password});
   await pool.query("update market_vendors set status='pending' where id=$1",[vendor.id]);
   const inbox=(await dash('/attention',undefined,adminLogin.cookie)).data;
   assert.ok(inbox.items.some(x=>x.resource==='vendors'&&x.id===vendor.id));
   assert.ok(inbox.unavailable.includes('support'));
   const filtered=(await dash('/attention?resource=vendors',undefined,adminLogin.cookie)).data;
   assert.ok(filtered.items.every(x=>x.resource==='vendors'));assert.equal(filtered.counts.vendors,1);
   await dash('/attention?resource=invalid',undefined,adminLogin.cookie,400);
   const pendingVendors=(await dash('/records/vendors?status=pending',undefined,adminLogin.cookie)).data;
   assert.equal(pendingVendors.rows.length,1);assert.equal(pendingVendors.rows[0].id,vendor.id);
   await pool.query("update market_vendors set status='approved' where id=$1",[vendor.id]);
   assert.match(adminLogin.headers.get('set-cookie'),/HttpOnly/i);assert.match(adminLogin.headers.get('set-cookie'),/SameSite=Strict/i);
   await dash('/administrators',undefined,adminLogin.cookie,403);
   const summary=(await dash('/overview',undefined,adminLogin.cookie)).data;assert.equal(summary.chargers[0].name,'Test venue');assert.equal('customer_name' in summary.chargers[0],false);
   assert.equal((await dash('/records/chargers',undefined,adminLogin.cookie)).data.rows[0].name,'Test venue');
   await dash('/records/not-a-section',undefined,adminLogin.cookie,404);
   const superLogin=await dash('/login',{email:'super@example.invalid',password});
   await dash('/administrators',undefined,superLogin.cookie);
   await dash('/administrators',{email:'super@example.invalid',role:'customer'},superLogin.cookie,400);
   await dash('/administrators',{email:'admin@example.invalid',role:'customer'},superLogin.cookie);
   await dash('/session',undefined,adminLogin.cookie,401);
   await dash('/logout',{},superLogin.cookie);
   await dash('/session',undefined,superLogin.cookie,401);
  });
 }finally{
  if(server)await new Promise(r=>server.close(r));if(appPool)await appPool.end();if(pool)await pool.end();
  if(started)run('pg_ctl',['-D',data,'-m','immediate','-w','stop']);
  const resolved=fs.realpathSync(dir);if(resolved.startsWith(fs.realpathSync(os.tmpdir())+path.sep)&&path.basename(resolved).startsWith('gowatt-market-test-'))fs.rmSync(resolved,{recursive:true,force:true});
 }
});
