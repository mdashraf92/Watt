'use strict';
// Integrates with the existing record drawers and validated operation forms.
names.attention = ['Action inbox', 'قائمة الإجراءات'];
names.health = ['Platform health', 'حالة المنصة'];
ICONS.attention = ICONS.support;
const originalWorkflowNavigation = renderNavigation;
renderNavigation = function () {
  originalWorkflowNavigation();
  const link = document.createElement('a');
  link.href = '#attention'; link.className = page === 'attention' ? 'active' : '';
  link.innerHTML = icon('attention') + '<span>' + title('attention') + '</span>';
  $('navigation').prepend(link);
  if(user.role==='superadmin'){const health=document.createElement('a');health.href='#health';health.className=page==='health'?'active':'';health.textContent=title('health');$('navigation').append(health);}
};
let workflowPage = '', queueResource = '';
statusNames.urgent=['Urgent','عاجل'];statusNames.normal=['Normal','عادي'];statusNames.under_review=['Under review','قيد المراجعة'];
const originalWorkflowOpenFiltered=openFiltered;
openFiltered=function(target,filter){workflowPage=target;return originalWorkflowOpenFiltered(target,filter);};
const originalWorkflowRender = renderPage;
renderPage = async function () {
  const target = location.hash.slice(1) || 'overview';
  const key = 'gowatt-views:' + user.id;
  let views = {}; try { views = JSON.parse(localStorage.getItem(key) || '{}'); } catch {}
  if (target !== workflowPage && !keepFilters && views[target]) {
    search = String(views[target].search || '');
    filters = views[target].filters || {}; offset = 0;
  }
  workflowPage = target;
  views[target] = { search, filters };
  localStorage.setItem(key, JSON.stringify(views));
  if(target==='health')return renderPlatformHealth();
  if (target !== 'attention') return originalWorkflowRender();
  const run = ++generation; page = target; renderNavigation();
  $('page-title').textContent = title(target); $('page-error').hidden = true;
  $('page').innerHTML = '<div class="loading"></div>';
  try {
    const data = await api('/attention?resource=' + encodeURIComponent(queueResource));
    if (run !== generation) return;
    const sections = ['chargers','sessions','cafe_orders', 'support', 'applications', 'vendors', 'products', 'returns', 'payouts'];
    $('page').innerHTML = `<section class="panel"><div class="panel-heading"><div><h2>${tr('Needs your attention','يحتاج إلى اهتمامك')}</h2><p>${data.total} ${tr('outstanding items. Open a record to review and act.','عنصراً بانتظار الإجراء. افتح السجل للمراجعة.')}</p></div><label>${tr('Section','القسم')} <select id="queue-section"><option value="">${tr('All','الكل')}</option>${sections.map(k=>`<option value="${k}" ${queueResource===k?'selected':''}>${escape(title(k))} (${data.counts[k]??'—'})</option>`).join('')}</select></label></div>
    ${data.unavailable.length?`<p class="permission">${tr('Needs database setup: ','يتطلب إعداد قاعدة البيانات: ')}${data.unavailable.map(title).map(escape).join(', ')}</p>`:''}
    <div class="table-wrap"><table><thead><tr>${[tr('Priority','الأولوية'),tr('Section','القسم'),tr('Record','السجل'),tr('Status','الحالة'),tr('Waiting since','منذ'),tr('Next action','الإجراء التالي')].map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody>${data.items.map(x=>`<tr><td>${badge(x.priority)}</td><td>${escape(title(x.resource))}</td><td>${escape(x.title)}</td><td>${badge(x.status)}</td><td>${x.created_at?escape(new Date(x.created_at).toLocaleString(lang==='ar'?'ar-OM':'en-GB')):'—'}</td><td><button class="secondary" data-queue-resource="${escape(x.resource)}" data-id="${escape(x.id)}">${tr('Review →','مراجعة ←')}</button></td></tr>`).join('')}</tbody></table></div>
    ${!data.items.length?`<div class="empty">${tr('No outstanding items in this section.','لا توجد عناصر معلقة في هذا القسم.')}</div>`:''}
    ${data.has_more?`<p>${tr('Showing the first 50 items. Choose a section to narrow the queue.','عرض أول 50 عنصراً. اختر قسماً لتضييق القائمة.')}</p>`:''}</section>`;
    $('queue-section').onchange = e => { queueResource = e.target.value; void renderPage(); };
    document.querySelectorAll('[data-queue-resource]').forEach(b => b.onclick = () => void details(b.dataset.queueResource,b.dataset.id));
    stamp();
  } catch (error) { if(run===generation){$('page-error').textContent=error.message;$('page-error').hidden=false;$('page').innerHTML='';} }
};
async function renderPlatformHealth(){
 const run=++generation;page='health';renderNavigation();$('page-title').textContent=title(page);$('page-error').hidden=true;
 $('page').innerHTML='<div class="loading"></div>';
 try{const data=await api('/platform-status');if(run!==generation)return;
  const expected=['auto-shutoff','no-show','disburse','reminders','reconcile-payments','mobile-dispatch','cafe-orders','cafe-menus'];
  $('page').innerHTML=`<section class="panel"><div class="panel-heading"><h2>${tr('Configuration status','حالة الإعداد')}</h2></div><p>${tr('Configured credentials do not prove provider connectivity. Test delivery and hardware separately.','وجود بيانات الإعداد لا يؤكد الاتصال بالمزود. اختبر الإرسال والأجهزة بشكل منفصل.')}</p>${Object.entries(data.integrations).map(([k,v])=>`<div class="summary-line"><span>${escape(k)}</span><strong>${v?tr('Configured','مُعدّ'):tr('Missing configuration','إعداد مفقود')}</strong></div>`).join('')}<div class="summary-line"><span>${tr('Database','قاعدة البيانات')}</span><strong>${escape(data.database)}</strong></div></section>
  <section class="panel"><div class="panel-heading"><h2>${tr('Scheduled job history','سجل المهام المجدولة')}</h2></div>${!data.monitor_ready?`<p>${tr('Apply the operations monitoring migration to enable job history.','طبّق ترحيل مراقبة العمليات لتفعيل سجل المهام.')}</p>`:''}<div class="table-wrap"><table><thead><tr>${[tr('Job','المهمة'),tr('Last response','آخر استجابة'),tr('Last run','آخر تشغيل'),tr('Last successful HTTP response','آخر استجابة HTTP ناجحة')].map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody>${expected.map(name=>{const job=data.jobs.find(j=>j.name===name);return `<tr><td>${escape(name)}</td><td>${job?escape(job.http_status):tr('Never recorded','لم يُسجل')}</td><td>${job?escape(new Date(job.finished_at).toLocaleString()):'—'}</td><td>${job?.last_success_at?escape(new Date(job.last_success_at).toLocaleString()):'—'}</td></tr>`;}).join('')}</tbody></table></div><p>${tr('HTTP success alone does not prove every payment or device operation succeeded.','نجاح HTTP وحده لا يؤكد نجاح كل عملية دفع أو جهاز.')}</p></section><section class="panel"><h2>${tr('Feature switches','مفاتيح الميزات')}</h2>${Object.entries(data.features).map(([k,v])=>`<div class="summary-line"><span>${escape(k)}</span><strong>${v?tr('Enabled','مفعّل'):tr('Disabled','معطّل')}</strong></div>`).join('')}</section>`;stamp();
 }catch(e){if(run===generation){$('page-error').textContent=e.message;$('page-error').hidden=false;$('page').innerHTML='';}}
}
// Every operational section supports an exact status filter where applicable.
const originalWorkflowFilters = filterSelects;
filterSelects = function () {
  const existing = originalWorkflowFilters(); if (existing) return existing;
  const values = {chargers:['available','busy','offline','fault'],sessions:['active','completed','interrupted'],bookings:['pending','confirmed','active','completed','cancelled','no_show'],orders:['paid','partially_refunded','refunded'],appointments:['requested','quoted','booked','in_progress','completed','cancelled'],returns:['requested','approved','rejected','refunded'],support:['open','in_review','resolved'],applications:['pending','under_review','approved','rejected','needs_info'],payouts:['pending','paid','rejected']}[page];
  return values?`<select data-filter="status" aria-label="${label('status')}"><option value="">${tr('All statuses','كل الحالات')}</option>${values.map(s=>`<option value="${s}" ${filters.status===s?'selected':''}>${escape(status(s))}</option>`).join('')}</select>`:'';
};
