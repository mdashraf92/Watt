'use strict';
// Go Watt web seller portal. Talks to /api/seller (cookie session), which wraps
// the same marketplace endpoints the app uses. Every value from the server is
// passed through esc() before it touches innerHTML.

const $ = (id) => document.getElementById(id);
let lang = localStorage.getItem('gw-seller-lang') || (navigator.language.startsWith('ar') ? 'ar' : 'en');
const tr = (en, ar) => (lang === 'ar' ? ar : en);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const omr = (baisa) => `${(Number(baisa || 0) / 1000).toFixed(3)} ${tr('OMR', 'ر.ع')}`;
const nm = (row, key = 'name') => (lang === 'ar' ? row?.[key + '_ar'] || row?.[key] : row?.[key] || row?.[key + '_ar']) || '';
const when = (d) => (d ? new Date(d).toLocaleString(lang === 'ar' ? 'ar-OM' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Muscat' }) : '—');

const STATUS = {
  pending: ['Awaiting review', 'بانتظار المراجعة'], approved: ['Approved', 'معتمد'], suspended: ['Suspended', 'موقوف'],
  published: ['Published', 'منشور'], rejected: ['Changes needed', 'يحتاج تعديلات'], paused: ['Paused', 'متوقف'], draft: ['Draft', 'مسودة'],
  paid: ['New order', 'طلب جديد'], accepted: ['Preparing', 'قيد التجهيز'], ready: ['Ready for pickup', 'جاهز للاستلام'],
  shipped: ['Shipped', 'تم الشحن'], completed: ['Completed', 'مكتمل'], cancelled: ['Cancelled', 'ملغي'], refunded: ['Refunded', 'مسترد'],
  requested: ['Requested', 'تم الطلب'], quoted: ['Quote sent', 'تم إرسال العرض'], booked: ['Confirmed', 'مؤكد'], in_progress: ['In progress', 'قيد التنفيذ'],
};
const status = (s) => tr(...(STATUS[s] || [s, s]));
const tone = (s) => (['approved', 'published', 'completed', 'booked', 'refunded'].includes(s) ? 'good'
  : ['pending', 'requested', 'quoted', 'paid', 'accepted', 'ready', 'shipped', 'in_progress', 'draft'].includes(s) ? 'warn'
  : ['rejected', 'suspended', 'cancelled'].includes(s) ? 'bad' : 'muted');
const badge = (s) => `<span class="badge ${tone(s)}">${esc(status(s))}</span>`;

let user = null, vendor = null, dash = null, categories = [];
let applyState = { step: 0, type: null, form: {} };
let listFilter = 'all';

// ── API ──────────────────────────────────────────────────────────────────
async function api(path, method = 'GET', body) {
  const res = await fetch('/api/seller' + path, {
    method, credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null; try { data = text ? JSON.parse(text) : null; } catch { /* non-JSON */ }
  if (res.status === 401 && path !== '/login') { showLogin(); throw new Error(tr('Please sign in again.', 'يرجى تسجيل الدخول مجدداً.')); }
  if (!res.ok) throw new Error(data?.error?.message || tr('Something went wrong. Please try again.', 'حدث خطأ. حاول مرة أخرى.'));
  return data;
}
const m = (path, method, body) => api('/marketplace' + path, method, body);

function toast(message) { $('toast').textContent = message; $('toast').hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { $('toast').hidden = true; }, 3500); }
function showError(message) { const el = $('page-error'); el.textContent = message || ''; el.hidden = !message; }

// ── Language ─────────────────────────────────────────────────────────────
function applyStatic() {
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  // data-t values are our own static copy ("English|Arabic"), never server data.
  document.querySelectorAll('[data-t]').forEach((el) => { el.innerHTML = el.dataset.t.split('|')[lang === 'ar' ? 1 : 0]; });
  document.querySelectorAll('[data-lang-toggle]').forEach((el) => { el.textContent = lang === 'ar' ? 'English' : 'العربية'; });
}
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-lang-toggle]')) { lang = lang === 'ar' ? 'en' : 'ar'; localStorage.setItem('gw-seller-lang', lang); applyStatic(); if (user) render(); }
});

// ── Session ──────────────────────────────────────────────────────────────
function showLogin() { user = null; $('workspace').hidden = true; $('login').hidden = false; if ($('editor').open) $('editor').close(); }
$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault(); $('login-error').textContent = '';
  const f = new FormData(e.target); const btn = e.target.querySelector('button[type=submit]'); btn.disabled = true;
  try { user = await api('/login', 'POST', { email: f.get('email'), password: f.get('password') }); e.target.reset(); await load(); }
  catch (err) { $('login-error').textContent = err.message; }
  finally { btn.disabled = false; }
});
$('logout').onclick = async () => { try { await api('/logout', 'POST', {}); } catch { /* already signed out */ } showLogin(); };
$('refresh').onclick = () => void load();
window.addEventListener('hashchange', () => { if (user) render(); });

async function load() {
  showError('');
  try {
    if (!user) user = await api('/session');
    const portal = await m('/portal');
    vendor = portal.vendors[0] || null;
    [dash, categories] = await Promise.all([vendor ? m(`/vendors/${vendor.id}/dashboard`) : null, m('/categories')]);
    if (dash) vendor = dash.vendor;
    $('login').hidden = true; $('workspace').hidden = false;
    render();
  } catch (err) { if (user) showError(err.message); }
}

