import React, { useCallback, useMemo, useState } from 'react';
import { Image, Linking, Pressable, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { ENV } from '../../config/env';
import { market, omr } from '../../lib/marketplace';
import { COLORS } from '../../constants/colors';
import {
  CalendarIcon, CheckIcon, ClipboardIcon, CoinsIcon, GlobeIcon, PackageIcon, PlusIcon,
  StorefrontIcon, UsersIcon, WrenchIcon,
} from '../../components/icons';
import { useCopy } from './shared';
import { useStatus } from './AccountScreens';
import { Badge, Btn, Card, Empty, ErrorBox, Input, Pills, Screen, SectionTitle, Stat, T, toneFor, useKit } from './SellerKit';

type SellerType = 'shop' | 'service' | 'both';
type Tab = 'overview' | 'listings' | 'orders' | 'bookings' | 'payouts' | 'business';

// Seller portal. Anyone signed in can apply to sell; once they have a seller
// account this becomes their dashboard. The same data and actions are on the
// web seller portal (/seller/), so owners can manage from a computer too.
export default function PortalScreen({ navigation }: any) {
  const c = useCopy();
  const [portal, setPortal] = useState<any>(null);
  const [dash, setDash] = useState<any>(null);
  const [error, setError] = useState('');

  const load = async () => {
    setError('');
    try {
      const p = await market.get('/portal');
      setPortal(p);
      setDash(p.vendors[0] ? await market.get(`/vendors/${p.vendors[0].id}/dashboard`) : null);
    } catch (e: any) { setError(e.message); }
  };
  useFocusEffect(useCallback(() => { void load(); }, []));

  const webPortal = (
    <Pressable onPress={() => Linking.openURL(`${ENV.apiUrl}/seller/`)} hitSlop={8} accessibilityRole="link"
      accessibilityLabel={c('Open the web seller portal', 'فتح بوابة البائعين على الويب')}
      style={{ width: 42, height: 42, borderRadius: 21, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.card, alignItems: 'center', justifyContent: 'center' }}>
      <GlobeIcon size={19} color={COLORS.primaryDark} strokeWidth={2} />
    </Pressable>
  );

  if (!portal && !error) {
    return <Screen title={c('Seller portal', 'بوابة البائعين')} onBack={() => navigation.goBack()}><Card tone="soft" style={{ height: 120 }}><View /></Card><Card tone="soft" style={{ height: 220 }}><View /></Card></Screen>;
  }
  if (!dash) {
    return <Screen title={c('Sell on Go Watt', 'بع على Go Watt')} subtitle={c('Shops and service providers', 'المتاجر ومقدمو الخدمات')} onBack={() => navigation.goBack()} right={webPortal}>
      {!!error && <ErrorBox message={error} />}
      {portal && <Apply onDone={load} />}
    </Screen>;
  }
  return <Dashboard dash={dash} reload={load} navigation={navigation} right={webPortal} error={error} />;
}

// ── Application: type → business → payout ─────────────────────────────────
function Apply({ onDone }: { onDone: () => Promise<void> }) {
  const c = useCopy(); const k = useKit();
  const [step, setStep] = useState(0);
  const [type, setType] = useState<SellerType | null>(null);
  const [form, setForm] = useState({ name: '', name_ar: '', cr_number: '', contact_phone: '', email: '', address: '', about: '', about_ar: '', bank_details: '' });
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const set = (key: keyof typeof form) => (v: string) => setForm(f => ({ ...f, [key]: v }));

  const types: { key: SellerType; title: string; body: string; Icon: any }[] = [
    { key: 'shop', title: c('Shop', 'متجر'), body: c('Sell EV products: chargers, cables, parts, accessories.', 'بيع منتجات السيارات الكهربائية: شواحن، كابلات، قطع غيار، إكسسوارات.'), Icon: StorefrontIcon },
    { key: 'service', title: c('Service provider', 'مقدم خدمة'), body: c('Garages, installers, tyre and detailing centres — customers book appointments.', 'الورش والمركّبون ومراكز الإطارات والتنظيف — يحجز العملاء المواعيد.'), Icon: WrenchIcon },
    { key: 'both', title: c('Both', 'الاثنان معاً'), body: c('You sell products and also offer bookable services.', 'تبيع المنتجات وتقدم أيضاً خدمات قابلة للحجز.'), Icon: PackageIcon },
  ];
  const businessOk = !!(form.name.trim() && form.name_ar.trim() && form.cr_number.trim() && form.contact_phone.trim() && form.address.trim());
  const submit = async () => {
    setBusy(true); setError('');
    try { await market.post('/vendors', { seller_type: type, ...form }); await onDone(); }
    catch (e: any) { setError(e.message); setBusy(false); }
  };

  return <>
    <View style={{ flexDirection: k.row, gap: 6 }}>
      {[0, 1, 2].map(i => <View key={i} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i <= step ? COLORS.primary : COLORS.border }} />)}
    </View>

    {step === 0 && <>
      <T size={24} weight="extrabold">{c('What do you offer?', 'ماذا تقدم؟')}</T>
      <T color={COLORS.textSecondary}>{c('Go Watt reviews every seller before listings go live. You can list as soon as you apply.', 'تراجع Go Watt كل بائع قبل نشر منتجاته. يمكنك إضافة المنتجات فور تقديم الطلب.')}</T>
      {types.map(({ key, title, body, Icon }) => {
        const on = type === key;
        return (
          <Pressable key={key} onPress={() => setType(key)} accessibilityRole="radio" accessibilityState={{ checked: on }}>
            <Card tone={on ? 'good' : 'plain'} style={[{ flexDirection: k.row, alignItems: 'center', gap: 14 }, on && { borderColor: COLORS.primary, borderWidth: 1.5 }]}>
              <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: on ? COLORS.card : COLORS.primaryBg, alignItems: 'center', justifyContent: 'center' }}>
                <Icon size={24} color={COLORS.primaryDark} strokeWidth={1.9} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <T size={16} weight="bold">{title}</T>
                <T size={13} color={COLORS.textSecondary}>{body}</T>
              </View>
              <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: on ? COLORS.primary : COLORS.borderStrong, backgroundColor: on ? COLORS.primary : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                {on && <CheckIcon size={12} color="#fff" strokeWidth={3.5} />}
              </View>
            </Card>
          </Pressable>
        );
      })}
      <Btn label={c('Continue', 'متابعة')} disabled={!type} onPress={() => setStep(1)} />
    </>}

    {step === 1 && <>
      <T size={24} weight="extrabold">{c('Your business', 'بيانات نشاطك')}</T>
      <T color={COLORS.textSecondary}>{c('As shown on your commercial registration.', 'كما هي في سجلك التجاري.')}</T>
      <Input label={c('Business name — English', 'اسم النشاط بالإنجليزية')} value={form.name} onChangeText={set('name')} />
      <Input label={c('Business name — Arabic', 'اسم النشاط بالعربية')} value={form.name_ar} onChangeText={set('name_ar')} />
      <Input label={c('Commercial registration (CR) number', 'رقم السجل التجاري')} value={form.cr_number} onChangeText={set('cr_number')} keyboardType="number-pad" />
      <Input label={c('Contact phone', 'رقم التواصل')} value={form.contact_phone} onChangeText={set('contact_phone')} keyboardType="phone-pad" placeholder="+968 9XXXXXXX" />
      <Input label={c('Business email (optional)', 'البريد الإلكتروني للنشاط (اختياري)')} value={form.email} onChangeText={set('email')} keyboardType="email-address" autoCapitalize="none" />
      <Input label={type === 'shop' ? c('Pickup address', 'عنوان الاستلام') : c('Service centre address', 'عنوان مركز الخدمة')} value={form.address} onChangeText={set('address')} />
      <View style={{ flexDirection: k.row, gap: 10 }}>
        <View style={{ flex: 1 }}><Btn variant="secondary" label={c('Back', 'رجوع')} onPress={() => setStep(0)} /></View>
        <View style={{ flex: 2 }}><Btn label={c('Continue', 'متابعة')} disabled={!businessOk} onPress={() => setStep(2)} /></View>
      </View>
    </>}

    {step === 2 && <>
      <T size={24} weight="extrabold">{c('Payouts & profile', 'الدفعات والملف التعريفي')}</T>
      <Input label={c('Bank account for payouts (bank, name, IBAN)', 'الحساب البنكي للدفعات (البنك، الاسم، IBAN)')} value={form.bank_details} onChangeText={set('bank_details')} multiline />
      <Input label={c('About your business — English (optional)', 'نبذة عن نشاطك بالإنجليزية (اختياري)')} value={form.about} onChangeText={set('about')} multiline />
      <Input label={c('About your business — Arabic (optional)', 'نبذة عن نشاطك بالعربية (اختياري)')} value={form.about_ar} onChangeText={set('about_ar')} multiline />
      {!!error && <ErrorBox message={error} />}
      <View style={{ flexDirection: k.row, gap: 10 }}>
        <View style={{ flex: 1 }}><Btn variant="secondary" label={c('Back', 'رجوع')} onPress={() => setStep(1)} /></View>
        <View style={{ flex: 2 }}><Btn label={c('Submit application', 'إرسال الطلب')} disabled={!form.bank_details.trim()} loading={busy} onPress={submit} /></View>
      </View>
    </>}
  </>;
}

