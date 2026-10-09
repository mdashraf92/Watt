'use strict';
let calendarGeneration = 0;
function renderStock(){
 const rows=dash.products.filter(p=>p.kind==='physical').flatMap(p=>(p.variants||[]).map(v=>({...v,product_name:nm(p)})));
 $('page').innerHTML=`<section class="card"><h3>${esc(tr('Update stock together','تحديث المخزون معاً'))}</h3><p>${esc(tr('All changes save together. If stock changed since you opened this page, refresh before trying again.','تُحفظ التغييرات معاً. إذا تغير المخزون منذ فتح الصفحة، حدّثها قبل المحاولة مجدداً.'))}</p><form id="bulk-stock"><table><thead><tr>${[tr('Product','المنتج'),tr('Variant / SKU','النوع / الرمز'),tr('Stock','المخزون')].map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody>${rows.map(v=>`<tr><td>${esc(v.product_name)}</td><td>${esc(nm(v))}<small>${esc(v.sku)}</small></td><td><input name="${v.id}" type="number" min="0" max="1000000" step="1" value="${v.stock}" required aria-label="${esc(v.product_name+' '+v.sku)}"></td></tr>`).join('')}</tbody></table><button type="submit" class="primary" ${rows.length?'':'disabled'}>${esc(tr('Save stock changes','حفظ تغييرات المخزون'))}</button></form></section>`;
 $('bulk-stock').onsubmit=e=>{e.preventDefault();const form=new FormData(e.target);const variants=rows.map(v=>({id:v.id,version:v.version,stock:Number(form.get(v.id))})).filter(v=>v.stock!==rows.find(r=>r.id===v.id).stock);
  if(!variants.length)return toast(tr('No changes to save.','لا توجد تغييرات للحفظ.'));
  if(variants.length>100)return showError(tr('Save at most 100 variants at a time.','احفظ 100 نوع كحد أقصى في المرة الواحدة.'));
  void act(()=>m(`/vendors/${vendor.id}/stock`,'POST',{variants}),tr('Stock saved.','تم حفظ المخزون.'));
 };
}
const oldSellerListings=renderListings;
renderListings=function(){oldSellerListings();document.querySelectorAll('[data-edit]').forEach(edit=>{const button=document.createElement('button');button.className='secondary small';button.textContent=tr('Duplicate','نسخ');button.onclick=()=>{const source=dash.products.find(p=>p.id===edit.dataset.edit);const copy={...source,id:undefined,version:undefined,name:source.name+' (copy)',variants:(source.variants||[]).map(v=>({...v,id:undefined,sku:v.sku.slice(0,50)+'-COPY-'+crypto.randomUUID().slice(0,8)}))};openEditor(copy);};edit.after(button);});};
const oldSellerPayouts=renderPayouts;
renderPayouts=function(){oldSellerPayouts();const vendorId=vendor.id;
 void m(`/vendors/${vendorId}/finance`).then(data=>{if(vendor?.id!==vendorId||location.hash!=='#payouts')return;const section=document.createElement('section');section.className='card';section.innerHTML=`<h3>${esc(tr('Settlement balance','رصيد التسوية'))}</h3><div class="stats"><div class="stat good"><b>${esc(omr(data.eligible_baisa))}</b><span>${esc(tr('Eligible for settlement','مؤهل للتسوية'))}</span></div><div class="stat"><b>${esc(omr(data.pending_baisa))}</b><span>${esc(tr('Awaiting fulfilment, return window or review','بانتظار التجهيز أو فترة الإرجاع أو المراجعة'))}</span></div></div><p>${esc(tr('Balances exclude refunded and already settled items. Bank transfers are recorded by Go Watt after completion.','تستثني الأرصدة العناصر المستردة والمسواة. تسجل Go Watt التحويلات البنكية بعد إتمامها.'))}</p>`;$('page').prepend(section);}).catch(e=>showError(e.message));
};
function omanDay(date = new Date()) { return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Muscat',year:'numeric',month:'2-digit',day:'2-digit'}).format(date); }
function renderCalendar() {
  const key = 'gw-calendar:' + user.id + ':' + vendor.id;
  let saved={};try{saved=JSON.parse(localStorage.getItem(key)||'{}');}catch{}
  const services=dash.products.filter(p=>p.kind==='service');
  $('page').innerHTML=`<div class="grid"><section class="card"><h3>${esc(tr('Daily bookings','الحجوزات اليومية'))}</h3><label>${esc(tr('Day (Oman time)','اليوم (بتوقيت عُمان)'))}<input id="calendar-day" type="date" value="${esc(saved.day||omanDay())}"></label><div id="calendar-bookings"></div></section><section class="card"><h3>${esc(tr('Manage availability','إدارة التوفر'))}</h3><label>${esc(tr('Service','الخدمة'))}<select id="calendar-service">${services.map(p=>`<option value="${esc(p.id)}" ${p.id===saved.service?'selected':''}>${esc(nm(p))}</option>`).join('')}</select></label><form id="slot-create"><div class="row"><label>${esc(tr('Date','التاريخ'))}<input name="day" type="date" min="${omanDay()}" required></label><label>${esc(tr('Start time (Oman)','وقت البدء (عُمان)'))}<input name="time" type="time" required></label><label>${esc(tr('Places','عدد الأماكن'))}<input name="capacity" type="number" min="1" max="50" value="1" required></label></div><button class="primary" type="submit" ${services.length?'':'disabled'}>${esc(tr('Add available time','إضافة موعد متاح'))}</button></form><p class="fine">${esc(tr('Booked places cannot be removed. Slots with appointment history cannot be deleted.','لا يمكن إزالة الأماكن المحجوزة أو حذف المواعيد ذات سجل حجوزات.'))}</p><div id="available-slots"></div><p id="calendar-error" role="alert" class="error"></p></section></div>`;
  const remember=()=>localStorage.setItem(key,JSON.stringify({day:$('calendar-day').value,service:$('calendar-service').value}));
  const bookings=()=>{
    remember();const rows=dash.appointments.filter(a=>a.starts_at&&omanDay(new Date(a.starts_at))===$('calendar-day').value&&a.status!=='cancelled');
    $('calendar-bookings').innerHTML=rows.length?rows.map(a=>`<article class="card"><strong>${esc(nm(a))}</strong> ${badge(a.status)}<p>${esc(when(a.starts_at))} · ${esc([a.make,a.model,a.year].filter(Boolean).join(' '))}</p><p>${esc([a.customer_name,a.customer_phone].filter(Boolean).join(' ? '))}</p><p>${esc(a.customer_notes||'')}</p><a href="#bookings">${esc(tr('Open booking actions','فتح إجراءات الحجز'))}</a></article>`).join(''):`<p>${esc(tr('No bookings on this day.','لا توجد حجوزات في هذا اليوم.'))}</p>`;
  };
  async function slots(){
    const run=++calendarGeneration;remember();const product=$('calendar-service').value;
    if(!product){$('available-slots').textContent=tr('Create a service listing first.','أضف خدمة أولاً.');return;}
    try{const rows=await m(`/products/${product}/slots/manage`);if(run!==calendarGeneration||!$('available-slots'))return;
      $('available-slots').innerHTML=rows.length?`<table><thead><tr><th>${tr('Start','البدء')}</th><th>${tr('Booked','المحجوز')}</th><th>${tr('Capacity','السعة')}</th><th>${tr('Actions','الإجراءات')}</th></tr></thead><tbody>${rows.map(s=>`<tr><td>${esc(when(s.starts_at))}</td><td>${s.booked}</td><td><input type="number" min="${Math.max(1,s.booked)}" max="50" value="${s.capacity}" data-capacity="${esc(s.id)}" aria-label="${esc(tr('Capacity','السعة'))}"></td><td><button data-slot-save="${s.id}">${tr('Save','حفظ')}</button> <button data-slot-delete="${s.id}" ${s.booked?'disabled':''}>${tr('Remove','إزالة')}</button></td></tr>`).join('')}</tbody></table>`:`<p>${tr('No future availability.','لا توجد مواعيد مستقبلية.')}</p>`;
      document.querySelectorAll('[data-slot-save]').forEach(b=>b.onclick=()=>runAction(b,()=>m(`/slots/${b.dataset.slotSave}`,'PATCH',{capacity:Number(document.querySelector(`[data-capacity="${b.dataset.slotSave}"]`).value)})));
      document.querySelectorAll('[data-slot-delete]').forEach(b=>b.onclick=()=>{if(confirm(tr('Remove this available time?','إزالة هذا الموعد المتاح؟')))void runAction(b,()=>m(`/slots/${b.dataset.slotDelete}`,'DELETE'));});
    }catch(e){if($('calendar-error'))$('calendar-error').textContent=e.message;}
  }
  async function runAction(button,fn){button.disabled=true;$('calendar-error').textContent='';try{await fn();await slots();toast(tr('Availability saved.','تم حفظ التوفر.'));}catch(e){$('calendar-error').textContent=e.message;}finally{button.disabled=false;}}
  $('calendar-day').onchange=bookings;$('calendar-service').onchange=slots;
  $('slot-create').onsubmit=e=>{e.preventDefault();const form=new FormData(e.target);const value=`${form.get('day')}T${form.get('time')}:00+04:00`;if(!Number.isFinite(Date.parse(value)))return;
    void runAction(e.target.querySelector('button'),()=>m(`/products/${$('calendar-service').value}/slots`,'POST',{starts_at:new Date(value).toISOString(),capacity:Number(form.get('capacity'))}));};
  bookings();void slots();
}
const oldSellerOverview=renderOverview;
renderOverview=function(){oldSellerOverview();const low=dash.products.filter(p=>p.kind==='physical'&&(p.variants||[]).some(v=>Number(v.stock)<=3));
 const section=document.createElement('section');section.className='card';section.innerHTML=`<h3>${esc(tr('Action centre','مركز الإجراءات'))}</h3><div class="row">${sellsProducts()?`<a href="#orders">${openOrders().length} ${tr('orders to fulfil','طلبات للتجهيز')}</a>`:''}${sellsServices()?`<a href="#calendar">${upcoming().length} ${tr('bookings to manage','حجوزات للإدارة')}</a>`:''}<a href="#listings">${low.length} ${tr('low-stock listings','منتجات منخفضة المخزون')}</a></div>${low.map(p=>`<p>${esc(nm(p))}: ${esc((p.variants||[]).map(v=>`${nm(v)} (${v.stock})`).join(', '))}</p>`).join('')}`;
 $('page').prepend(section);
};
// Prevent repeated clicks while a seller write is pending.
const oldSellerAct=act;let sellerWriting=false;
act=async function(fn,done){if(sellerWriting)return;sellerWriting=true;const buttons=[...document.querySelectorAll('#page button')].filter(b=>!b.disabled);buttons.forEach(b=>b.disabled=true);try{await oldSellerAct(fn,done);}finally{sellerWriting=false;buttons.forEach(b=>b.disabled=false);}};