// ── Layout ───────────────────────────────────────────────────────────────
const sellsProducts = () => vendor && vendor.seller_type !== 'service';
const sellsServices = () => vendor && vendor.seller_type !== 'shop';
const openOrders = () => (dash?.fulfilments || []).filter((f) => f.method !== 'appointment' && !['completed', 'cancelled', 'refunded'].includes(f.status));
const upcoming = () => (dash?.appointments || []).filter((a) => ['requested', 'quoted', 'booked', 'in_progress'].includes(a.status));
const typeLabel = (t) => (t === 'shop' ? tr('Shop', 'متجر') : t === 'service' ? tr('Service provider', 'مقدم خدمة') : tr('Shop & services', 'متجر وخدمات'));

function pages() {
  if (!vendor) return [['apply', tr('Apply to sell', 'طلب البيع')]];
  return [
    ['overview', tr('Overview', 'نظرة عامة')],
    ['listings', tr('Listings', 'المنتجات والخدمات'), dash.products.filter((p) => p.status === 'pending').length],
    ...(sellsProducts() ? [['orders', tr('Orders', 'الطلبات'), openOrders().length]] : []),
    ...(sellsProducts() ? [['stock', tr('Stock manager', 'إدارة المخزون')]] : []),
    ...(sellsServices() ? [['bookings', tr('Bookings', 'الحجوزات'), upcoming().length]] : []),
    ...(sellsServices() ? [['calendar', tr('Calendar & availability', 'التقويم والتوفر')]] : []),
    ['payouts', tr('Payouts', 'الدفعات')],
    ['business', tr('Business & team', 'النشاط والفريق')],
  ];
}

function render() {
  applyStatic();
  const list = pages();
  let page = location.hash.slice(1);
  if (!list.some(([k]) => k === page)) page = list[0][0];
  $('navigation').innerHTML = list.map(([k, label, count]) => `<a href="#${k}" class="${k === page ? 'active' : ''}">${esc(label)}${count ? `<span class="count">${count}</span>` : ''}</a>`).join('');
  $('user-name').textContent = user?.name || '';
  $('store-card').innerHTML = vendor
    ? `<strong>${esc(nm(vendor))}</strong><span>${esc(typeLabel(vendor.seller_type))}</span><span>${badge(vendor.status)}</span>`
    : `<span>${esc(tr('No store yet', 'لا يوجد متجر بعد'))}</span>`;
  const [, title] = list.find(([k]) => k === page);
  $('page-title').textContent = title;
  $('breadcrumb').textContent = vendor ? nm(vendor) : tr('Seller portal', 'بوابة البائعين');
  ({ apply: renderApply, overview: renderOverview, listings: renderListings, orders: renderOrders, stock: renderStock, bookings: renderBookings, calendar: renderCalendar, payouts: renderPayouts, business: renderBusiness })[page]();
}

// Run an action, then refresh everything and show a message.
async function act(fn, done) {
  showError('');
  try { await fn(); await load(); if (done) toast(done); }
  catch (err) { showError(err.message); window.scrollTo({ top: 0, behavior: 'smooth' }); }
}

// ── Apply ────────────────────────────────────────────────────────────────
function renderApply() {
  const s = applyState; const f = s.form;
  const field = (key, en, ar, extra = '') => `<label class="${extra.includes('full') ? 'full' : ''}"><span>${esc(tr(en, ar))}</span>${extra.includes('area') ? `<textarea name="${key}">${esc(f[key])}</textarea>` : `<input name="${key}" value="${esc(f[key])}" ${extra.includes('email') ? 'type="email"' : ''}>`}</label>`;
  const steps = `<div class="steps">${[0, 1, 2].map((i) => `<i class="${i <= s.step ? 'on' : ''}"></i>`).join('')}</div>`;
  const types = [
    ['shop', tr('Shop', 'متجر'), tr('Sell EV products: chargers, cables, parts, accessories.', 'بيع منتجات السيارات الكهربائية: شواحن، كابلات، قطع غيار، إكسسوارات.')],
    ['service', tr('Service provider', 'مقدم خدمة'), tr('Garages, installers, tyre and detailing centres — customers book appointments.', 'الورش والمركّبون ومراكز الإطارات والتنظيف — يحجز العملاء المواعيد.')],
    ['both', tr('Both', 'الاثنان معاً'), tr('You sell products and also offer bookable services.', 'تبيع المنتجات وتقدم أيضاً خدمات قابلة للحجز.')],
  ];
  let body = '';
  if (s.step === 0) body = `<h3>${esc(tr('What do you offer?', 'ماذا تقدم؟'))}</h3><p class="muted">${esc(tr('Go Watt reviews every seller before listings go live.', 'تراجع Go Watt كل بائع قبل نشر منتجاته.'))}</p>
    <div class="choice">${types.map(([k, t, d]) => `<button type="button" data-type="${k}" class="${s.type === k ? 'on' : ''}"><strong>${esc(t)}</strong><span class="muted">${esc(d)}</span></button>`).join('')}</div>
    <div class="row" style="margin-top:16px"><span class="spacer"></span><button class="primary" id="next" ${s.type ? '' : 'disabled'}>${esc(tr('Continue', 'متابعة'))}</button></div>`;
  if (s.step === 1) body = `<h3>${esc(tr('Your business', 'بيانات نشاطك'))}</h3><form id="apply-form" class="form-grid">
    ${field('name', 'Business name — English', 'اسم النشاط بالإنجليزية')}${field('name_ar', 'Business name — Arabic', 'اسم النشاط بالعربية')}
    ${field('cr_number', 'Commercial registration (CR) number', 'رقم السجل التجاري')}${field('contact_phone', 'Contact phone', 'رقم التواصل')}
    ${field('email', 'Business email (optional)', 'البريد الإلكتروني للنشاط (اختياري)', 'email')}${field('address', s.type === 'shop' ? 'Pickup address' : 'Service centre address', s.type === 'shop' ? 'عنوان الاستلام' : 'عنوان مركز الخدمة')}
    </form><div class="row" style="margin-top:16px"><button class="secondary" id="back">${esc(tr('Back', 'رجوع'))}</button><span class="spacer"></span><button class="primary" id="next">${esc(tr('Continue', 'متابعة'))}</button></div>`;
  if (s.step === 2) body = `<h3>${esc(tr('Payouts & profile', 'الدفعات والملف التعريفي'))}</h3><form id="apply-form" class="form-grid">
    ${field('bank_details', 'Bank account for payouts (bank, name, IBAN)', 'الحساب البنكي للدفعات (البنك، الاسم، IBAN)', 'area full')}
    ${field('about', 'About your business — English (optional)', 'نبذة بالإنجليزية (اختياري)', 'area')}${field('about_ar', 'About your business — Arabic (optional)', 'نبذة بالعربية (اختياري)', 'area')}
    </form><div class="row" style="margin-top:16px"><button class="secondary" id="back">${esc(tr('Back', 'رجوع'))}</button><span class="spacer"></span><button class="primary" id="next">${esc(tr('Submit application', 'إرسال الطلب'))}</button></div>`;
  $('page').innerHTML = `<div class="card" style="max-width:760px">${steps}${body}</div>`;

  const collect = () => { const form = $('apply-form'); if (form) new FormData(form).forEach((v, k) => { f[k] = String(v).trim(); }); };
  document.querySelectorAll('[data-type]').forEach((b) => { b.onclick = () => { s.type = b.dataset.type; renderApply(); }; });
  if ($('back')) $('back').onclick = () => { collect(); s.step--; renderApply(); };
  $('next').onclick = () => {
    collect();
    if (s.step === 1 && !['name', 'name_ar', 'cr_number', 'contact_phone', 'address'].every((k) => f[k])) return showError(tr('Fill in all business details.', 'أكمل جميع بيانات النشاط.'));
    if (s.step < 2) { showError(''); s.step++; return renderApply(); }
    if (!f.bank_details) return showError(tr('Add the bank account for payouts.', 'أضف الحساب البنكي للدفعات.'));
    act(() => m('/vendors', 'POST', { seller_type: s.type, ...f }), tr('Application sent. You can add listings now.', 'تم إرسال الطلب. يمكنك إضافة المنتجات الآن.'))
      .then(() => { applyState = { step: 0, type: null, form: {} }; location.hash = '#overview'; });
  };
}

