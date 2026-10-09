// Browser + API smoke tests against the dedicated local dashboard sandbox only.
const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../../.artifacts/dashboard-sandbox');
process.env.DOTENV_CONFIG_PATH=path.join(root,'backend.env');
require('dotenv').config({path:process.env.DOTENV_CONFIG_PATH});
if(!['127.0.0.1','localhost'].includes(new URL(process.env.DATABASE_URL).hostname))throw Error('Local sandbox required');
require('ts-node/register/transpile-only');
const {pool}=require('../src/db/pool');
const accounts=JSON.parse(fs.readFileSync(path.join(root,'test-users.json'),'utf8')).accounts;
async function main(){
 assert.ok((await pool.query("select to_regclass('dashboard_sandbox.marker') as name")).rows[0].name);
 const server=require('../src/app').createApp().listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const base=`http://127.0.0.1:${server.address().port}`;let browser;
 try{
  for(const account of accounts){
   const login=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:account.email,password:account.password})});
   const session=await login.json();assert.equal(login.status,200,`${account.kind}: ${JSON.stringify(session)}`);
   const headers={Authorization:`Bearer ${session.access_token}`};
   const endpoint=['host','investor'].includes(account.kind)?'/api/host/summary':account.kind==='operator'?'/api/operator/me':account.kind==='cafe'?'/api/cafe/staff/venues':account.kind==='shop'||account.kind==='service'?'/api/marketplace/portal':'/api/profile';
   const res=await fetch(base+endpoint,{headers});const data=await res.json();assert.equal(res.status,200,`${account.kind}: ${JSON.stringify(data)}`);
   if(account.kind==='cafe')assert.equal(data.length,1);
   if(account.kind==='operator')assert.ok(data.van);
   console.log(`PASS ${account.kind} login and scoped dashboard data`);
  }
  const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/MD Ashraf/.agents/skills/gstack/node_modules/playwright');
  browser=await chromium.launch({headless:true});
  for(const kind of ['admin','superadmin','shop','service']){
   const account=accounts.find(a=>a.kind===kind);const context=await browser.newContext();const page=await context.newPage();const errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.goto(base+account.dashboard);await page.locator('#login-form input[name=email]').fill(account.email);await page.locator('#login-form input[name=password]').fill(account.password);
   await page.locator('#login-form button[type=submit]').click();await page.locator('#workspace').waitFor({state:'visible'});
   if(kind==='admin'||kind==='superadmin'){
    await page.locator('a[href="#attention"]').click();await page.locator('#queue-section').waitFor();
    assert.equal(await page.locator('#page-error').isVisible(),false);
    await page.screenshot({path:path.join(root,kind+'-inbox.png'),fullPage:true});
    if(kind==='superadmin'){await page.locator('a[href="#health"]').click();await page.getByRole('heading',{name:'Configuration status',exact:true}).waitFor();}
    else assert.equal(await page.locator('a[href="#health"]').count(),0);
   }else if(kind==='service'){
    await page.locator('#navigation a[href="#calendar"]').click();await page.locator('#slot-create').waitFor();await page.locator('#available-slots table').waitFor();
    const day=new Date(Date.now()+3*86400000).toISOString().slice(0,10);
    await page.locator('#slot-create input[name=day]').fill(day);await page.locator('#slot-create input[name=time]').fill('10:30');
    await page.locator('#slot-create input[name=capacity]').fill('2');await page.locator('#slot-create button').click();
    await page.getByText('Availability saved.',{exact:true}).waitFor();
    assert.equal(await page.locator('#calendar-error').textContent(),'');
    await page.screenshot({path:path.join(root,'service-calendar.png'),fullPage:true});
    await page.getByRole('button',{name:'Save',exact:true}).first().click();
    const available=await context.request.get(base+'/api/seller/marketplace/products/da500000-0000-4000-8000-000000000502/slots/manage');
    const created=(await available.json()).find(s=>s.starts_at===new Date(day+'T10:30:00+04:00').toISOString());
    if(created)assert.equal((await context.request.delete(base+'/api/seller/marketplace/slots/'+created.id,{headers:{Origin:base}})).status(),204);
   }else{
    await page.getByRole('heading',{name:'Action centre',exact:true}).waitFor();
    assert.equal(await page.locator('a[href="#calendar"]').count(),0);
    await page.screenshot({path:path.join(root,'shop-overview.png'),fullPage:true});
    await page.locator('#navigation a[href="#stock"]').click();await page.locator('#bulk-stock').waitFor();
    const stock=page.locator('#bulk-stock input[type=number]').first();await stock.fill(String(Number(await stock.inputValue())+1));
    await page.locator('#bulk-stock button[type=submit]').click();await page.getByText('Stock saved.',{exact:true}).waitFor();
    await page.locator('#navigation a[href="#listings"]').click();await page.getByRole('button',{name:'Duplicate',exact:true}).first().click();await page.locator('#editor').waitFor({state:'visible'});
    const createdResponse=page.waitForResponse(r=>r.request().method()==='POST'&&/\/vendors\/[^/]+\/products$/.test(new URL(r.url()).pathname));
    await page.locator('#editor-form button[type=submit]').click();const creation=await createdResponse;assert.equal(creation.status(),201);
    const duplicate=await creation.json();assert.equal(duplicate.status,'pending');await page.locator('#editor').waitFor({state:'hidden'});
    await pool.query('delete from market_variants where product_id=$1',[duplicate.id]);await pool.query('delete from market_products where id=$1',[duplicate.id]);
    await page.locator('#navigation a[href="#payouts"]').click();await page.getByRole('heading',{name:'Settlement balance',exact:true}).waitFor();
   }
   await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(root,kind+'-mobile.png'),fullPage:true});
   assert.deepEqual(errors,[],`${kind} browser errors`);console.log(`PASS ${kind} browser dashboard, controls and mobile layout`);await context.close();
  }
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));await pool.end();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
