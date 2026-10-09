import { pool } from '../../db/pool';
import { notify } from '../../integrations/notify';

// Marketplace notifications: admins hear about new applications and listings
// to review; sellers hear the outcome of every review. Each message is written
// in both languages — English in title/body (used for push + email), Arabic in
// data.title_ar/body_ar, which the app shows when it is in Arabic.
// data.screen tells the app where a tap should go; data.page does the same for
// the web dashboard. All calls are fire-and-forget: a failed notification must
// never fail the action that caused it.

type Text = { title: string; body: string };

async function adminIds(): Promise<string[]> {
  const { rows } = await pool.query(`select id from public.profiles where role in ('admin','superadmin') and is_active = true`);
  return rows.map(r => r.id);
}
// Owner plus staff: everyone who manages the store.
async function sellerIds(vendorId: string): Promise<string[]> {
  const { rows } = await pool.query(
    `select owner_id as id from public.market_vendors where id = $1
     union select user_id from public.market_vendor_users where vendor_id = $1`, [vendorId]);
  return rows.map(r => r.id);
}

function send(userIds: string[], kind: string, en: Text, ar: Text, data: Record<string, any>, email: boolean) {
  if (!userIds.length) return;
  notify({ userIds, category: 'booking', kind, title: en.title, body: en.body, data: { ...data, title_ar: ar.title, body_ar: ar.body }, email })
    // eslint-disable-next-line no-console
    .catch(e => console.error(`[marketplace notify] ${kind} failed:`, e?.message ?? e));
}

const typeText = (t: string) => t === 'shop' ? ['a shop', 'متجر'] : t === 'service' ? ['a service provider', 'مقدم خدمة'] : ['a shop & service provider', 'متجر ومقدم خدمة'];

// ── To admins ──────────────────────────────────────────────────────────────
export async function sellerApplied(v: { id: string; name: string; name_ar: string; seller_type: string }) {
  const [en, ar] = typeText(v.seller_type);
  send(await adminIds(), 'seller_application',
    { title: 'New seller application', body: `${v.name} applied to sell as ${en}. Review it in the dashboard.` },
    { title: 'طلب بائع جديد', body: `قدّم ${v.name_ar} طلباً للبيع بصفة ${ar}. راجعه في لوحة التحكم.` },
    { vendor_id: v.id, page: 'vendors', filter: { status: 'pending' } }, true);
}

export async function listingsSubmitted(vendorId: string, names: string[]) {
  if (!names.length) return;
  const { rows } = await pool.query('select name, name_ar from public.market_vendors where id = $1', [vendorId]);
  const v = rows[0]; if (!v) return;
  const one = names.length === 1;
  send(await adminIds(), 'listing_submitted',
    { title: one ? 'Listing to review' : `${names.length} listings to review`, body: one ? `${v.name} submitted “${names[0]}” for review.` : `${v.name} submitted ${names.length} listings for review.` },
    { title: one ? 'منتج بانتظار المراجعة' : `${names.length} منتجات بانتظار المراجعة`, body: one ? `أرسل ${v.name_ar} «${names[0]}» للمراجعة.` : `أرسل ${v.name_ar} ${names.length} منتجات للمراجعة.` },
    { vendor_id: vendorId, page: 'products', filter: { status: 'pending' } }, false);
}

// ── To sellers ─────────────────────────────────────────────────────────────
export async function sellerReviewed(before: any, after: any) {
  const note = (after.rejection_reason ?? '').trim();
  const noteChanged = note && note !== (before.rejection_reason ?? '').trim();
  const data = { vendor_id: after.id, screen: 'MarketPortal' };
  let en: Text | null = null; let ar: Text | null = null; let kind = 'seller_update';
  if (after.status !== before.status && after.status === 'approved') {
    kind = 'seller_approved';
    en = { title: 'Your store is approved', body: `${after.name} is live on the Go Watt Marketplace. Published listings are now visible to customers.${note ? ` Note: ${note}` : ''}` };
    ar = { title: 'تم اعتماد متجرك', body: `أصبح ${after.name_ar} متاحاً في سوق Go Watt. المنتجات المنشورة تظهر الآن للعملاء.${note ? ` ملاحظة: ${note}` : ''}` };
  } else if (after.status !== before.status && after.status === 'suspended') {
    kind = 'seller_suspended';
    en = { title: 'Your store is suspended', body: note ? `Reason: ${note}` : 'Contact Go Watt for details.' };
    ar = { title: 'تم إيقاف متجرك', body: note ? `السبب: ${note}` : 'تواصل مع Go Watt لمعرفة التفاصيل.' };
  } else if (after.status !== before.status && after.status === 'pending') {
    en = { title: 'Your store is back under review', body: note || 'Go Watt will be in touch.' };
    ar = { title: 'متجرك قيد المراجعة مجدداً', body: note || 'ستتواصل معك Go Watt.' };
  } else if (noteChanged) {
    kind = 'seller_action_needed';
    en = { title: 'Action needed on your store', body: note };
    ar = { title: 'مطلوب إجراء على متجرك', body: note };
  }
  if (en && ar) send(await sellerIds(after.id), kind, en, ar, data, true);
}

export async function listingReviewed(p: { id: string; vendor_id: string; name: string; name_ar: string }, status: string, note: string) {
  const data = { product_id: p.id, vendor_id: p.vendor_id, screen: 'MarketPortal' };
  const n = note.trim();
  if (status === 'published') send(await sellerIds(p.vendor_id), 'listing_published',
    { title: 'Listing published', body: `“${p.name}” is now live in the Marketplace.` },
    { title: 'تم نشر المنتج', body: `أصبح «${p.name_ar}» متاحاً الآن في السوق.` }, data, false);
  if (status === 'rejected') send(await sellerIds(p.vendor_id), 'listing_changes_needed',
    { title: 'Changes needed on a listing', body: `“${p.name}”: ${n}` },
    { title: 'مطلوب تعديلات على منتج', body: `«${p.name_ar}»: ${n}` }, data, true);
  if (status === 'paused') send(await sellerIds(p.vendor_id), 'listing_paused',
    { title: 'Listing paused', body: `“${p.name}” was paused${n ? `: ${n}` : '.'}` },
    { title: 'تم إيقاف منتج مؤقتاً', body: `تم إيقاف «${p.name_ar}» مؤقتاً${n ? `: ${n}` : '.'}` }, data, true);
}