// ── Overview ─────────────────────────────────────────────────────────────
function renderOverview() {
  const v = vendor; const p = dash.products;
  const settled = dash.settlements.reduce((n, s) => n + Number(s.amount), 0);
  const notice = v.status === 'pending'
    ? `<div class="notice warn"><strong>${esc(tr('Application under review', 'طلبك قيد المراجعة'))}</strong><br>${esc(tr('Add your listings now — they go live once your store and each listing are approved.', 'أضف منتجاتك الآن — تُنشر بعد اعتماد متجرك وكل منتج.'))}</div>`
    : v.status === 'approved'
      ? `<div class="notice good"><strong>${esc(tr('Your store is live', 'متجرك منشور'))}</strong><br>${esc(tr('Listings stay visible while fresh: confirm stock or edit each listing at least every 30 days.', 'تبقى المنتجات ظاهرة ما دامت محدّثة: أكّد المخزون أو عدّل كل منتج مرة كل 30 يوماً على الأقل.'))}</div>`
      : `<div class="notice bad"><strong>${esc(tr('Store suspended', 'المتجر موقوف'))}</strong></div>`;
  const stat = (label, value, cls = '') => `<div class="stat ${cls}"><b>${esc(value)}</b><span>${esc(label)}</span></div>`;
  $('page').innerHTML = `<div class="grid">${notice}
    ${v.rejection_reason ? `<div class="notice warn"><strong>${esc(tr('Note from Go Watt', 'ملاحظة من Go Watt'))}</strong><br>${esc(v.rejection_reason)}</div>` : ''}
    <div class="stats">
      ${stat(tr('Live listings', 'منتجات منشورة'), p.filter((x) => x.status === 'published').length, 'good')}
      ${stat(tr('Awaiting review', 'بانتظار المراجعة'), p.filter((x) => x.status === 'pending').length, 'warn')}
      ${sellsProducts() ? stat(tr('Orders to fulfil', 'طلبات للتجهيز'), openOrders().length, openOrders().length ? 'warn' : '') : ''}
      ${sellsServices() ? stat(tr('Upcoming bookings', 'حجوزات قادمة'), upcoming().length, upcoming().length ? 'warn' : '') : ''}
      ${stat(tr('Paid out to you', 'المدفوع لك'), omr(settled))}
      ${stat(tr('Commission', 'العمولة'), v.commission_bps == null ? '—' : `${(v.commission_bps / 100).toFixed(1)}%`)}
    </div>
    <div class="row"><button class="primary" id="add">${esc(tr('+ Add a listing', '+ إضافة منتج أو خدمة'))}</button></div>
    <div class="card" id="updates"><h3>${esc(tr('Latest updates from Go Watt', 'آخر التحديثات من Go Watt'))}</h3><p class="fine">${esc(tr('Loading…', 'جارٍ التحميل…'))}</p></div></div>`;
  $('add').onclick = () => openEditor();
  void loadUpdates();
}

