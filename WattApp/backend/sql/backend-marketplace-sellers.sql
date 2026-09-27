-- ═══════════════════════════════════════════════════════════════════════════
--  GO WATT — Marketplace sellers: shops, service providers, or both
--
--  The "Shop" becomes a general EV Marketplace with two kinds of sellers:
--    shop     — sells EV products (chargers, cables, parts, accessories…)
--    service  — garages, installers, detailers: bookable services
--    both     — a business that does both
--  seller_type decides which listing kinds a seller may create (enforced in
--  marketplace.routes.ts saveProduct). Sellers also get a short public
--  profile (about text + logo) they can edit from the app or the web portal.
--
--  Categories gain a kind so the Products tab only shows product categories
--  and the Services tab only service categories, and the list is widened from
--  charging-only to general EV items.
--
--  Idempotent: safe to run more than once.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.market_vendors add column if not exists seller_type text not null default 'both';
do $$ begin
  alter table public.market_vendors add constraint market_vendors_seller_type_check
    check (seller_type in ('shop', 'service', 'both'));
exception when duplicate_object then null; end $$;
alter table public.market_vendors add column if not exists about    text not null default '';
alter table public.market_vendors add column if not exists about_ar text not null default '';
alter table public.market_vendors add column if not exists logo_url text;
alter table public.market_vendors add column if not exists email    text not null default '';

-- One seller account per owner (staff can still belong to several).
create unique index if not exists idx_market_vendors_one_per_owner on public.market_vendors (owner_id);

alter table public.market_categories add column if not exists kind text not null default 'physical';
do $$ begin
  alter table public.market_categories add constraint market_categories_kind_check
    check (kind in ('physical', 'service'));
exception when duplicate_object then null; end $$;
alter table public.market_categories add column if not exists sort_order integer not null default 100;

insert into public.market_categories (id, name, name_ar, kind, sort_order) values
  ('chargers',      'Home chargers',             'الشواحن المنزلية',               'physical', 10),
  ('cables',        'Cables & adapters',         'الكابلات والمحولات',             'physical', 20),
  ('accessories',   'EV accessories',            'إكسسوارات السيارات الكهربائية',  'physical', 30),
  ('parts',         'Parts & spares',            'قطع الغيار',                     'physical', 40),
  ('tyres',         'Tyres & wheels',            'الإطارات والجنوط',               'physical', 50),
  ('solar',         'Solar & home energy',       'الطاقة الشمسية والمنزلية',       'physical', 60),
  ('installation',  'Charger installation',      'تركيب الشواحن',                  'service',  10),
  ('maintenance',   'Maintenance & diagnostics', 'الصيانة والفحص',                 'service',  20),
  ('tyre-service',  'Tyre service',              'خدمة الإطارات',                  'service',  30),
  ('detailing',     'Detailing & car wash',      'التنظيف والتلميع',               'service',  40)
on conflict (id) do update set kind = excluded.kind, sort_order = excluded.sort_order;