// ── Dashboard ──────────────────────────────────────────────────────────────
function Dashboard({ dash, reload, navigation, right, error }: any) {
  const c = useCopy(); const k = useKit(); const status = useStatus();
  const v = dash.vendor;
  const type: SellerType = v.seller_type ?? 'both';
  const sellsProducts = type !== 'service'; const sellsServices = type !== 'shop';
  const [tab, setTab] = useState<Tab>('overview');
  const [busy, setBusy] = useState(false); const [actionError, setActionError] = useState('');

  const act = async (path: string, body: any) => {
    setBusy(true); setActionError('');
    try { await market.post(path, body); await reload(); }
    catch (e: any) { setActionError(e.message); }
    finally { setBusy(false); }
  };

  const openOrders = dash.fulfilments.filter((f: any) => !['completed', 'cancelled', 'refunded'].includes(f.status));
  const upcoming = dash.appointments.filter((a: any) => ['requested', 'quoted', 'booked', 'in_progress'].includes(a.status));
  const live = dash.products.filter((p: any) => p.status === 'published').length;
  const inReview = dash.products.filter((p: any) => p.status === 'pending').length;
  const settled = dash.settlements.reduce((n: number, s: any) => n + Number(s.amount), 0);

  const tabs = [
    { key: 'overview' as Tab, label: c('Overview', 'نظرة عامة') },
    { key: 'listings' as Tab, label: c('Listings', 'المنتجات'), count: dash.products.length },
    ...(sellsProducts ? [{ key: 'orders' as Tab, label: c('Orders', 'الطلبات'), count: openOrders.length }] : []),
    ...(sellsServices ? [{ key: 'bookings' as Tab, label: c('Bookings', 'الحجوزات'), count: upcoming.length }] : []),
    { key: 'payouts' as Tab, label: c('Payouts', 'الدفعات') },
    { key: 'business' as Tab, label: c('Business', 'النشاط') },
  ];
  const typeLabel = type === 'shop' ? c('Shop', 'متجر') : type === 'service' ? c('Service provider', 'مقدم خدمة') : c('Shop & services', 'متجر وخدمات');
  const addListing = () => navigation.navigate('MarketProductEditor', { vendorId: v.id, sellerType: type });

  return (
    <Screen title={k.isRTL ? v.name_ar : v.name} subtitle={typeLabel} onBack={() => navigation.goBack()} right={right}>
      <Pills items={tabs} value={tab} onChange={setTab} />
      {!!error && <ErrorBox message={error} />}
      {!!actionError && <ErrorBox message={actionError} />}

      {tab === 'overview' && <>
        {v.status === 'pending' && <Card tone="warn"><T weight="bold">{c('Application under review', 'طلبك قيد المراجعة')}</T><T size={13.5} color={COLORS.textSecondary}>{c('Go Watt is checking your business. Add your listings now — they go live once you and each listing are approved.', 'تتحقق Go Watt من نشاطك. أضف منتجاتك الآن — تُنشر بعد اعتماد نشاطك وكل منتج.')}</T></Card>}
        {v.status === 'approved' && <Card tone="good"><T weight="bold">{c('Your store is live', 'متجرك منشور')}</T><T size={13.5} color={COLORS.textSecondary}>{c('Listings stay visible while they are fresh: confirm stock or edit each listing at least every 30 days.', 'تبقى المنتجات ظاهرة ما دامت محدّثة: أكّد المخزون أو عدّل كل منتج مرة كل 30 يوماً على الأقل.')}</T></Card>}
        {v.status === 'suspended' && <Card tone="error"><T weight="bold">{c('Store suspended', 'المتجر موقوف')}</T>{!!v.rejection_reason && <T size={13.5}>{v.rejection_reason}</T>}</Card>}
        {v.status !== 'suspended' && !!v.rejection_reason && <Card tone="warn"><T weight="bold">{c('Note from Go Watt', 'ملاحظة من Go Watt')}</T><T size={13.5}>{v.rejection_reason}</T></Card>}

        <View style={{ flexDirection: k.row, flexWrap: 'wrap', gap: 10 }}>
          <Stat label={c('Live listings', 'منتجات منشورة')} value={live} tone="good" />
          <Stat label={c('Awaiting review', 'بانتظار المراجعة')} value={inReview} tone={inReview ? 'warn' : 'plain'} />
          {sellsProducts && <Stat label={c('Orders to fulfil', 'طلبات للتجهيز')} value={openOrders.length} tone={openOrders.length ? 'warn' : 'plain'} />}
          {sellsServices && <Stat label={c('Upcoming bookings', 'حجوزات قادمة')} value={upcoming.length} tone={upcoming.length ? 'warn' : 'plain'} />}
          <Stat label={c('Paid out to you', 'المدفوع لك')} value={omr(settled)} />
        </View>
        <Btn label={c('Add a listing', 'إضافة منتج أو خدمة')} icon={<PlusIcon size={18} color="#fff" strokeWidth={2.4} />} onPress={addListing} />
      </>}

      {tab === 'listings' && <Listings dash={dash} sellsProducts={sellsProducts} addListing={addListing} navigation={navigation} type={type} reload={reload} />}

      {tab === 'orders' && <>
        {!openOrders.length && !dash.fulfilments.length && <Empty icon={<ClipboardIcon size={26} color={COLORS.primary} />} title={c('No orders yet', 'لا توجد طلبات بعد')} body={c('Paid orders for your products appear here.', 'تظهر هنا الطلبات المدفوعة لمنتجاتك.')} />}
        {dash.fulfilments.filter((f: any) => f.method !== 'appointment').map((f: any) => <OrderCard key={f.id} f={f} busy={busy} act={act} />)}
        {!!dash.returns.length && <SectionTitle>{c('Returns', 'الإرجاعات')}</SectionTitle>}
        {dash.returns.map((r: any) => (
          <Card key={r.id} style={{ gap: 6 }}>
            <View style={{ flexDirection: k.row, alignItems: 'center', gap: 8 }}><View style={{ flex: 1 }}><T weight="bold">{k.isRTL ? r.snapshot?.name_ar : r.snapshot?.name}</T></View><Badge label={status(r.status)} tone={toneFor(r.status)} /></View>
            <T size={13} color={COLORS.textSecondary}>{r.reason}</T>
          </Card>
        ))}
      </>}

      {tab === 'bookings' && <>
        {!dash.appointments.length && <Empty icon={<CalendarIcon size={26} color={COLORS.primary} />} title={c('No bookings yet', 'لا توجد حجوزات بعد')} body={c('Add appointment slots to a published service so customers can book.', 'أضف مواعيد متاحة لخدمة منشورة ليتمكن العملاء من الحجز.')} />}
        {dash.appointments.map((a: any) => <BookingCard key={a.id} a={a} busy={busy} act={act} />)}
      </>}

      {tab === 'payouts' && <>
        <Card tone="soft"><T size={13.5} color={COLORS.textSecondary}>{c('Go Watt pays completed orders after their return window ends, minus the agreed commission, and records each transfer here.', 'تدفع Go Watt قيمة الطلبات المكتملة بعد انتهاء مدة الإرجاع، مخصوماً منها العمولة المتفق عليها، وتسجل كل تحويل هنا.')}</T></Card>
        <View style={{ flexDirection: k.row, gap: 10 }}>
          <Stat label={c('Total paid out', 'إجمالي المدفوع')} value={omr(settled)} tone="good" />
          <Stat label={c('Commission', 'العمولة')} value={v.commission_bps === null || v.commission_bps === undefined ? '—' : `${(v.commission_bps / 100).toFixed(1)}%`} />
        </View>
        {!dash.settlements.length && <Empty icon={<CoinsIcon size={26} color={COLORS.primary} />} title={c('No payouts yet', 'لا توجد دفعات بعد')} />}
        {dash.settlements.map((s: any) => (
          <Card key={s.id} style={{ flexDirection: k.row, alignItems: 'center', gap: 10 }}>
            <View style={{ flex: 1 }}><T weight="bold">{omr(s.amount)}</T><T size={12.5} color={COLORS.textSecondary}>{s.reference} · {new Date(s.created_at).toLocaleDateString()}</T></View>
            <Badge label={c('Paid', 'مدفوع')} tone="good" />
          </Card>
        ))}
      </>}

      {tab === 'business' && <Business v={v} reload={reload} typeLabel={typeLabel} />}
    </Screen>
  );
}

