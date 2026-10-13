-- ============================================================
-- ATB SHOP
-- ORDER EMAIL TRACKING
-- ============================================================

alter table public.shop_orders
add column if not exists confirmation_email_sent_at timestamptz;

alter table public.shop_orders
add column if not exists confirmation_email_id text;

alter table public.shop_orders
add column if not exists shipping_email_sent_at timestamptz;

alter table public.shop_orders
add column if not exists shipping_email_id text;

alter table public.shop_orders
add column if not exists email_last_error text;

-- ============================================================
-- INDEXES
-- ============================================================

create index if not exists shop_orders_confirmation_email_id_idx
on public.shop_orders (
  confirmation_email_id
)
where confirmation_email_id is not null;

create index if not exists shop_orders_shipping_email_id_idx
on public.shop_orders (
  shipping_email_id
)
where shipping_email_id is not null;

-- ============================================================
-- COMMENTS
-- ============================================================

comment on column public.shop_orders.confirmation_email_sent_at is
'Fecha en que ATB envió el correo de confirmación del pedido.';

comment on column public.shop_orders.confirmation_email_id is
'ID del correo de confirmación devuelto por Resend.';

comment on column public.shop_orders.shipping_email_sent_at is
'Fecha en que ATB envió el correo con la información de envío.';

comment on column public.shop_orders.shipping_email_id is
'ID del correo de envío devuelto por Resend.';

comment on column public.shop_orders.email_last_error is
'Último error conocido al intentar enviar un correo transaccional.';