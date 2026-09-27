-- Marketplace tables are accessed only through the Node API. Money is integer baisa.
begin;
create table if not exists public.market_vendors (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles(id),
 name text not null, name_ar text not null, cr_number text not null, contact_phone text not null,
 address text not null, bank_details text not null default '',
 status text not null default 'pending' check(status in ('pending','approved','suspended')),
 commission_bps integer check(commission_bps between 0 and 10000),
 pickup_enabled boolean not null default true, delivery_enabled boolean not null default false,
 delivery_fee integer not null default 0 check(delivery_fee>=0), delivery_area text not null default '',
 rejection_reason text not null default '', created_at timestamptz not null default now(),
 unique(owner_id)
);
create table if not exists public.market_vendor_users (
 vendor_id uuid references public.market_vendors(id) on delete cascade,
 user_id uuid references public.profiles(id), primary key(vendor_id,user_id)
);
create table if not exists public.market_categories (
 id text primary key, name text not null, name_ar text not null
);
insert into public.market_categories values
 ('cables','Cables & adapters','الكابلات والمحولات'),('chargers','Home chargers','الشواحن المنزلية'),
 ('accessories','EV accessories','إكسسوارات السيارات الكهربائية'),('maintenance','Maintenance & diagnostics','الصيانة والفحص'),
 ('installation','Installation','التركيب') on conflict do nothing;
create table if not exists public.market_products (
 id uuid primary key default gen_random_uuid(), vendor_id uuid not null references public.market_vendors(id),
 category_id text not null references public.market_categories(id), kind text not null check(kind in ('physical','service')),
 name text not null, name_ar text not null, description text not null, description_ar text not null,
 image_url text not null default '', images jsonb not null default '[]',
 specifications jsonb not null default '{}', compatibility jsonb not null default '[]',
 warranty text not null, warranty_ar text not null, return_days integer not null default 7 check(return_days between 0 and 365),
 status text not null default 'draft' check(status in ('draft','pending','published','rejected','paused')),
 moderation_note text not null default '', version integer not null default 1,
 duration_minutes integer check(duration_minutes between 15 and 1440),
 service_location text not null default 'at_centre' check(service_location in ('at_centre','mobile')),
 price_basis text not null default 'fixed' check(price_basis in ('fixed','quote')),
 updated_at timestamptz not null default now(), created_at timestamptz not null default now()
);
create index if not exists market_products_catalog on public.market_products(status,category_id,kind);
create table if not exists public.market_variants (
 id uuid primary key default gen_random_uuid(), product_id uuid not null references public.market_products(id),
 sku text not null unique, name text not null, name_ar text not null,
 price integer not null check(price>0 and price<=10000000), stock integer not null default 0 check(stock>=0),
 version integer not null default 1
);
create table if not exists public.market_vehicles (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id),
 make text not null, model text not null, year integer not null check(year between 1990 and 2100),
 connector text not null, created_at timestamptz not null default now()
);
create table if not exists public.market_cart (
 user_id uuid references public.profiles(id), variant_id uuid references public.market_variants(id),
 quantity integer not null check(quantity between 1 and 99), primary key(user_id,variant_id)
);
create table if not exists public.market_orders (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id),
 request_key text not null, request_hash text not null, total integer not null check(total>0),
 status text not null default 'paid' check(status in ('paid','partially_refunded','refunded')),
 delivery_address text not null default '', phone text not null, created_at timestamptz not null default now(),
 unique(user_id,request_key)
);
create table if not exists public.market_fulfilments (
 id uuid primary key default gen_random_uuid(), order_id uuid not null references public.market_orders(id),
 vendor_id uuid not null references public.market_vendors(id), method text not null check(method in ('pickup','delivery','appointment')),
 status text not null default 'paid' check(status in ('paid','accepted','ready','shipped','completed','cancelled')),
 delivery_fee integer not null default 0, tracking text not null default '', completed_at timestamptz,
 unique(order_id,vendor_id)
);
alter table public.market_orders add column if not exists refunded_total integer not null default 0 check(refunded_total>=0 and refunded_total<=total);
create table if not exists public.market_order_items (
 id uuid primary key default gen_random_uuid(), order_id uuid not null references public.market_orders(id),
 fulfilment_id uuid not null references public.market_fulfilments(id), variant_id uuid not null references public.market_variants(id),
 quantity integer not null check(quantity>0), unit_price integer not null check(unit_price>0),
 commission_bps integer not null, snapshot jsonb not null, refunded boolean not null default false
);
create table if not exists public.market_returns (
 id uuid primary key default gen_random_uuid(), item_id uuid not null unique references public.market_order_items(id),
 user_id uuid not null references public.profiles(id), reason text not null,
 status text not null default 'requested' check(status in ('requested','approved','rejected','refunded')),
 resolution text not null default '', created_at timestamptz not null default now()
);
create table if not exists public.market_slots (
 id uuid primary key default gen_random_uuid(), product_id uuid not null references public.market_products(id),
 starts_at timestamptz not null, capacity integer not null check(capacity between 1 and 50),
 booked integer not null default 0 check(booked>=0 and booked<=capacity), unique(product_id,starts_at)
);
create table if not exists public.market_appointments (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id),
 product_id uuid not null references public.market_products(id), vehicle_id uuid not null references public.market_vehicles(id),
 slot_id uuid not null references public.market_slots(id), order_id uuid references public.market_orders(id),
 request_key text not null, status text not null default 'requested' check(status in ('requested','quoted','booked','in_progress','completed','cancelled')),
 quoted_price integer check(quoted_price>0), quote_version integer not null default 1,
 customer_notes text not null default '', technician_notes text not null default '',
 created_at timestamptz not null default now(), unique(user_id,request_key)
);
create table if not exists public.market_reviews (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id),
 product_id uuid not null references public.market_products(id), rating integer not null check(rating between 1 and 5),
 comment text not null, created_at timestamptz not null default now(), unique(user_id,product_id)
);
create table if not exists public.market_settlements (
 id uuid primary key default gen_random_uuid(), vendor_id uuid not null references public.market_vendors(id),
 amount integer not null check(amount>0), reference text not null unique, created_at timestamptz not null default now()
);
create table if not exists public.market_settlement_items (
 item_id uuid primary key references public.market_order_items(id), settlement_id uuid not null references public.market_settlements(id)
);
create table if not exists public.market_events (
 id uuid primary key default gen_random_uuid(), actor_id uuid references public.profiles(id),
 entity_id uuid not null, action text not null, detail jsonb not null default '{}', created_at timestamptz not null default now()
);
do $$ declare t text; r text; begin
 foreach t in array array['market_vendors','market_vendor_users','market_categories','market_products','market_variants','market_vehicles','market_cart','market_orders','market_fulfilments','market_order_items','market_returns','market_slots','market_appointments','market_reviews','market_settlements','market_settlement_items','market_events'] loop
  execute format('alter table public.%I enable row level security',t);
  foreach r in array array['anon','authenticated'] loop
   if exists(select 1 from pg_roles where rolname=r) then execute format('revoke all on public.%I from %I',t,r); end if;
  end loop;
 end loop;
end $$;
commit;
