-- ============================================================
-- ATB SHOP
-- INVENTORY RESERVATIONS
--
-- Objetivo:
--
-- Evitar que dos clientes puedan iniciar Checkout utilizando
-- simultáneamente la última unidad de un producto.
--
-- Flujo:
--
-- stock físico
--      ↓
-- reserved_stock
--      ↓
-- available_stock
--
-- Checkout:
--   reserva inventario
--
-- Pago:
--   stock baja
--   reserved_stock baja
--
-- Cancelación / expiración:
--   stock no cambia
--   reserved_stock baja
-- ============================================================


-- ============================================================
-- 1. EXTEND INVENTORY
-- ============================================================

alter table public.shop_inventory
add column if not exists reserved_stock integer not null default 0;


-- ============================================================
-- RESERVED STOCK VALIDATION
-- ============================================================

alter table public.shop_inventory
drop constraint if exists shop_inventory_reserved_stock_check;

alter table public.shop_inventory
add constraint shop_inventory_reserved_stock_check
check (
  reserved_stock >= 0
  and reserved_stock <= stock
);


-- ============================================================
-- AVAILABLE STOCK
--
-- stock:
--   cantidad física total
--
-- reserved_stock:
--   unidades bloqueadas temporalmente por Checkout
--
-- available_stock:
--   unidades que todavía puede comprar otra persona
-- ============================================================

alter table public.shop_inventory
drop column if exists available_stock;

alter table public.shop_inventory
add column available_stock integer
generated always as (
  stock - reserved_stock
) stored;


-- ============================================================
-- 2. RESERVATION HEADER
-- ============================================================

create table if not exists public.shop_inventory_reservations (
  id uuid primary key default gen_random_uuid(),

  stripe_session_id text unique,

  status text not null default 'active',

  expires_at timestamptz not null,

  created_at timestamptz not null default now(),

  updated_at timestamptz not null default now(),

  released_at timestamptz,

  confirmed_at timestamptz,

  constraint shop_inventory_reservations_status_check
  check (
    status in (
      'active',
      'confirmed',
      'released',
      'expired',
      'failed'
    )
  )
);


-- ============================================================
-- 3. RESERVATION ITEMS
-- ============================================================

create table if not exists public.shop_inventory_reservation_items (
  id uuid primary key default gen_random_uuid(),

  reservation_id uuid not null
    references public.shop_inventory_reservations(id)
    on delete cascade,

  sku text not null,

  quantity integer not null,

  created_at timestamptz not null default now(),

  constraint shop_inventory_reservation_items_quantity_check
  check (
    quantity > 0
  ),

  constraint shop_inventory_reservation_items_unique_sku
  unique (
    reservation_id,
    sku
  )
);


-- ============================================================
-- 4. INDEXES
-- ============================================================

create index if not exists
shop_inventory_reservations_status_idx
on public.shop_inventory_reservations (
  status
);


create index if not exists
shop_inventory_reservations_expires_at_idx
on public.shop_inventory_reservations (
  expires_at
);


create index if not exists
shop_inventory_reservation_items_reservation_idx
on public.shop_inventory_reservation_items (
  reservation_id
);


create index if not exists
shop_inventory_reservation_items_sku_idx
on public.shop_inventory_reservation_items (
  sku
);


-- ============================================================
-- 5. ROW LEVEL SECURITY
--
-- El navegador NO debe modificar reservas directamente.
-- Todas las operaciones pasan por funciones SECURITY DEFINER.
-- ============================================================

alter table public.shop_inventory_reservations
enable row level security;

alter table public.shop_inventory_reservation_items
enable row level security;


-- ============================================================
-- 6. UPDATED_AT TRIGGER FUNCTION
-- ============================================================

create or replace function public.set_shop_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();

  return new;
end;
$$;


-- ============================================================
-- RESERVATIONS UPDATED_AT
-- ============================================================

drop trigger if exists
set_shop_inventory_reservations_updated_at
on public.shop_inventory_reservations;


create trigger
set_shop_inventory_reservations_updated_at
before update
on public.shop_inventory_reservations
for each row
execute function public.set_shop_updated_at();