// Review outcomes (approved, changes needed, published…) — the same messages the app shows.
async function loadUpdates() {
  try {
    const r = await api('/notifications?limit=8'); const items = (r.notifications || []).filter((n) => n.data?.vendor_id);
    const el = $('updates'); if (!el) return;
    const text = (n) => (lang === 'ar' && n.data?.title_ar ? [n.data.title_ar, n.data.body_ar || n.body] : [n.title, n.body]);
    el.innerHTML = `<h3>${esc(tr('Latest updates from Go Watt', 'آخر التحديثات من Go Watt'))}</h3>` + (items.length
      ? items.map((n) => { const [t, b] = text(n); return `<div class="notice ${n.read_at ? '' : 'warn'}" style="margin-top:8px"><strong>${esc(t)}</strong><br>${esc(b)}<div class="fine">${esc(when(n.created_at))}</div></div>`; }).join('')
      : `<p class="fine">${esc(tr('No updates yet. You will hear here, in the app and by email when Go Watt reviews your store or listings.', 'لا توجد تحديثات بعد. ستصلك هنا وفي التطبيق وبالبريد عند مراجعة Go Watt لمتجرك أو منتجاتك.'))}</p>`);
    if (items.some((n) => !n.read_at)) await api('/notifications/read', 'POST', { ids: items.filter((n) => !n.read_at).map((n) => n.id) });
  } catch { /* updates are a bonus; the overview works without them */ }
}

// ── Listings ─────────────────────────────────────────────────────────────
function renderListings() {
  const all = dash.products; const rows = all.filter((p) => listFilter === 'all' || p.status === listFilter);
  const filters = ['all', 'published', 'pending', 'rejected', 'paused'];
  $('page').innerHTML = `<div class="row" style="margin-bottom:14px"><div class="pills" style="margin:0">${filters.map((k) => `<button class="pill ${listFilter === k ? 'on' : ''}" data-filter="${k}">${esc(k === 'all' ? tr('All', 'الكل') : status(k))}${k !== 'all' ? ` (${all.filter((p) => p.status === k).length})` : ''}</button>`).join('')}</div><span class="spacer"></span><button class="primary" id="add">${esc(tr('+ Add a listing', '+ إضافة منتج أو خدمة'))}</button></div>
    ${rows.length ? `<table><thead><tr><th></th><th>${esc(tr('Listing', 'المنتج'))}</th><th>${esc(tr('Price', 'السعر'))}</th><th>${esc(tr('Stock / duration', 'المخزون / المدة'))}</th><th>${esc(tr('Status', 'الحالة'))}</th><th></th></tr></thead><tbody>
    ${rows.map((p) => { const vs = p.variants || []; const cat = categories.find((c) => c.id === p.category_id);
      return `<tr><td>${p.image_url ? `<img class="thumb" src="${esc(p.image_url)}" alt="">` : '<span class="thumb"></span>'}</td>
      <td><strong>${esc(nm(p))}</strong><div class="fine">${esc(p.kind === 'service' ? tr('Service', 'خدمة') : tr('Product', 'منتج'))} · ${esc(nm(cat) || p.category_id)}</div>${p.moderation_note ? `<div class="fine" style="color:var(--orange-ink)">${esc(p.moderation_note)}</div>` : ''}</td>
      <td>${p.price_basis === 'quote' ? esc(tr('Quote', 'عرض سعر')) : vs.length ? esc(omr(Math.min(...vs.map((x) => x.price)))) : '—'}</td>
      <td>${p.kind === 'service' ? `${esc(p.duration_minutes)} ${esc(tr('min', 'دقيقة'))}` : esc(vs.reduce((n, x) => n + x.stock, 0))}</td>
      <td>${badge(p.status)}</td><td><button class="secondary small" data-edit="${esc(p.id)}">${esc(tr('Edit', 'تعديل'))}</button></td></tr>`; }).join('')}
    </tbody></table>` : `<div class="empty">${esc(listFilter === 'all' ? tr('No listings yet. Add your first product or service — Go Watt reviews it quickly.', 'لا توجد منتجات بعد. أضف أول منتج أو خدمة — تراجعها Go Watt بسرعة.') : tr('Nothing here.', 'لا يوجد شيء هنا.'))}</div>`}`;
  document.querySelectorAll('[data-filter]').forEach((b) => { b.onclick = () => { listFilter = b.dataset.filter; renderListings(); }; });
  document.querySelectorAll('[data-edit]').forEach((b) => { b.onclick = () => openEditor(all.find((p) => p.id === b.dataset.edit)); });
  $('add').onclick = () => openEditor();
}