function Listings({ dash, sellsProducts, addListing, navigation, type, reload }: any) {
  const c = useCopy(); const k = useKit(); const status = useStatus();
  const [filter, setFilter] = useState<'all' | 'published' | 'pending' | 'rejected' | 'paused'>('all');
  const [sheet, setSheet] = useState(''); const [result, setResult] = useState<any[]>([]); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const count = (s: string) => dash.products.filter((p: any) => p.status === s).length;
  const rows = useMemo(() => dash.products.filter((p: any) => filter === 'all' || p.status === filter), [dash.products, filter]);

  const importRows = async () => {
    setBusy(true); setError('');
    try {
      const rows = sheet.trim().split(/\r?\n/).map((line, n) => {
        const cells = line.split('\t');
        if (cells.length !== 12) throw new Error(`${c('Expected 12 columns in row', 'يجب أن يحتوي الصف على 12 عموداً')}: ${n + 1}`);
        const [sku, name, name_ar, price, stock, category_id, image_url, description, description_ar, warranty, warranty_ar, days] = cells;
        return { kind: 'physical', sku, name, name_ar, category_id, image_url, description, description_ar, warranty, warranty_ar, return_days: Number(days), variants: [{ sku, name: 'Standard', name_ar: 'قياسي', price: Math.round(Number(price) * 1000), stock: Number(stock) }] };
      });
      setResult(await market.post(`/vendors/${dash.vendor.id}/import`, rows)); setSheet(''); await reload();
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };

  return <>
    <Btn label={c('Add a listing', 'إضافة منتج أو خدمة')} icon={<PlusIcon size={18} color="#fff" strokeWidth={2.4} />} onPress={addListing} />
    <Pills value={filter} onChange={setFilter} items={[
      { key: 'all', label: c('All', 'الكل') }, { key: 'published', label: status('published'), count: count('published') },
      { key: 'pending', label: status('pending'), count: count('pending') }, { key: 'rejected', label: status('rejected'), count: count('rejected') },
      { key: 'paused', label: status('paused'), count: count('paused') },
    ]} />
    {!rows.length && <Empty icon={<PackageIcon size={26} color={COLORS.primary} />} title={filter === 'all' ? c('No listings yet', 'لا توجد منتجات بعد') : c('Nothing here', 'لا يوجد شيء هنا')} body={filter === 'all' ? c('Add your first product or service — it goes to Go Watt for a quick review.', 'أضف أول منتج أو خدمة — تُرسل إلى Go Watt لمراجعة سريعة.') : undefined} />}
    {rows.map((p: any) => {
      const prices = (p.variants ?? []).map((x: any) => x.price); const stock = (p.variants ?? []).reduce((n: number, x: any) => n + x.stock, 0);
      return (
        <Pressable key={p.id} onPress={() => navigation.navigate('MarketProductEditor', { vendorId: dash.vendor.id, product: p, sellerType: type })} accessibilityRole="button">
          <Card style={{ flexDirection: k.row, gap: 12, alignItems: 'center' }}>
            <View style={{ width: 64, height: 64, borderRadius: 12, overflow: 'hidden', backgroundColor: COLORS.backgroundAlt, alignItems: 'center', justifyContent: 'center' }}>
              {p.image_url ? <Image source={{ uri: p.image_url }} style={{ width: 64, height: 64 }} /> : p.kind === 'service' ? <WrenchIcon size={22} color={COLORS.textTertiary} /> : <PackageIcon size={22} color={COLORS.textTertiary} />}
            </View>
            <View style={{ flex: 1, gap: 3 }}>
              <T weight="bold" lines={2}>{k.isRTL ? p.name_ar : p.name}</T>
              <T size={12.5} color={COLORS.textSecondary}>
                {p.price_basis === 'quote' ? c('Quote', 'عرض سعر') : prices.length ? omr(Math.min(...prices)) : '—'}
                {p.kind === 'physical' ? ` · ${c('Stock', 'المخزون')} ${stock}` : ` · ${p.duration_minutes} ${c('min', 'دقيقة')}`}
              </T>
              {!!p.moderation_note && <T size={12.5} color={COLORS.goldDark} lines={2}>{p.moderation_note}</T>}
            </View>
            <Badge label={status(p.status)} tone={toneFor(p.status)} />
          </Card>
        </Pressable>
      );
    })}
    {sellsProducts && (
      <Card tone="soft">
        <T weight="bold">{c('Bulk import from a spreadsheet', 'استيراد جماعي من جدول بيانات')}</T>
        <T size={12.5} color={COLORS.textSecondary}>{c('Copy rows from Excel, without a header. Columns: SKU, English name, Arabic name, price in OMR, stock, category ID, image HTTPS URL, English description, Arabic description, English warranty, Arabic warranty, return days. Each row becomes a product awaiting review.', 'انسخ الصفوف من Excel دون العناوين. الأعمدة: رمز المنتج، الاسم بالإنجليزية، الاسم بالعربية، السعر بالر.ع، المخزون، رمز الفئة، رابط الصورة HTTPS، الوصف بالإنجليزية، الوصف بالعربية، الضمان بالإنجليزية، الضمان بالعربية، أيام الإرجاع. يصبح كل صف منتجاً بانتظار المراجعة.')}</T>
        <T size={12.5} color={COLORS.textSecondary}>{c('Product category IDs: chargers, cables, accessories, parts, tyres, solar.', 'رموز فئات المنتجات: chargers, cables, accessories, parts, tyres, solar.')}</T>
        <Input label={c('Paste rows', 'الصق الصفوف')} value={sheet} onChangeText={setSheet} multiline />
        <Btn variant="secondary" label={c('Validate & submit rows', 'التحقق وإرسال الصفوف')} disabled={!sheet.trim()} loading={busy} onPress={importRows} />
        {!!error && <ErrorBox message={error} />}
        {result.map(r => <T key={r.row} size={12.5} color={r.status === 'submitted' ? COLORS.primary : COLORS.error}>{c('Row', 'الصف')} {r.row}: {r.status === 'submitted' ? c('Submitted for review', 'تم الإرسال للمراجعة') : r.message}</T>)}
      </Card>
    )}
  </>;
}

function OrderCard({ f, busy, act }: any) {
  const c = useCopy(); const k = useKit(); const status = useStatus();
  const [tracking, setTracking] = useState(f.tracking ?? '');
  const next = f.status === 'paid' ? 'accepted' : f.status === 'accepted' ? (f.method === 'pickup' ? 'ready' : 'shipped') : ['ready', 'shipped'].includes(f.status) ? 'completed' : null;
  return (
    <Card>
      <View style={{ flexDirection: k.row, alignItems: 'center', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <T weight="bold">{c('Order', 'طلب')} #{String(f.order_id).slice(0, 8).toUpperCase()}</T>
          <T size={12.5} color={COLORS.textSecondary}>{new Date(f.created_at).toLocaleString()} · {f.method === 'pickup' ? c('Pickup', 'استلام') : c('Delivery', 'توصيل')}</T>
        </View>
        <Badge label={status(f.status)} tone={toneFor(f.status)} />
      </View>
      {f.items?.map((i: any) => (
        <View key={i.id} style={{ flexDirection: k.row, gap: 8 }}>
          <View style={{ flex: 1 }}><T size={13.5}>{k.isRTL ? i.snapshot.name_ar : i.snapshot.name} × {i.quantity}</T></View>
          <T size={13.5} weight="bold">{omr(i.unit_price * i.quantity)}</T>
        </View>
      ))}
      <T size={13} color={COLORS.textSecondary}>{f.phone}{f.delivery_address ? ` · ${f.delivery_address}` : ''}</T>
      {next === 'shipped' && <Input label={c('Tracking details', 'بيانات التتبع')} value={tracking} onChangeText={setTracking} placeholder={c('Courier and tracking number', 'شركة الشحن ورقم التتبع')} />}
      {next && <Btn small label={`${c('Mark as', 'تحديث إلى')} ${status(next)}`} disabled={busy || (next === 'shipped' && !tracking.trim())} onPress={() => act(`/fulfilments/${f.id}/status`, { status: next, tracking })} />}
    </Card>
  );
}

function BookingCard({ a, busy, act }: any) {
  const c = useCopy(); const k = useKit(); const status = useStatus();
  const [price, setPrice] = useState(''); const [notes, setNotes] = useState(a.technician_notes ?? '');
  const canQuote = ['requested', 'quoted'].includes(a.status); const canWork = ['booked', 'in_progress'].includes(a.status);
  return (
    <Card>
      <View style={{ flexDirection: k.row, alignItems: 'center', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <T weight="bold">{k.isRTL ? a.name_ar : a.name}</T>
          <T size={12.5} color={COLORS.textSecondary}>{new Date(a.starts_at).toLocaleString()} · {a.make} {a.model} {a.year}</T>
        </View>
        <Badge label={status(a.status)} tone={toneFor(a.status)} />
      </View>
      {!!a.customer_notes && <Card tone="soft" style={{ padding: 12 }}><T size={13}>{a.customer_notes}</T></Card>}
      {(canQuote || canWork) && <Input label={c('Notes for the customer', 'ملاحظات للعميل')} value={notes} onChangeText={setNotes} multiline />}
      {canQuote && <>
        <Input label={c('Quote (OMR)', 'عرض السعر (ر.ع)')} value={price} onChangeText={setPrice} keyboardType="decimal-pad" />
        <Btn small label={c('Send quote', 'إرسال عرض السعر')} disabled={busy || Number(price) <= 0} onPress={() => act(`/appointments/${a.id}/vendor`, { action: 'quote', price: Math.round(Number(price) * 1000), notes })} />
      </>}
      {canWork && <Btn small label={a.status === 'booked' ? c('Start job', 'بدء العمل') : c('Complete job', 'إكمال العمل')} disabled={busy} onPress={() => act(`/appointments/${a.id}/vendor`, { action: a.status === 'booked' ? 'start' : 'complete', notes })} />}
    </Card>
  );
}

function Business({ v, reload, typeLabel }: any) {
  const c = useCopy(); const k = useKit();
  const [form, setForm] = useState({ contact_phone: v.contact_phone ?? '', email: v.email ?? '', address: v.address ?? '', about: v.about ?? '', about_ar: v.about_ar ?? '', logo_url: v.logo_url ?? '', bank_details: v.bank_details ?? '' });
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState(''); const [error, setError] = useState('');
  const [email, setEmail] = useState(''); const [teamMsg, setTeamMsg] = useState('');
  const set = (key: keyof typeof form) => (val: string) => setForm(f => ({ ...f, [key]: val }));
  const save = async () => {
    setBusy(true); setError(''); setMsg('');
    try { await market.patch(`/vendors/${v.id}`, { ...form, logo_url: form.logo_url.trim() || null }); await reload(); setMsg(c('Saved.', 'تم الحفظ.')); }
    catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };
  const team = async (remove: boolean) => {
    setBusy(true); setError(''); setTeamMsg('');
    try { await market.post(`/vendors/${v.id}/members`, { email, remove }); setTeamMsg(remove ? c('Removed from your team.', 'تمت الإزالة من فريقك.') : c('Added — they can now open this portal.', 'تمت الإضافة — يمكنهم الآن فتح هذه البوابة.')); setEmail(''); }
    catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };
  return <>
    <Card tone="soft" style={{ gap: 6 }}>
      <View style={{ flexDirection: k.row, gap: 8 }}><T size={13} color={COLORS.textSecondary}>{c('Legal name', 'الاسم القانوني')}:</T><View style={{ flex: 1 }}><T size={13} weight="bold">{v.name} · {v.name_ar}</T></View></View>
      <View style={{ flexDirection: k.row, gap: 8 }}><T size={13} color={COLORS.textSecondary}>{c('CR number', 'السجل التجاري')}:</T><T size={13} weight="bold">{v.cr_number}</T></View>
      <View style={{ flexDirection: k.row, gap: 8 }}><T size={13} color={COLORS.textSecondary}>{c('Seller type', 'نوع البائع')}:</T><T size={13} weight="bold">{typeLabel}</T></View>
      <T size={12} color={COLORS.textTertiary}>{c('To change these, contact Go Watt — they were part of your approval.', 'لتغييرها تواصل مع Go Watt — فهي جزء من اعتماد نشاطك.')}</T>
    </Card>
    <SectionTitle>{c('Business profile', 'الملف التعريفي')}</SectionTitle>
    <Input label={c('Contact phone', 'رقم التواصل')} value={form.contact_phone} onChangeText={set('contact_phone')} keyboardType="phone-pad" />
    <Input label={c('Business email', 'البريد الإلكتروني للنشاط')} value={form.email} onChangeText={set('email')} keyboardType="email-address" autoCapitalize="none" />
    <Input label={c('Address', 'العنوان')} value={form.address} onChangeText={set('address')} />
    <Input label={c('About — English', 'نبذة بالإنجليزية')} value={form.about} onChangeText={set('about')} multiline />
    <Input label={c('About — Arabic', 'نبذة بالعربية')} value={form.about_ar} onChangeText={set('about_ar')} multiline />
    <Input label={c('Logo image (HTTPS link)', 'صورة الشعار (رابط HTTPS)')} value={form.logo_url} onChangeText={set('logo_url')} autoCapitalize="none" keyboardType="url" />
    <Input label={c('Bank account for payouts', 'الحساب البنكي للدفعات')} value={form.bank_details} onChangeText={set('bank_details')} multiline />
    {!!error && <ErrorBox message={error} />}
    {!!msg && <T color={COLORS.primary} weight="bold">{msg}</T>}
    <Btn label={c('Save changes', 'حفظ التغييرات')} loading={busy} disabled={!form.contact_phone.trim() || !form.address.trim() || !form.bank_details.trim()} onPress={save} />

    <SectionTitle>{c('Team', 'الفريق')}</SectionTitle>
    <Card tone="soft" style={{ flexDirection: k.row, gap: 10, alignItems: 'center' }}>
      <UsersIcon size={20} color={COLORS.primaryDark} />
      <View style={{ flex: 1 }}><T size={13}>{c('Staff sign in with their own Go Watt account and can manage listings, orders and bookings.', 'يسجل الموظفون الدخول بحساباتهم في Go Watt ويمكنهم إدارة المنتجات والطلبات والحجوزات.')}</T></View>
    </Card>
    <Input label={c('Staff member’s account email', 'البريد الإلكتروني لحساب الموظف')} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
    <View style={{ flexDirection: k.row, gap: 10 }}>
      <View style={{ flex: 1 }}><Btn small label={c('Add', 'إضافة')} disabled={busy || !email.trim()} onPress={() => team(false)} /></View>
      <View style={{ flex: 1 }}><Btn small variant="danger" label={c('Remove', 'إزالة')} disabled={busy || !email.trim()} onPress={() => team(true)} /></View>
    </View>
    {!!teamMsg && <T color={COLORS.primary} weight="bold">{teamMsg}</T>}
  </>;
}