-- ============================================================
-- INVENTORY UPDATED_AT
--
-- En caso de que todavía no exista trigger para shop_inventory,
-- garantizamos que cualquier reserva también actualice updated_at.
-- ============================================================

drop trigger if exists
set_shop_inventory_updated_at
on public.shop_inventory;


create trigger
set_shop_inventory_updated_at
before update
on public.shop_inventory
for each row
execute function public.set_shop_updated_at();


-- ============================================================
-- 7. RELEASE ONE RESERVATION
--
-- Esta función es idempotente.
--
-- Puede ejecutarse más de una vez sin devolver inventario doble.
--
-- Estados finales:
--
-- released
-- expired
-- failed
-- ============================================================

create or replace function public.release_shop_inventory_reservation(
  p_reservation_id uuid,
  p_status text default 'released'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_reservation public.shop_inventory_reservations%rowtype;

  v_item record;

  v_rows integer;
begin

  -- ==========================================================
  -- VALIDATE STATUS
  -- ==========================================================

  if p_status not in (
    'released',
    'expired',
    'failed'
  ) then
    raise exception
      'Invalid reservation release status: %',
      p_status;
  end if;


  -- ==========================================================
  -- LOCK RESERVATION
  -- ==========================================================

  select *
  into v_reservation
  from public.shop_inventory_reservations
  where id = p_reservation_id
  for update;


  -- ==========================================================
  -- NOT FOUND
  -- ==========================================================

  if not found then
    return jsonb_build_object(
      'success', false,
      'released', false,
      'reason', 'reservation_not_found'
    );
  end if;


  -- ==========================================================
  -- ALREADY CONFIRMED
  --
  -- Nunca liberamos stock reservado de una compra confirmada.
  -- ==========================================================

  if v_reservation.status = 'confirmed' then
    return jsonb_build_object(
      'success', true,
      'released', false,
      'duplicate', true,
      'status', v_reservation.status,
      'reservation_id', v_reservation.id
    );
  end if;


  -- ==========================================================
  -- ALREADY RELEASED
  -- ==========================================================

  if v_reservation.status in (
    'released',
    'expired',
    'failed'
  ) then
    return jsonb_build_object(
      'success', true,
      'released', false,
      'duplicate', true,
      'status', v_reservation.status,
      'reservation_id', v_reservation.id
    );
  end if;


  -- ==========================================================
  -- RELEASE EACH ITEM
  --
  -- ORDER BY sku reduce el riesgo de deadlocks.
  -- ==========================================================

  for v_item in
    select
      sku,
      quantity
    from public.shop_inventory_reservation_items
    where reservation_id = p_reservation_id
    order by sku
  loop

    -- --------------------------------------------------------
    -- Lock inventory row
    -- --------------------------------------------------------

    perform 1
    from public.shop_inventory
    where sku = v_item.sku
    for update;


    if not found then
      raise exception
        'Inventory SKU not found while releasing reservation: %',
        v_item.sku;
    end if;


    -- --------------------------------------------------------
    -- Release reserved quantity
    -- --------------------------------------------------------

    update public.shop_inventory
    set
      reserved_stock =
        reserved_stock - v_item.quantity
    where
      sku = v_item.sku
      and reserved_stock >= v_item.quantity;


    get diagnostics
      v_rows = row_count;


    if v_rows <> 1 then
      raise exception
        'Reserved inventory mismatch for SKU %',
        v_item.sku;
    end if;

  end loop;


  -- ==========================================================
  -- UPDATE RESERVATION
  -- ==========================================================

  update public.shop_inventory_reservations
  set
    status = p_status,
    released_at = now()
  where id = p_reservation_id;


  -- ==========================================================
  -- RESPONSE
  -- ==========================================================

  return jsonb_build_object(
    'success', true,
    'released', true,
    'duplicate', false,
    'status', p_status,
    'reservation_id', p_reservation_id
  );

end;
$$;


-- ============================================================
-- 8. RELEASE EXPIRED RESERVATIONS
--
-- Seguridad adicional.
--
-- Si por alguna razón Stripe no manda checkout.session.expired,
-- estas reservas pueden limpiarse posteriormente.
--
-- Utilizamos 5 minutos de gracia para evitar liberar una
-- reserva justo cuando un pago acaba de completarse y el
-- webhook todavía está en tránsito.
-- ============================================================

create or replace function public.release_expired_shop_reservations()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_reservation record;

  v_count integer := 0;
begin

  for v_reservation in
    select id
    from public.shop_inventory_reservations
    where
      status = 'active'
      and expires_at <
        (
          now()
          - interval '5 minutes'
        )
    order by expires_at
    for update skip locked
  loop

    perform public.release_shop_inventory_reservation(
      v_reservation.id,
      'expired'
    );

    v_count :=
      v_count + 1;

  end loop;


  return jsonb_build_object(
    'success', true,
    'released_count', v_count
  );

end;
$$;


-- ============================================================
-- 9. RESERVE INVENTORY
--
-- Input:
--
-- [
--   {
--     "sku": "ATB-VAPOR-CASSETTE-02",
--     "quantity": 1
--   }
-- ]
--
-- IMPORTANTE:
--
-- Esta operación es transaccional.
--
-- Si un solo artículo no tiene inventario suficiente,
-- toda la reserva falla.
-- ============================================================

create or replace function public.reserve_shop_inventory(
  p_items jsonb,
  p_ttl_minutes integer default 35
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_reservation_id uuid;

  v_expires_at timestamptz;

  v_item jsonb;

  v_sku text;

  v_quantity integer;

  v_stock integer;

  v_reserved_stock integer;

  v_active boolean;

  v_existing_count integer;
begin

  -- ==========================================================
  -- CLEAN OLD RESERVATIONS
  -- ==========================================================

  perform public.release_expired_shop_reservations();


  -- ==========================================================
  -- VALIDATE TTL
  --
  -- Stripe tendrá una sesión ligeramente más corta.
  -- La reserva dispone de margen para recibir el webhook.
  -- ==========================================================

  if
    p_ttl_minutes < 30
    or p_ttl_minutes > 60
  then
    raise exception
      'Reservation TTL must be between 30 and 60 minutes';
  end if;


  -- ==========================================================
  -- VALIDATE ITEMS
  -- ==========================================================

  if
    p_items is null
    or jsonb_typeof(p_items) <> 'array'
    or jsonb_array_length(p_items) = 0
  then
    raise exception
      'Reservation requires at least one item';
  end if;


  if
    jsonb_array_length(p_items) > 20
  then
    raise exception
      'Too many reservation items';
  end if;


  -- ==========================================================
  -- PREVENT DUPLICATE SKUS
  -- ==========================================================

  select
    count(*) - count(distinct item ->> 'sku')
  into
    v_existing_count
  from jsonb_array_elements(p_items) as item;


  if v_existing_count <> 0 then
    raise exception
      'Reservation contains duplicate SKUs';
  end if;


  -- ==========================================================
  -- CREATE RESERVATION
  -- ==========================================================

  v_reservation_id :=
    gen_random_uuid();

  v_expires_at :=
    now()
    +
    make_interval(
      mins => p_ttl_minutes
    );


  insert into public.shop_inventory_reservations (
    id,
    status,
    expires_at
  )
  values (
    v_reservation_id,
    'active',
    v_expires_at
  );


  -- ==========================================================
  -- PROCESS ITEMS IN CONSISTENT SKU ORDER
  -- ==========================================================

  for v_item in
    select value
    from jsonb_array_elements(p_items)
    order by value ->> 'sku'
  loop

    -- ========================================================
    -- SKU
    -- ========================================================

    v_sku :=
      upper(
        trim(
          v_item ->> 'sku'
        )
      );


    if
      v_sku is null
      or v_sku = ''
      or v_sku !~ '^[A-Z0-9-]+$'
    then
      raise exception
        'Invalid reservation SKU';
    end if;


    -- ========================================================
    -- QUANTITY
    -- ========================================================

    if
      not (
        v_item ? 'quantity'
      )
      or jsonb_typeof(
        v_item -> 'quantity'
      ) <> 'number'
      or (
        v_item ->> 'quantity'
      ) !~ '^[0-9]+$'
    then
      raise exception
        'Invalid quantity for SKU %',
        v_sku;
    end if;


    v_quantity :=
      (
        v_item ->> 'quantity'
      )::integer;


    if
      v_quantity <= 0
      or v_quantity > 20
    then
      raise exception
        'Invalid quantity for SKU %',
        v_sku;
    end if;


    -- ========================================================
    -- LOCK INVENTORY
    -- ========================================================

    select
      stock,
      reserved_stock,
      active
    into
      v_stock,
      v_reserved_stock,
      v_active
    from public.shop_inventory
    where sku = v_sku
    for update;


    if not found then
      raise exception
        'Inventory SKU not found: %',
        v_sku;
    end if;


    -- ========================================================
    -- ACTIVE
    -- ========================================================

    if not v_active then
      raise exception
        'Inventory SKU is inactive: %',
        v_sku;
    end if;


    -- ========================================================
    -- AVAILABLE STOCK
    -- ========================================================

    if
      (
        v_stock
        -
        v_reserved_stock
      )
      <
      v_quantity
    then
      raise exception
        'Insufficient inventory for SKU %',
        v_sku;
    end if;


    -- ========================================================
    -- RESERVE
    -- ========================================================

    update public.shop_inventory
    set
      reserved_stock =
        reserved_stock
        +
        v_quantity
    where sku = v_sku;


    -- ========================================================
    -- RESERVATION ITEM
    -- ========================================================

    insert into public.shop_inventory_reservation_items (
      reservation_id,
      sku,
      quantity
    )
    values (
      v_reservation_id,
      v_sku,
      v_quantity
    );

  end loop;


  -- ==========================================================
  -- RESPONSE
  -- ==========================================================

  return jsonb_build_object(
    'success', true,
    'reservation_id', v_reservation_id,
    'expires_at', v_expires_at
  );

end;
$$;


-- ============================================================
-- 10. ATTACH STRIPE SESSION
--
-- La reserva ocurre ANTES de crear la sesión de Stripe.
--
-- Después de crearla:
--
-- reservation
--      ↓
-- cs_test_...
--
-- quedan vinculados.
-- ============================================================

create or replace function public.attach_stripe_session_to_shop_reservation(
  p_reservation_id uuid,
  p_stripe_session_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_reservation public.shop_inventory_reservations%rowtype;
begin

  if
    p_stripe_session_id is null
    or trim(p_stripe_session_id) = ''
  then
    raise exception
      'Stripe session ID is required';
  end if;


  select *
  into v_reservation
  from public.shop_inventory_reservations
  where id = p_reservation_id
  for update;


  if not found then
    raise exception
      'Reservation not found';
  end if;


  if
    v_reservation.status <> 'active'
  then
    raise exception
      'Reservation is not active';
  end if;


  -- ==========================================================
  -- ALREADY ATTACHED TO SAME SESSION
  -- ==========================================================

  if
    v_reservation.stripe_session_id =
    p_stripe_session_id
  then
    return jsonb_build_object(
      'success', true,
      'duplicate', true,
      'reservation_id', p_reservation_id,
      'stripe_session_id', p_stripe_session_id
    );
  end if;


  -- ==========================================================
  -- ATTACHED TO ANOTHER SESSION
  -- ==========================================================

  if
    v_reservation.stripe_session_id
    is not null
  then
    raise exception
      'Reservation already belongs to another Stripe session';
  end if;


  -- ==========================================================
  -- ATTACH
  -- ==========================================================

  update public.shop_inventory_reservations
  set
    stripe_session_id =
      p_stripe_session_id
  where id =
    p_reservation_id;


  return jsonb_build_object(
    'success', true,
    'duplicate', false,
    'reservation_id', p_reservation_id,
    'stripe_session_id', p_stripe_session_id
  );

end;
$$;


-- ============================================================
-- 11. CONFIRM PAID ORDER FROM RESERVATION
--
-- Esta reemplazará en el webhook a:
--
-- process_paid_shop_order(...)
--
-- NO eliminamos todavía la función anterior.
--
-- Eso nos permite actualizar el código de Astro en el
-- siguiente paso sin romper temporalmente el webhook actual.
-- ============================================================

create or replace function public.process_paid_shop_order_with_reservation(
  p_reservation_id uuid,

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
set search_path = public, pg_temp
as $$
declare
  v_reservation public.shop_inventory_reservations%rowtype;

  v_order_id uuid;

  v_existing_order_id uuid;

  v_item jsonb;

  v_inventory_item record;

  v_sku text;

  v_quantity integer;

  v_reserved_quantity integer;

  v_product_name text;

  v_variant_description text;

  v_unit_amount integer;

  v_line_total integer;

  v_item_currency text;

  v_rows integer;

  v_expected_items integer;

  v_received_items integer;
begin

  -- ==========================================================
  -- VALIDATION
  -- ==========================================================

  if
    p_stripe_session_id is null
    or trim(p_stripe_session_id) = ''
  then
    raise exception
      'Stripe session ID is required';
  end if;


  if
    p_currency is null
    or trim(p_currency) = ''
  then
    raise exception
      'Currency is required';
  end if;


  if
    p_amount_total is null
    or p_amount_total < 0
  then
    raise exception
      'Invalid amount total';
  end if;


  if
    p_items is null
    or jsonb_typeof(p_items) <> 'array'
    or jsonb_array_length(p_items) = 0
  then
    raise exception
      'Order requires at least one item';
  end if;


  -- ==========================================================
  -- SERIALIZE DUPLICATE WEBHOOKS
  --
  -- Stripe puede reenviar el mismo evento.
  --
  -- Este lock evita que dos ejecuciones simultáneas intenten
  -- crear el mismo pedido.
  -- ==========================================================

  perform pg_advisory_xact_lock(
    hashtextextended(
      p_stripe_session_id,
      0
    )
  );


  -- ==========================================================
  -- IDEMPOTENCY
  -- ==========================================================

  select id
  into v_existing_order_id
  from public.shop_orders
  where stripe_session_id =
    p_stripe_session_id;


  if found then
    return jsonb_build_object(
      'success', true,
      'duplicate', true,
      'order_id', v_existing_order_id,
      'reservation_id', p_reservation_id
    );
  end if;


  -- ==========================================================
  -- LOCK RESERVATION
  -- ==========================================================

  select *
  into v_reservation
  from public.shop_inventory_reservations
  where id =
    p_reservation_id
  for update;


  if not found then
    raise exception
      'Reservation not found: %',
      p_reservation_id;
  end if;


  -- ==========================================================
  -- CONFIRMED RESERVATION
  -- ==========================================================

  if
    v_reservation.status = 'confirmed'
  then

    select id
    into v_existing_order_id
    from public.shop_orders
    where stripe_session_id =
      p_stripe_session_id;


    return jsonb_build_object(
      'success', true,
      'duplicate', true,
      'order_id', v_existing_order_id,
      'reservation_id', p_reservation_id
    );

  end if;


  -- ==========================================================
  -- INVALID RESERVATION STATE
  -- ==========================================================

  if
    v_reservation.status <> 'active'
  then
    raise exception
      'Reservation is not active. Current status: %',
      v_reservation.status;
  end if;


  -- ==========================================================
  -- VERIFY STRIPE SESSION
  -- ==========================================================

  if
    v_reservation.stripe_session_id
    is null
  then
    raise exception
      'Reservation has no Stripe session attached';
  end if;


  if
    v_reservation.stripe_session_id
    <>
    p_stripe_session_id
  then
    raise exception
      'Stripe session does not match reservation';
  end if;


  -- ==========================================================
  -- VERIFY ITEM COUNT
  -- ==========================================================

  select count(*)
  into v_expected_items
  from public.shop_inventory_reservation_items
  where reservation_id =
    p_reservation_id;


  v_received_items :=
    jsonb_array_length(
      p_items
    );


  if
    v_expected_items
    <>
    v_received_items
  then
    raise exception
      'Stripe item count does not match reservation';
  end if;


  -- ==========================================================
  -- VERIFY EACH STRIPE ITEM AGAINST RESERVATION
  -- ==========================================================

  for v_item in
    select value
    from jsonb_array_elements(
      p_items
    )
  loop

    v_sku :=
      upper(
        trim(
          v_item ->> 'sku'
        )
      );


    if
      v_sku is null
      or v_sku = ''
    then
      raise exception
        'Missing SKU in paid order';
    end if;


    if
      (
        v_item ->> 'quantity'
      ) !~ '^[0-9]+$'
    then
      raise exception
        'Invalid quantity for paid SKU %',
        v_sku;
    end if;


    v_quantity :=
      (
        v_item ->> 'quantity'
      )::integer;


    select quantity
    into v_reserved_quantity
    from public.shop_inventory_reservation_items
    where
      reservation_id =
        p_reservation_id
      and sku =
        v_sku;


    if not found then
      raise exception
        'Paid SKU was not reserved: %',
        v_sku;
    end if;


    if
      v_reserved_quantity
      <>
      v_quantity
    then
      raise exception
        'Paid quantity does not match reserved quantity for SKU %',
        v_sku;
    end if;

  end loop;


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
    nullif(
      trim(
        coalesce(
          p_stripe_payment_intent_id,
          ''
        )
      ),
      ''
    ),

    nullif(
      trim(
        coalesce(
          p_customer_email,
          ''
        )
      ),
      ''
    ),

    nullif(
      trim(
        coalesce(
          p_customer_name,
          ''
        )
      ),
      ''
    ),

    nullif(
      trim(
        coalesce(
          p_customer_phone,
          ''
        )
      ),
      ''
    ),

    lower(
      trim(
        p_currency
      )
    ),

    p_amount_total,

    'paid'
  )
  returning id
  into v_order_id;


  -- ==========================================================
  -- INSERT ORDER ITEMS
  -- ==========================================================

  for v_item in
    select value
    from jsonb_array_elements(
      p_items
    )
  loop

    v_sku :=
      upper(
        trim(
          v_item ->> 'sku'
        )
      );


    v_quantity :=
      (
        v_item ->> 'quantity'
      )::integer;


    v_product_name :=
      coalesce(
        nullif(
          trim(
            v_item ->> 'product_name'
          ),
          ''
        ),
        v_sku
      );


    v_variant_description :=
      nullif(
        trim(
          coalesce(
            v_item ->> 'variant_description',
            ''
          )
        ),
        ''
      );


    v_unit_amount :=
      coalesce(
        (
          v_item ->> 'unit_amount'
        )::integer,
        0
      );


    v_line_total :=
      coalesce(
        (
          v_item ->> 'line_total'
        )::integer,
        0
      );


    v_item_currency :=
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


    if
      v_quantity <= 0
      or v_unit_amount < 0
      or v_line_total < 0
    then
      raise exception
        'Invalid paid item values for SKU %',
        v_sku;
    end if;


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

      v_item_currency
    );

  end loop;


  -- ==========================================================
  -- CONSUME RESERVED INVENTORY
  --
  -- stock:
  --   baja definitivamente
  --
  -- reserved_stock:
  --   deja de estar reservado porque ya fue comprado
  -- ==========================================================

  for v_inventory_item in
    select
      sku,
      quantity
    from public.shop_inventory_reservation_items
    where reservation_id =
      p_reservation_id
    order by sku
  loop

    perform 1
    from public.shop_inventory
    where sku =
      v_inventory_item.sku
    for update;


    if not found then
      raise exception
        'Inventory SKU missing while confirming order: %',
        v_inventory_item.sku;
    end if;


    update public.shop_inventory
    set
      stock =
        stock
        -
        v_inventory_item.quantity,

      reserved_stock =
        reserved_stock
        -
        v_inventory_item.quantity
    where
      sku =
        v_inventory_item.sku

      and stock >=
        v_inventory_item.quantity

      and reserved_stock >=
        v_inventory_item.quantity;


    get diagnostics
      v_rows = row_count;


    if
      v_rows <> 1
    then
      raise exception
        'Unable to consume reserved inventory for SKU %',
        v_inventory_item.sku;
    end if;

  end loop;


  -- ==========================================================
  -- CONFIRM RESERVATION
  -- ==========================================================

  update public.shop_inventory_reservations
  set
    status =
      'confirmed',

    confirmed_at =
      now()
  where id =
    p_reservation_id;


  -- ==========================================================
  -- RESPONSE
  -- ==========================================================

  return jsonb_build_object(
    'success', true,
    'duplicate', false,
    'order_id', v_order_id,
    'reservation_id', p_reservation_id
  );

end;
$$;


-- ============================================================
-- 12. PERMISSIONS
--
-- Ninguna de estas funciones se debe ejecutar directamente
-- desde el cliente.
--
-- Sólo nuestro servidor Astro usando:
--
-- SUPABASE_SERVICE_ROLE_KEY
-- ============================================================


-- ------------------------------------------------------------
-- release_shop_inventory_reservation
-- ------------------------------------------------------------

revoke all
on function public.release_shop_inventory_reservation(
  uuid,
  text
)
from public;

revoke all
on function public.release_shop_inventory_reservation(
  uuid,
  text
)
from anon;

revoke all
on function public.release_shop_inventory_reservation(
  uuid,
  text
)
from authenticated;

grant execute
on function public.release_shop_inventory_reservation(
  uuid,
  text
)
to service_role;


-- ------------------------------------------------------------
-- release_expired_shop_reservations
-- ------------------------------------------------------------

revoke all
on function public.release_expired_shop_reservations()
from public;

revoke all
on function public.release_expired_shop_reservations()
from anon;

revoke all
on function public.release_expired_shop_reservations()
from authenticated;

grant execute
on function public.release_expired_shop_reservations()
to service_role;


-- ------------------------------------------------------------
-- reserve_shop_inventory
-- ------------------------------------------------------------

revoke all
on function public.reserve_shop_inventory(
  jsonb,
  integer
)
from public;

revoke all
on function public.reserve_shop_inventory(
  jsonb,
  integer
)
from anon;

revoke all
on function public.reserve_shop_inventory(
  jsonb,
  integer
)
from authenticated;

grant execute
on function public.reserve_shop_inventory(
  jsonb,
  integer
)
to service_role;


-- ------------------------------------------------------------
-- attach_stripe_session_to_shop_reservation
-- ------------------------------------------------------------

revoke all
on function public.attach_stripe_session_to_shop_reservation(
  uuid,
  text
)
from public;

revoke all
on function public.attach_stripe_session_to_shop_reservation(
  uuid,
  text
)
from anon;

revoke all
on function public.attach_stripe_session_to_shop_reservation(
  uuid,
  text
)
from authenticated;

grant execute
on function public.attach_stripe_session_to_shop_reservation(
  uuid,
  text
)
to service_role;


-- ------------------------------------------------------------
-- process_paid_shop_order_with_reservation
-- ------------------------------------------------------------

revoke all
on function public.process_paid_shop_order_with_reservation(
  uuid,
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
on function public.process_paid_shop_order_with_reservation(
  uuid,
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
on function public.process_paid_shop_order_with_reservation(
  uuid,
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
on function public.process_paid_shop_order_with_reservation(
  uuid,
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


-- ============================================================
-- 13. TABLE PERMISSIONS
--
-- RLS ya está habilitado.
--
-- Dejamos explícitamente sin acceso directo desde frontend.
-- ============================================================

revoke all
on table public.shop_inventory_reservations
from anon;

revoke all
on table public.shop_inventory_reservations
from authenticated;


revoke all
on table public.shop_inventory_reservation_items
from anon;

revoke all
on table public.shop_inventory_reservation_items
from authenticated;


-- ============================================================
-- END MIGRATION
-- ============================================================