// Listing editor (add / edit). Specs and vehicle compatibility set in the app
// are carried through unchanged when a listing is edited here.
function openEditor(original) {
  const kinds = vendor.seller_type === 'shop' ? ['physical'] : vendor.seller_type === 'service' ? ['service'] : ['physical', 'service'];
  const st = {
    kind: original?.kind || kinds[0],
    variants: (original?.variants || [{ sku: '', name: 'Standard', name_ar: 'قياسي', price: 0, stock: 0 }]).map((v) => ({ ...v })),
  };
  const o = original || {};
  const draw = () => {
    const cats = categories.filter((c) => c.kind === st.kind);
    const catValue = cats.some((c) => c.id === o.category_id) ? o.category_id : cats[0]?.id;
    const inp = (name, en, ar, value, attrs = '') => `<label><span>${esc(tr(en, ar))}</span><input name="${name}" value="${esc(value ?? '')}" ${attrs}></label>`;
    const area = (name, en, ar, value) => `<label><span>${esc(tr(en, ar))}</span><textarea name="${name}">${esc(value ?? '')}</textarea></label>`;
    $('editor-form').innerHTML = `
      <div class="dialog-header"><h2>${esc(original?.id ? tr('Edit listing', 'تعديل المنتج') : tr('New listing', 'منتج جديد'))}</h2><button type="button" class="secondary" id="close">${esc(tr('Close', 'إغلاق'))} ×</button></div>
      <p class="fine">${esc(tr('Every change goes to Go Watt for review before it is published. Use a square image (at least 1200 × 1200) on a plain background.', 'يُراجع كل تعديل من Go Watt قبل نشره. استخدم صورة مربعة (1200 × 1200 على الأقل) بخلفية بسيطة.'))}</p>
      ${kinds.length > 1 && !original?.id ? `<div class="pills">${kinds.map((k) => `<button type="button" class="pill ${st.kind === k ? 'on' : ''}" data-kind="${k}">${esc(k === 'service' ? tr('Service', 'خدمة') : tr('Product', 'منتج'))}</button>`).join('')}</div>` : ''}
      <div class="form-grid">
        <label class="full"><span>${esc(tr('Category', 'الفئة'))}</span><select name="category_id">${cats.map((c) => `<option value="${esc(c.id)}" ${c.id === catValue ? 'selected' : ''}>${esc(nm(c))}</option>`).join('')}</select></label>
        ${inp('name', 'Name — English', 'الاسم بالإنجليزية', o.name)}${inp('name_ar', 'Name — Arabic', 'الاسم بالعربية', o.name_ar, 'dir="rtl"')}
        ${area('description', 'Description — English', 'الوصف بالإنجليزية', o.description)}${area('description_ar', 'Description — Arabic', 'الوصف بالعربية', o.description_ar)}
        <div class="full row" style="align-items:flex-end">${o.image_url ? `<img class="preview" id="preview" src="${esc(o.image_url)}" alt="">` : '<img class="preview" id="preview" alt="" hidden>'}
          <label style="flex:1"><span>${esc(tr('Main image (HTTPS link)', 'الصورة الرئيسية (رابط HTTPS)'))}</span><input name="image_url" type="url" value="${esc(o.image_url ?? '')}"></label></div>
        <label class="full"><span>${esc(tr('More images — one HTTPS link per line (up to 6)', 'صور إضافية — رابط HTTPS في كل سطر (حتى 6)'))}</span><textarea name="images">${esc((o.images || []).join('\n'))}</textarea></label>
        ${inp('warranty', 'Warranty — English', 'الضمان بالإنجليزية', o.warranty)}${inp('warranty_ar', 'Warranty — Arabic', 'الضمان بالعربية', o.warranty_ar, 'dir="rtl"')}
        ${inp('return_days', 'Return window (days)', 'مدة الإرجاع (أيام)', o.return_days ?? 7, 'type="number" min="0" max="365"')}
        ${st.kind === 'service' ? `${inp('duration_minutes', 'Duration (minutes)', 'المدة (دقائق)', o.duration_minutes ?? 60, 'type="number" min="15" max="1440"')}
          <label><span>${esc(tr('Pricing', 'التسعير'))}</span><select name="price_basis"><option value="fixed" ${o.price_basis !== 'quote' ? 'selected' : ''}>${esc(tr('Fixed price', 'سعر ثابت'))}</option><option value="quote" ${o.price_basis === 'quote' ? 'selected' : ''}>${esc(tr('Quote required', 'يتطلب عرض سعر'))}</option></select></label>
          <label><span>${esc(tr('Where', 'المكان'))}</span><select name="service_location"><option value="at_centre" ${o.service_location !== 'mobile' ? 'selected' : ''}>${esc(tr('At your centre', 'في مركزك'))}</option><option value="mobile" ${o.service_location === 'mobile' ? 'selected' : ''}>${esc(tr('Mobile (at the customer)', 'متنقلة (عند العميل)'))}</option></select></label>` : ''}
      </div>
      <h3 style="margin:6px 0 0">${esc(st.kind === 'service' ? tr('Price options', 'خيارات السعر') : tr('Options & stock', 'الخيارات والمخزون'))}</h3>
      <div class="grid" id="variants">${st.variants.map((v, i) => `<div class="variant-row" data-i="${i}">
        <label><span>SKU</span><input data-f="sku" value="${esc(v.sku)}"></label>
        <label><span>${esc(tr('Option — English', 'الخيار بالإنجليزية'))}</span><input data-f="name" value="${esc(v.name)}"></label>
        <label><span>${esc(tr('Option — Arabic', 'الخيار بالعربية'))}</span><input data-f="name_ar" dir="rtl" value="${esc(v.name_ar)}"></label>
        <label><span>${esc(tr('Price (OMR)', 'السعر (ر.ع)'))}</span><input data-f="price" type="number" min="0" step="0.001" value="${esc((v.price || 0) / 1000)}"></label>
        <label><span>${esc(tr('Stock', 'المخزون'))}</span><input data-f="stock" type="number" min="0" value="${esc(v.stock)}"></label>
        ${v.id ? `<button type="button" class="secondary small" data-stock="${i}" title="${esc(tr('Save this stock without re-review', 'حفظ المخزون دون إعادة مراجعة'))}">${esc(tr('Save stock', 'حفظ المخزون'))}</button>` : `<button type="button" class="danger small" data-drop="${i}" ${st.variants.length < 2 ? 'disabled' : ''}>×</button>`}
      </div>`).join('')}</div>
      <div class="row"><button type="button" class="secondary small" id="add-variant">${esc(tr('+ Add option', '+ إضافة خيار'))}</button><span class="fine">${esc(tr('“Save stock” updates quantity instantly and keeps the listing fresh — no review needed.', '«حفظ المخزون» يحدّث الكمية فوراً ويبقي المنتج محدّثاً — دون مراجعة.'))}</span></div>
      ${original?.id && original.kind === 'service' ? `<div class="card" style="background:#fafcfb"><h3>${esc(tr('Add an available appointment', 'إضافة موعد متاح'))}</h3><div class="row">
        <label style="flex:2"><span>${esc(tr('Date & time', 'التاريخ والوقت'))}</span><input type="datetime-local" id="slot-at"></label>
        <label style="flex:1"><span>${esc(tr('Bookings available', 'عدد الحجوزات'))}</span><input type="number" id="slot-cap" min="1" max="50" value="1"></label>
        <button type="button" class="secondary" id="add-slot" style="align-self:flex-end">${esc(tr('Add slot', 'إضافة الموعد'))}</button></div></div>` : ''}
      <p class="error" id="editor-error" role="alert"></p>
      <div class="row"><span class="spacer"></span><button type="button" class="secondary" id="cancel">${esc(tr('Cancel', 'إلغاء'))}</button><button type="submit" class="primary">${esc(tr('Submit for review', 'إرسال للمراجعة'))}</button></div>`;
    bind();
  };
  // Keep typed values when the form re-draws (kind switch, add/remove option).
  const readVariants = () => { document.querySelectorAll('#variants .variant-row').forEach((row) => { const v = st.variants[Number(row.dataset.i)]; row.querySelectorAll('[data-f]').forEach((el) => { const k = el.dataset.f; v[k] = k === 'price' ? Math.round(Number(el.value) * 1000) : k === 'stock' ? Number(el.value) : el.value.trim(); }); }); };
  const readFields = () => { const f = new FormData($('editor-form')); f.forEach((val, key) => { o[key] = key === 'images' ? String(val).split('\n').map((x) => x.trim()).filter(Boolean) : String(val); }); };
  const err = (msg) => { $('editor-error').textContent = msg; };
  function bind() {
    $('close').onclick = $('cancel').onclick = () => $('editor').close();
    document.querySelectorAll('[data-kind]').forEach((b) => { b.onclick = () => { readFields(); readVariants(); st.kind = b.dataset.kind; draw(); }; });
    $('add-variant').onclick = () => { readFields(); readVariants(); st.variants.push({ sku: '', name: '', name_ar: '', price: 0, stock: 0 }); draw(); };
    document.querySelectorAll('[data-drop]').forEach((b) => { b.onclick = () => { readFields(); readVariants(); st.variants.splice(Number(b.dataset.drop), 1); draw(); }; });
    const img = $('editor-form').querySelector('[name=image_url]');
    img.oninput = () => { const p = $('preview'); if (img.value.startsWith('https://')) { p.src = img.value; p.hidden = false; } else p.hidden = true; };
    document.querySelectorAll('[data-stock]').forEach((b) => { b.onclick = async () => {
      readVariants(); const v = st.variants[Number(b.dataset.stock)]; err('');
      try { const updated = await m(`/products/${original.id}/stock`, 'POST', { variant_id: v.id, stock: v.stock, version: v.version }); Object.assign(v, updated); toast(tr('Stock saved.', 'تم حفظ المخزون.')); await load(); }
      catch (e) { err(e.message); }
    }; });
    if ($('add-slot')) $('add-slot').onclick = async () => {
      const at = $('slot-at').value; err('');
      if (!at) return err(tr('Choose a date and time.', 'اختر التاريخ والوقت.'));
      try { await m(`/products/${original.id}/slots`, 'POST', { starts_at: new Date(at).toISOString(), capacity: Number($('slot-cap').value) }); $('slot-at').value = ''; toast(tr('Appointment slot added.', 'تمت إضافة الموعد.')); }
      catch (e) { err(e.message); }
    };
    $('editor-form').onsubmit = async (e) => {
      e.preventDefault(); readFields(); readVariants(); err('');
      const body = {
        kind: st.kind, category_id: o.category_id, name: o.name, name_ar: o.name_ar, description: o.description, description_ar: o.description_ar,
        image_url: o.image_url, images: o.images || [], warranty: o.warranty, warranty_ar: o.warranty_ar, return_days: Number(o.return_days),
        compatibility: original?.compatibility || [], specifications: original?.specifications || {},
        duration_minutes: st.kind === 'service' ? Number(o.duration_minutes) : null,
        service_location: st.kind === 'service' ? o.service_location : 'at_centre', price_basis: st.kind === 'service' ? o.price_basis : 'fixed',
        variants: st.variants.map(({ id, sku, name, name_ar, price, stock }) => ({ ...(id ? { id } : {}), sku, name, name_ar, price, stock })),
        ...(original?.id ? { version: original.version } : {}),
      };
      const btn = e.submitter; if (btn) btn.disabled = true;
      try {
        if (original?.id) await m(`/products/${original.id}`, 'PUT', body); else await m(`/vendors/${vendor.id}/products`, 'POST', body);
        $('editor').close(); toast(tr('Sent for review.', 'تم الإرسال للمراجعة.')); await load();
      } catch (e2) { err(e2.message); } finally { if (btn) btn.disabled = false; }
    };
  }
  draw();
  $('editor').showModal();
}

