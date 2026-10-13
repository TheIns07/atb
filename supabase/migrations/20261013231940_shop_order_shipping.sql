-- ============================================================
-- ATB SHOP
-- SHIPPING / FULFILLMENT
-- ============================================================

-- ============================================================
-- ORDER AMOUNTS
-- ============================================================

alter table public.shop_orders
add column if not exists amount_subtotal integer;

alter table public.shop_orders
add column if not exists amount_shipping integer not null default 0;

-- Pedidos anteriores:
-- como todavía no tenían envío separado, tomamos amount_total
-- como subtotal inicial.

update public.shop_orders
set amount_subtotal = amount_total
where amount_subtotal is null;

alter table public.shop_orders
alter column amount_subtotal set not null;

-- ============================================================
-- SHIPPING METHOD
-- ============================================================

alter table public.shop_orders
add column if not exists shipping_method text;

alter table public.shop_orders
add column if not exists shipping_status text not null default 'pending';

-- ============================================================
-- SHIPPING CONTACT
-- ============================================================

alter table public.shop_orders
add column if not exists shipping_name text;

alter table public.shop_orders
add column if not exists shipping_phone text;

-- ============================================================
-- SHIPPING ADDRESS
-- ============================================================

alter table public.shop_orders
add column if not exists shipping_address_line1 text;

alter table public.shop_orders
add column if not exists shipping_address_line2 text;

alter table public.shop_orders
add column if not exists shipping_city text;

alter table public.shop_orders
add column if not exists shipping_state text;

alter table public.shop_orders
add column if not exists shipping_postal_code text;

alter table public.shop_orders
add column if not exists shipping_country text;

-- ============================================================
-- FULFILLMENT / TRACKING
-- ============================================================

alter table public.shop_orders
add column if not exists carrier text;

alter table public.shop_orders
add column if not exists tracking_number text;

alter table public.shop_orders
add column if not exists shipped_at timestamptz;

alter table public.shop_orders
add column if not exists delivered_at timestamptz;

-- ============================================================
-- CONSTRAINTS
-- ============================================================

alter table public.shop_orders
drop constraint if exists shop_orders_amount_subtotal_check;

alter table public.shop_orders
add constraint shop_orders_amount_subtotal_check
check (
  amount_subtotal >= 0
);

alter table public.shop_orders
drop constraint if exists shop_orders_amount_shipping_check;

alter table public.shop_orders
add constraint shop_orders_amount_shipping_check
check (
  amount_shipping >= 0
);

alter table public.shop_orders
drop constraint if exists shop_orders_shipping_status_check;

alter table public.shop_orders
add constraint shop_orders_shipping_status_check
check (
  shipping_status in (
    'pending',
    'ready',
    'shipped',
    'delivered',
    'cancelled'
  )
);

-- ============================================================
-- INDEXES
-- ============================================================

create index if not exists shop_orders_shipping_status_idx
on public.shop_orders (
  shipping_status
);

create index if not exists shop_orders_tracking_number_idx
on public.shop_orders (
  tracking_number
)
where tracking_number is not null;

create index if not exists shop_orders_created_at_idx
on public.shop_orders (
  created_at desc
);

-- ============================================================
-- COMMENTS
-- ============================================================

comment on column public.shop_orders.amount_subtotal is
'Subtotal de productos en centavos antes del envío.';

comment on column public.shop_orders.amount_shipping is
'Costo de envío cobrado al comprador en centavos.';

comment on column public.shop_orders.shipping_method is
'Método de envío seleccionado en Checkout.';

comment on column public.shop_orders.shipping_status is
'Estado operativo del envío: pending, ready, shipped, delivered o cancelled.';

comment on column public.shop_orders.carrier is
'Paquetería utilizada para el envío.';

comment on column public.shop_orders.tracking_number is
'Número de guía proporcionado por la paquetería.';