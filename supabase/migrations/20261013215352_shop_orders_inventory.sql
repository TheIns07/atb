-- ============================================================
-- ATB SHOP
-- Orders + Order Items + Inventory
-- ============================================================

create extension if not exists pgcrypto;

-- ============================================================
-- UPDATED_AT HELPER
-- ============================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================
-- SHOP ORDERS
-- ============================================================

create table if not exists public.shop_orders (
  id uuid primary key default gen_random_uuid(),

  stripe_session_id text not null unique,

  stripe_payment_intent_id text unique,

  customer_email text,
  customer_name text,
  customer_phone text,

  currency text not null,

  amount_total integer not null
    check (amount_total >= 0),

  status text not null default 'paid'
    check (
      status in (
        'paid',
        'pending',
        'failed',
        'refunded',
        'cancelled'
      )
    ),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- SHOP ORDER ITEMS
-- ============================================================

create table if not exists public.shop_order_items (
  id uuid primary key default gen_random_uuid(),

  order_id uuid not null
    references public.shop_orders(id)
    on delete cascade,

  sku text not null,

  product_name text not null,

  variant_description text,

  quantity integer not null
    check (quantity > 0),

  unit_amount integer not null
    check (unit_amount >= 0),

  line_total integer not null
    check (line_total >= 0),

  currency text not null,

  created_at timestamptz not null default now(),

  unique (
    order_id,
    sku
  )
);

-- ============================================================
-- SHOP INVENTORY
-- ============================================================

create table if not exists public.shop_inventory (
  sku text primary key,

  stock integer not null default 0
    check (stock >= 0),

  active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- INDEXES
-- ============================================================

create index if not exists
  shop_orders_created_at_idx
on public.shop_orders (
  created_at desc
);

create index if not exists
  shop_orders_customer_email_idx
on public.shop_orders (
  customer_email
);

create index if not exists
  shop_order_items_order_id_idx
on public.shop_order_items (
  order_id
);

create index if not exists
  shop_order_items_sku_idx
on public.shop_order_items (
  sku
);

-- ============================================================
-- UPDATED_AT TRIGGERS
-- ============================================================

drop trigger if exists
  shop_orders_set_updated_at
on public.shop_orders;

create trigger
  shop_orders_set_updated_at
before update
on public.shop_orders
for each row
execute function public.set_updated_at();


drop trigger if exists
  shop_inventory_set_updated_at
on public.shop_inventory;

create trigger
  shop_inventory_set_updated_at
before update
on public.shop_inventory
for each row
execute function public.set_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY
--
-- No queremos que el navegador pueda crear pedidos ni
-- modificar inventario directamente.
--
-- El webhook utilizará SUPABASE_SERVICE_ROLE_KEY.
-- ============================================================

alter table public.shop_orders
  enable row level security;

alter table public.shop_order_items
  enable row level security;

alter table public.shop_inventory
  enable row level security;

-- ============================================================
-- INITIAL INVENTORY
--
-- Camisa 01:
-- 3 unidades por variante.
--
-- Camisa 02:
-- todavía no disponible.
--
-- Objetos documentales:
-- piezas únicas.
-- ============================================================

insert into public.shop_inventory (
  sku,
  stock,
  active
)
values

-- ============================================================
-- SHIRT 01
-- ============================================================

(
  'ATB-SHIRT01-PETROLEO-S',
  3,
  true
),

(
  'ATB-SHIRT01-PETROLEO-M',
  3,
  true
),

(
  'ATB-SHIRT01-PETROLEO-L',
  3,
  true
),

(
  'ATB-SHIRT01-PETROLEO-XL',
  3,
  true
),

(
  'ATB-SHIRT01-ARENA-S',
  3,
  true
),

(
  'ATB-SHIRT01-ARENA-M',
  3,
  true
),

(
  'ATB-SHIRT01-ARENA-L',
  3,
  true
),

(
  'ATB-SHIRT01-ARENA-XL',
  3,
  true
),

(
  'ATB-SHIRT01-ARCILLA-S',
  3,
  true
),

(
  'ATB-SHIRT01-ARCILLA-M',
  3,
  true
),

(
  'ATB-SHIRT01-ARCILLA-L',
  3,
  true
),

(
  'ATB-SHIRT01-ARCILLA-XL',
  3,
  true
),

-- ============================================================
-- SHIRT 02
-- ============================================================

(
  'ATB-SHIRT02-ARENA-S',
  0,
  false
),

(
  'ATB-SHIRT02-ARENA-M',
  0,
  false
),

(
  'ATB-SHIRT02-ARENA-L',
  0,
  false
),

(
  'ATB-SHIRT02-ARENA-XL',
  0,
  false
),

(
  'ATB-SHIRT02-CARBON-S',
  0,
  false
),

(
  'ATB-SHIRT02-CARBON-M',
  0,
  false
),

(
  'ATB-SHIRT02-CARBON-L',
  0,
  false
),

(
  'ATB-SHIRT02-CARBON-XL',
  0,
  false
),

(
  'ATB-SHIRT02-ARCILLA-S',
  0,
  false
),

(
  'ATB-SHIRT02-ARCILLA-M',
  0,
  false
),

(
  'ATB-SHIRT02-ARCILLA-L',
  0,
  false
),

(
  'ATB-SHIRT02-ARCILLA-XL',
  0,
  false
),

-- ============================================================
-- DOCUMENTARY OBJECTS
-- ============================================================

(
  'ATB-VAPOR-CASSETTE-01',
  1,
  true
),

(
  'ATB-VAPOR-CASSETTE-02',
  1,
  true
),

(
  'ATB-SCRIPT-VAPORWAVE',
  1,
  true
),

(
  'ATB-SCRIPT-PSYCHEDELIA90',
  1,
  true
),

(
  'ATB-SCRIPT-SIGNALWAVE',
  1,
  true
),

(
  'ATB-DOC-CAMCORDER-01',
  1,
  true
)

on conflict (sku)
do nothing;

-- ============================================================
-- PROCESS PAID ORDER
--
-- Esta función hace TODO dentro de una misma transacción:
--
-- 1. crea el pedido;
-- 2. detecta duplicados;
-- 3. valida stock;
-- 4. descuenta stock;
-- 5. guarda artículos.
--
-- Si cualquier paso falla, PostgreSQL revierte todo.
-- ============================================================

create or replace function public.process_paid_shop_order(
  p_stripe_session_id text,

  p_stripe_payment_intent_id text,

  p_customer_email text,

  p_customer_name text,

  p_customer_phone text,

  p_currency text,

  p_amount_total integer,

  p_items jsonb
)
returns jsonb

language plpgsql

security definer

set search_path = public

as $$

declare
  v_order_id uuid;

  v_existing_order_id uuid;

  v_item jsonb;

  v_sku text;

  v_product_name text;

  v_variant_description text;

  v_quantity integer;

  v_unit_amount integer;

  v_line_total integer;

  v_currency text;

  v_remaining_stock integer;

begin

  -- ==========================================================
  -- BASIC VALIDATION
  -- ==========================================================

  if
    p_stripe_session_id is null
    or length(trim(p_stripe_session_id)) = 0
  then
    raise exception
      'stripe_session_id is required';
  end if;


  if
    p_amount_total is null
    or p_amount_total < 0
  then
    raise exception
      'Invalid amount_total';
  end if;


  if
    p_items is null
    or jsonb_typeof(p_items) <> 'array'
    or jsonb_array_length(p_items) = 0
  then
    raise exception
      'Order must contain at least one item';
  end if;

  -- ==========================================================
  -- IDEMPOTENCY
  --
  -- Stripe puede entregar el mismo webhook más de una vez.
  -- Si la sesión ya existe, no descontamos inventario otra vez.
  -- ==========================================================

  select id
  into v_existing_order_id
  from public.shop_orders
  where stripe_session_id =
    p_stripe_session_id;

  if
    v_existing_order_id is not null
  then

    return jsonb_build_object(
      'success',
      true,

      'duplicate',
      true,

      'order_id',
      v_existing_order_id
    );

  end if;

  -- ==========================================================
  -- CREATE ORDER
  -- ==========================================================

  insert into public.shop_orders (
    stripe_session_id,

    stripe_payment_intent_id,

    customer_email,

    customer_name,

    customer_phone,

    currency,

    amount_total,

    status
  )
  values (
    p_stripe_session_id,

    p_stripe_payment_intent_id,

    p_customer_email,

    p_customer_name,

    p_customer_phone,

    lower(p_currency),

    p_amount_total,

    'paid'
  )
  returning id
  into v_order_id;

  -- ==========================================================
  -- ITEMS
  -- ==========================================================

  for
    v_item
  in
    select *
    from jsonb_array_elements(
      p_items
    )
  loop

    v_sku :=
      trim(
        v_item ->> 'sku'
      );


    v_product_name :=
      trim(
        v_item ->> 'product_name'
      );


    v_variant_description :=
      nullif(
        trim(
          v_item ->> 'variant_description'
        ),
        ''
      );


    v_quantity :=
      (
        v_item ->> 'quantity'
      )::integer;


    v_unit_amount :=
      (
        v_item ->> 'unit_amount'
      )::integer;


    v_line_total :=
      (
        v_item ->> 'line_total'
      )::integer;


    v_currency :=
      lower(
        coalesce(
          nullif(
            trim(
              v_item ->> 'currency'
            ),
            ''
          ),
          p_currency
        )
      );

    -- ========================================================
    -- VALIDATE ITEM
    -- ========================================================

    if
      v_sku is null
      or length(v_sku) = 0
    then
      raise exception
        'Item SKU is required';
    end if;


    if
      v_product_name is null
      or length(v_product_name) = 0
    then
      raise exception
        'Product name is required for SKU %',
        v_sku;
    end if;


    if
      v_quantity is null
      or v_quantity <= 0
    then
      raise exception
        'Invalid quantity for SKU %',
        v_sku;
    end if;


    if
      v_unit_amount is null
      or v_unit_amount < 0
    then
      raise exception
        'Invalid unit amount for SKU %',
        v_sku;
    end if;


    if
      v_line_total is null
      or v_line_total < 0
    then
      raise exception
        'Invalid line total for SKU %',
        v_sku;
    end if;

    -- ========================================================
    -- DECREMENT STOCK ATOMICALLY
    --
    -- Sólo actualiza cuando:
    --
    -- active = true
    -- stock >= quantity
    --
    -- Así nunca podemos terminar en stock negativo.
    -- ========================================================

    update public.shop_inventory

    set
      stock =
        stock -
        v_quantity

    where
      sku =
        v_sku

      and active =
        true

      and stock >=
        v_quantity

    returning stock
    into v_remaining_stock;

    -- ========================================================
    -- STOCK ERROR
    -- ========================================================

    if
      not found
    then

      raise exception
        'Insufficient or unavailable stock for SKU %',
        v_sku;

    end if;

    -- ========================================================
    -- ORDER ITEM
    -- ========================================================

    insert into public.shop_order_items (
      order_id,

      sku,

      product_name,

      variant_description,

      quantity,

      unit_amount,

      line_total,

      currency
    )
    values (
      v_order_id,

      v_sku,

      v_product_name,

      v_variant_description,

      v_quantity,

      v_unit_amount,

      v_line_total,

      v_currency
    );

  end loop;

  -- ==========================================================
  -- SUCCESS
  -- ==========================================================

  return jsonb_build_object(
    'success',
    true,

    'duplicate',
    false,

    'order_id',
    v_order_id
  );

end;

$$;

-- ============================================================
-- FUNCTION SECURITY
--
-- Nadie desde el navegador debe poder ejecutar esto.
-- Sólo nuestro backend con service_role.
-- ============================================================

revoke all
on function public.process_paid_shop_order(
  text,
  text,
  text,
  text,
  text,
  text,
  integer,
  jsonb
)
from public;

revoke all
on function public.process_paid_shop_order(
  text,
  text,
  text,
  text,
  text,
  text,
  integer,
  jsonb
)
from anon;

revoke all
on function public.process_paid_shop_order(
  text,
  text,
  text,
  text,
  text,
  text,
  integer,
  jsonb
)
from authenticated;

grant execute
on function public.process_paid_shop_order(
  text,
  text,
  text,
  text,
  text,
  text,
  integer,
  jsonb
)
to service_role;