// ── Orders ───────────────────────────────────────────────────────────────
function renderOrders() {
  const rows = dash.fulfilments.filter((f) => f.method !== 'appointment');
  const next = (f) => (f.status === 'paid' ? 'accepted' : f.status === 'accepted' ? (f.method === 'pickup' ? 'ready' : 'shipped') : ['ready', 'shipped'].includes(f.status) ? 'completed' : null);
  $('page').innerHTML = `<div class="grid">${rows.length ? rows.map((f) => { const n = next(f); return `<div class="card">
      <div class="row"><div><strong>${esc(tr('Order', 'طلب'))} #${esc(String(f.order_id).slice(0, 8).toUpperCase())}</strong><div class="fine">${esc(when(f.created_at))} · ${esc(f.method === 'pickup' ? tr('Pickup', 'استلام') : tr('Delivery', 'توصيل'))}</div></div><span class="spacer"></span>${badge(f.status)}</div>
      <table style="margin:12px 0"><tbody>${(f.items || []).map((i) => `<tr><td>${esc(nm(i.snapshot))} × ${esc(i.quantity)}</td><td style="text-align:end"><strong>${esc(omr(i.unit_price * i.quantity))}</strong></td></tr>`).join('')}</tbody></table>
      <div class="fine">${esc(f.phone)}${f.delivery_address ? ' · ' + esc(f.delivery_address) : ''}${f.tracking ? ' · ' + esc(tr('Tracking', 'التتبع')) + ': ' + esc(f.tracking) : ''}</div>
      ${n ? `<div class="row" style="margin-top:12px">${n === 'shipped' ? `<input data-tracking="${esc(f.id)}" placeholder="${esc(tr('Courier and tracking number', 'شركة الشحن ورقم التتبع'))}" style="flex:1;min-width:200px">` : ''}<button class="primary small" data-next="${esc(f.id)}" data-status="${n}">${esc(tr('Mark as', 'تحديث إلى'))} ${esc(status(n))}</button></div>` : ''}
    </div>`; }).join('') : `<div class="empty">${esc(tr('No orders yet. Paid orders for your products appear here.', 'لا توجد طلبات بعد. تظهر هنا الطلبات المدفوعة لمنتجاتك.'))}</div>`}
    ${dash.returns.length ? `<h3>${esc(tr('Returns', 'الإرجاعات'))}</h3><table><thead><tr><th>${esc(tr('Item', 'المنتج'))}</th><th>${esc(tr('Reason', 'السبب'))}</th><th>${esc(tr('Status', 'الحالة'))}</th></tr></thead><tbody>${dash.returns.map((r) => `<tr><td>${esc(nm(r.snapshot))}</td><td>${esc(r.reason)}</td><td>${badge(r.status)}</td></tr>`).join('')}</tbody></table>` : ''}</div>`;
  document.querySelectorAll('[data-next]').forEach((b) => { b.onclick = () => {
    const tracking = document.querySelector(`[data-tracking="${b.dataset.next}"]`)?.value.trim() || '';
    if (b.dataset.status === 'shipped' && !tracking) return showError(tr('Add the tracking details first.', 'أضف بيانات التتبع أولاً.'));
    act(() => m(`/fulfilments/${b.dataset.next}/status`, 'POST', { status: b.dataset.status, tracking }), tr('Order updated.', 'تم تحديث الطلب.'));
  }; });
}

// ── Bookings ─────────────────────────────────────────────────────────────
function renderBookings() {
  const rows = dash.appointments;
  $('page').innerHTML = `<div class="grid">${rows.length ? rows.map((a) => { const quote = ['requested', 'quoted'].includes(a.status); const work = ['booked', 'in_progress'].includes(a.status); return `<div class="card">
      <div class="row"><div><strong>${esc(nm(a))}</strong><div class="fine">${esc(when(a.starts_at))} · ${esc([a.make, a.model, a.year].filter(Boolean).join(' '))}</div></div><span class="spacer"></span>${badge(a.status)}</div>
      ${a.customer_notes ? `<p class="notice good" style="margin:12px 0">${esc(a.customer_notes)}</p>` : ''}
      <p class="fine">${esc(a.customer_name||'')} · ${esc(a.customer_phone||'')}</p>
      ${quote || work ? `<label style="margin-top:10px"><span>${esc(tr('Notes for the customer', 'ملاحظات للعميل'))}</span><textarea data-notes="${esc(a.id)}">${esc(a.technician_notes || '')}</textarea></label>` : ''}
      ${quote ? `<div class="row" style="margin-top:10px"><input type="number" min="0" step="0.001" data-price="${esc(a.id)}" placeholder="${esc(tr('Quote in OMR', 'العرض بالريال'))}" style="max-width:200px"><button class="primary small" data-quote="${esc(a.id)}">${esc(tr('Send quote', 'إرسال العرض'))}</button></div>` : ''}
      ${work ? `<div class="row" style="margin-top:10px"><button class="primary small" data-work="${esc(a.id)}" data-action="${a.status === 'booked' ? 'start' : 'complete'}">${esc(a.status === 'booked' ? tr('Start job', 'بدء العمل') : tr('Complete job', 'إكمال العمل'))}</button></div>` : ''}
    </div>`; }).join('') : `<div class="empty">${esc(tr('No bookings yet. Add appointment slots to a published service (Listings → Edit) so customers can book.', 'لا توجد حجوزات بعد. أضف مواعيد لخدمة منشورة (المنتجات ← تعديل) ليحجز العملاء.'))}</div>`}</div>`;
  const notes = (idv) => document.querySelector(`[data-notes="${idv}"]`)?.value || '';
  document.querySelectorAll('[data-quote]').forEach((b) => { b.onclick = () => {
    const price = Number(document.querySelector(`[data-price="${b.dataset.quote}"]`).value);
    if (!(price > 0)) return showError(tr('Enter the quote amount.', 'أدخل مبلغ العرض.'));
    act(() => m(`/appointments/${b.dataset.quote}/vendor`, 'POST', { action: 'quote', price: Math.round(price * 1000), notes: notes(b.dataset.quote) }), tr('Quote sent.', 'تم إرسال العرض.'));
  }; });
  document.querySelectorAll('[data-work]').forEach((b) => { b.onclick = () => act(() => m(`/appointments/${b.dataset.work}/vendor`, 'POST', { action: b.dataset.action, notes: notes(b.dataset.work) }), tr('Booking updated.', 'تم تحديث الحجز.')); });
}

// ── Payouts ──────────────────────────────────────────────────────────────
function renderPayouts() {
  const total = dash.settlements.reduce((n, s) => n + Number(s.amount), 0);
  $('page').innerHTML = `<div class="grid"><div class="notice good">${esc(tr('Go Watt pays completed orders after their return window ends, minus the agreed commission, and records each transfer here.', 'تدفع Go Watt قيمة الطلبات المكتملة بعد انتهاء مدة الإرجاع، مخصوماً منها العمولة المتفق عليها، وتسجل كل تحويل هنا.'))}</div>
    <div class="stats"><div class="stat good"><b>${esc(omr(total))}</b><span>${esc(tr('Total paid out', 'إجمالي المدفوع'))}</span></div><div class="stat"><b>${esc(vendor.commission_bps == null ? '—' : (vendor.commission_bps / 100).toFixed(1) + '%')}</b><span>${esc(tr('Commission', 'العمولة'))}</span></div></div>
    ${dash.settlements.length ? `<table><thead><tr><th>${esc(tr('Date', 'التاريخ'))}</th><th>${esc(tr('Amount', 'المبلغ'))}</th><th>${esc(tr('Reference', 'المرجع'))}</th></tr></thead><tbody>${dash.settlements.map((s) => `<tr><td>${esc(when(s.created_at))}</td><td><strong>${esc(omr(s.amount))}</strong></td><td>${esc(s.reference)}</td></tr>`).join('')}</tbody></table>` : `<div class="empty">${esc(tr('No payouts yet.', 'لا توجد دفعات بعد.'))}</div>`}</div>`;
}

// ── Business & team ──────────────────────────────────────────────────────
function renderBusiness() {
  const v = vendor;
  const inp = (name, en, ar, attrs = '') => `<label><span>${esc(tr(en, ar))}</span><input name="${name}" value="${esc(v[name] ?? '')}" ${attrs}></label>`;
  const area = (name, en, ar, cls = '') => `<label class="${cls}"><span>${esc(tr(en, ar))}</span><textarea name="${name}">${esc(v[name] ?? '')}</textarea></label>`;
  $('page').innerHTML = `<div class="grid" style="max-width:900px">
    <div class="card"><h3>${esc(tr('Approved details', 'البيانات المعتمدة'))}</h3>
      <p><strong>${esc(v.name)}</strong> · ${esc(v.name_ar)}</p><p class="muted">${esc(tr('CR number', 'السجل التجاري'))}: ${esc(v.cr_number)} · ${esc(typeLabel(v.seller_type))}</p>
      <p class="fine">${esc(tr('To change these, contact Go Watt — they were part of your approval.', 'لتغييرها تواصل مع Go Watt — فهي جزء من اعتماد نشاطك.'))}</p></div>
    <form class="card" id="profile-form"><h3>${esc(tr('Business profile', 'الملف التعريفي'))}</h3><div class="form-grid">
      ${inp('contact_phone', 'Contact phone', 'رقم التواصل')}${inp('email', 'Business email', 'البريد الإلكتروني للنشاط', 'type="email"')}
      ${inp('address', 'Address', 'العنوان')}${inp('logo_url', 'Logo image (HTTPS link)', 'الشعار (رابط HTTPS)', 'type="url"')}
      ${area('about', 'About — English', 'نبذة بالإنجليزية')}${area('about_ar', 'About — Arabic', 'نبذة بالعربية')}
      ${area('bank_details', 'Bank account for payouts', 'الحساب البنكي للدفعات', 'full')}
    </div><div class="row" style="margin-top:14px"><span class="spacer"></span><button class="primary" type="submit">${esc(tr('Save changes', 'حفظ التغييرات'))}</button></div></form>
    <form class="card" id="team-form"><h3>${esc(tr('Team', 'الفريق'))}</h3><p class="muted">${esc(tr('Staff sign in with their own Go Watt account and can manage listings, orders and bookings.', 'يسجل الموظفون الدخول بحساباتهم في Go Watt ويمكنهم إدارة المنتجات والطلبات والحجوزات.'))}</p>
      <div class="row"><input name="email" type="email" placeholder="${esc(tr('Staff member’s account email', 'البريد الإلكتروني لحساب الموظف'))}" style="flex:1;min-width:220px" required>
      <button class="primary" type="submit" name="op" value="add">${esc(tr('Add', 'إضافة'))}</button><button class="danger" type="submit" name="op" value="remove">${esc(tr('Remove', 'إزالة'))}</button></div></form></div>`;
  $('profile-form').onsubmit = (e) => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); f.logo_url = String(f.logo_url || '').trim() || null;
    act(() => m(`/vendors/${v.id}`, 'PATCH', f), tr('Saved.', 'تم الحفظ.')); };
  $('team-form').onsubmit = (e) => { e.preventDefault(); const email = new FormData(e.target).get('email'); const remove = e.submitter?.value === 'remove';
    act(() => m(`/vendors/${v.id}/members`, 'POST', { email, remove }), remove ? tr('Removed from your team.', 'تمت الإزالة من فريقك.') : tr('Added to your team.', 'تمت الإضافة إلى فريقك.')); };
}

// ── Boot ─────────────────────────────────────────────────────────────────
applyStatic();
api('/session').then((u) => { user = u; return load(); }).catch(() => showLogin());
