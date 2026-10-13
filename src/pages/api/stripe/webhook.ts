import type {
  APIRoute,
} from "astro";

import Stripe from "stripe";

import {
  createClient,
} from "@supabase/supabase-js";

// ============================================================
// SERVER ONLY
// ============================================================

export const prerender =
  false;

// ============================================================
// ENVIRONMENT
// ============================================================

const stripeSecretKey =
  import.meta.env
    .STRIPE_SECRET_KEY;

const stripeWebhookSecret =
  import.meta.env
    .STRIPE_WEBHOOK_SECRET;

const supabaseUrl =
  import.meta.env
    .SUPABASE_URL;

const supabaseServiceRoleKey =
  import.meta.env
    .SUPABASE_SERVICE_ROLE_KEY;

// ============================================================
// STRIPE
// ============================================================

const stripe =
  stripeSecretKey
    ? new Stripe(
        stripeSecretKey,
      )
    : null;

// ============================================================
// SUPABASE
// ============================================================

const supabase =
  supabaseUrl &&
  supabaseServiceRoleKey
    ? createClient(
        supabaseUrl,
        supabaseServiceRoleKey,
        {
          auth: {
            persistSession:
              false,

            autoRefreshToken:
              false,

            detectSessionInUrl:
              false,
          },
        },
      )
    : null;

// ============================================================
// TYPES
// ============================================================

type ShopOrderItem = {
  sku: string;

  product_name: string;

  variant_description:
    | string
    | null;

  quantity: number;

  unit_amount: number;

  line_total: number;

  currency: string;
};

type ProcessOrderResponse = {
  success?: boolean;

  duplicate?: boolean;

  order_id?: string;

  reservation_id?: string;
};

type ReleaseReservationResponse = {
  success?: boolean;

  released?: boolean;

  duplicate?: boolean;

  status?: string;

  reservation_id?: string;
};

// ============================================================
// RESPONSE
// ============================================================

function jsonResponse(
  body: Record<
    string,
    unknown
  >,

  status = 200,
): Response {
  return new Response(
    JSON.stringify(
      body,
    ),
    {
      status,

      headers: {
        "Content-Type":
          "application/json",

        "Cache-Control":
          "no-store",
      },
    },
  );
}

// ============================================================
// UUID
// ============================================================

function isUuid(
  value:
    | string
    | null
    | undefined,
): value is string {
  if (!value) {
    return false;
  }

  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

// ============================================================
// PAYMENT INTENT ID
// ============================================================

function getPaymentIntentId(
  session:
    Stripe.Checkout.Session,
): string | null {
  const paymentIntent =
    session.payment_intent;

  if (!paymentIntent) {
    return null;
  }

  if (
    typeof paymentIntent ===
    "string"
  ) {
    return paymentIntent;
  }

  return paymentIntent.id;
}

// ============================================================
// RESERVATION ID
//
// Primero usamos metadata.
//
// Como fallback buscamos por stripe_session_id en Supabase.
// Esto ayuda si por alguna razón metadata no estuviera presente.
// ============================================================

async function getReservationId(
  session:
    Stripe.Checkout.Session,
): Promise<
  string | null
> {
  const metadataReservationId =
    session.metadata
      ?.reservation_id;

  if (
    isUuid(
      metadataReservationId,
    )
  ) {
    return metadataReservationId;
  }

  if (!supabase) {
    return null;
  }

  const {
    data,
    error,
  } =
    await supabase
      .from(
        "shop_inventory_reservations",
      )
      .select(
        "id",
      )
      .eq(
        "stripe_session_id",
        session.id,
      )
      .maybeSingle();

  if (error) {
    console.error(
      "[ATB Shop] Error buscando reserva por Stripe Session:",
      {
        stripeSessionId:
          session.id,

        message:
          error.message,

        details:
          error.details,

        hint:
          error.hint,
      },
    );

    throw error;
  }

  if (
    !data?.id ||
    !isUuid(
      data.id,
    )
  ) {
    return null;
  }

  return data.id;
}

// ============================================================
// PRODUCT FROM STRIPE LINE ITEM
// ============================================================

function getStripeProduct(
  lineItem:
    Stripe.LineItem,
): Stripe.Product {
  const product =
    lineItem.price
      ?.product;

  if (!product) {
    throw new Error(
      "Stripe line item has no product.",
    );
  }

  if (
    typeof product ===
    "string"
  ) {
    throw new Error(
      "Stripe Product was not expanded.",
    );
  }

  if (
    "deleted" in
      product &&
    product.deleted
  ) {
    throw new Error(
      "Stripe Product was deleted.",
    );
  }

  return product as
    Stripe.Product;
}

// ============================================================
// GET ORDER ITEMS FROM STRIPE
// ============================================================

async function getOrderItems(
  session:
    Stripe.Checkout.Session,
): Promise<
  ShopOrderItem[]
> {
  if (!stripe) {
    throw new Error(
      "Stripe is not configured.",
    );
  }

  const lineItems =
    await stripe.checkout
      .sessions
      .listLineItems(
        session.id,
        {
          limit:
            100,

          expand: [
            "data.price.product",
          ],
        },
      );

  if (
    lineItems.data.length ===
    0
  ) {
    throw new Error(
      "Stripe Checkout contains no line items.",
    );
  }

  const items:
    ShopOrderItem[] =
    [];

  for (
    const lineItem
    of lineItems.data
  ) {
    const quantity =
      lineItem.quantity;

    if (
      !quantity ||
      !Number.isInteger(
        quantity,
      ) ||
      quantity <= 0
    ) {
      throw new Error(
        "Stripe line item has invalid quantity.",
      );
    }

    const price =
      lineItem.price;

    if (!price) {
      throw new Error(
        "Stripe line item has no price.",
      );
    }

    const unitAmount =
      price.unit_amount;

    if (
      unitAmount ===
        null ||
      !Number.isInteger(
        unitAmount,
      ) ||
      unitAmount < 0
    ) {
      throw new Error(
        "Stripe line item has invalid unit amount.",
      );
    }

    const stripeProduct =
      getStripeProduct(
        lineItem,
      );

    const sku =
      stripeProduct
        .metadata
        ?.sku
        ?.trim()
        .toUpperCase();

    if (
      !sku ||
      !/^[A-Z0-9-]+$/.test(
        sku,
      )
    ) {
      throw new Error(
        "Stripe product is missing a valid ATB SKU.",
      );
    }

    const lineTotal =
      lineItem.amount_total;

    if (
      !Number.isInteger(
        lineTotal,
      ) ||
      lineTotal < 0
    ) {
      throw new Error(
        `Stripe line item ${sku} has invalid total.`,
      );
    }

    const currency =
      (
        lineItem.currency ??
        price.currency ??
        session.currency ??
        ""
      )
        .trim()
        .toLowerCase();

    if (!currency) {
      throw new Error(
        `Stripe line item ${sku} has no currency.`,
      );
    }

    const productName =
      (
        stripeProduct.name ||
        lineItem.description ||
        sku
      ).trim();

    const variantDescription =
      stripeProduct
        .description
        ?.trim() ||
      null;

    items.push({
      sku,

      product_name:
        productName,

      variant_description:
        variantDescription,

      quantity,

      unit_amount:
        unitAmount,

      line_total:
        lineTotal,

      currency,
    });
  }

  // ==========================================================
  // VERIFY STRIPE SUBTOTAL
  //
  // Se compara contra amount_subtotal, no amount_total.
  //
  // Así en el futuro amount_total podrá incluir:
  // - envío
  // - impuestos
  //
  // sin romper esta validación.
  // ==========================================================

  const calculatedSubtotal =
    items.reduce(
      (
        total,
        item,
      ) =>
        total +
        item.line_total,

      0,
    );

  if (
    session.amount_subtotal !==
      null &&
    calculatedSubtotal !==
      session.amount_subtotal
  ) {
    throw new Error(
      `Stripe subtotal mismatch. Expected ${session.amount_subtotal}, received ${calculatedSubtotal}.`,
    );
  }

  return items;
}

// ============================================================
// PROCESS PAID CHECKOUT
// ============================================================

async function processPaidCheckout(
  session:
    Stripe.Checkout.Session,
): Promise<void> {
  if (!supabase) {
    throw new Error(
      "Supabase is not configured.",
    );
  }

  // ==========================================================
  // SOURCE
  // ==========================================================

  if (
    session.metadata
      ?.source !==
    "atb-shop"
  ) {
    console.log(
      "[ATB Shop] Sesión ignorada porque no pertenece a ATB Shop:",
      session.id,
    );

    return;
  }

  // ==========================================================
  // MODE
  // ==========================================================

  if (
    session.mode !==
    "payment"
  ) {
    console.log(
      "[ATB Shop] Sesión ignorada porque no es mode=payment:",
      session.id,
    );

    return;
  }

  // ==========================================================
  // PAYMENT STATUS
  // ==========================================================

  if (
    session.payment_status !==
      "paid" &&
    session.payment_status !==
      "no_payment_required"
  ) {
    /*
      Para métodos asíncronos checkout.session.completed
      puede llegar antes del pago.

      En ese caso esperamos:
      checkout.session.async_payment_succeeded
    */

    console.log(
      "[ATB Shop] Checkout completado pero pago todavía pendiente:",
      {
        stripeSessionId:
          session.id,

        paymentStatus:
          session.payment_status,
      },
    );

    return;
  }

  // ==========================================================
  // RESERVATION
  // ==========================================================

  const reservationId =
    await getReservationId(
      session,
    );

  if (!reservationId) {
    throw new Error(
      `Paid Stripe session ${session.id} has no inventory reservation.`,
    );
  }

  // ==========================================================
  // AMOUNT
  // ==========================================================

  const amountTotal =
    session.amount_total;

  if (
    amountTotal ===
      null ||
    !Number.isInteger(
      amountTotal,
    ) ||
    amountTotal < 0
  ) {
    throw new Error(
      `Stripe session ${session.id} has invalid amount_total.`,
    );
  }

  // ==========================================================
  // CURRENCY
  // ==========================================================

  const currency =
    session.currency
      ?.trim()
      .toLowerCase();

  if (!currency) {
    throw new Error(
      `Stripe session ${session.id} has no currency.`,
    );
  }

  // ==========================================================
  // ORDER ITEMS
  // ==========================================================

  const items =
    await getOrderItems(
      session,
    );

  // ==========================================================
  // CUSTOMER
  // ==========================================================

  const customerEmail =
    session
      .customer_details
      ?.email ??
    session.customer_email ??
    null;

  const customerName =
    session
      .customer_details
      ?.name ??
    null;

  const customerPhone =
    session
      .customer_details
      ?.phone ??
    null;

  const paymentIntentId =
    getPaymentIntentId(
      session,
    );

  // ==========================================================
  // ATOMIC CONFIRMATION
  //
  // En una sola transacción SQL:
  //
  // - verifica reserva
  // - crea pedido
  // - crea order_items
  // - stock -= quantity
  // - reserved_stock -= quantity
  // - reservation -> confirmed
  // ==========================================================

  const {
    data,
    error,
  } =
    await supabase.rpc(
      "process_paid_shop_order_with_reservation",
      {
        p_reservation_id:
          reservationId,

        p_stripe_session_id:
          session.id,

        p_stripe_payment_intent_id:
          paymentIntentId,

        p_customer_email:
          customerEmail,

        p_customer_name:
          customerName,

        p_customer_phone:
          customerPhone,

        p_currency:
          currency,

        p_amount_total:
          amountTotal,

        p_items:
          items,
      },
    );

  if (error) {
    console.error(
      "[ATB Shop] Error procesando pedido pagado:",
      {
        reservationId,

        stripeSessionId:
          session.id,

        paymentIntentId,

        message:
          error.message,

        details:
          error.details,

        hint:
          error.hint,
      },
    );

    /*
      Lanzamos error deliberadamente.

      El webhook responderá 500 y Stripe volverá
      a intentar entregar el evento.
    */

    throw error;
  }

  const result =
    data as
      | ProcessOrderResponse
      | null;

  if (
    !result ||
    result.success !==
      true
  ) {
    throw new Error(
      `Invalid database response while processing Stripe session ${session.id}.`,
    );
  }

  // ==========================================================
  // DUPLICATE
  // ==========================================================

  if (
    result.duplicate
  ) {
    console.log(
      "[ATB Shop] Webhook duplicado ignorado:",
      {
        orderId:
          result.order_id,

        reservationId,

        stripeSessionId:
          session.id,
      },
    );

    return;
  }

  // ==========================================================
  // SUCCESS
  // ==========================================================

  console.log(
    "[ATB SHOP] PEDIDO REGISTRADO",
  );

  console.log({
    orderId:
      result.order_id,

    reservationId,

    stripeSessionId:
      session.id,

    paymentIntentId,

    email:
      customerEmail,

    amount:
      amountTotal,

    currency,

    items:
      items.map(
        (
          item,
        ) => ({
          sku:
            item.sku,

          quantity:
            item.quantity,

          total:
            item.line_total,
        }),
      ),
  });
}

// ============================================================
// RELEASE RESERVATION
// ============================================================

async function releaseReservation(
  session:
    Stripe.Checkout.Session,

  status:
    | "expired"
    | "failed",
): Promise<void> {
  if (!supabase) {
    throw new Error(
      "Supabase is not configured.",
    );
  }

  if (
    session.metadata
      ?.source !==
    "atb-shop"
  ) {
    return;
  }

  const reservationId =
    await getReservationId(
      session,
    );

  /*
    Una sesión antigua creada antes del sistema
    de reservas puede no tener reservation_id.

    Si está expirando/fallando no hay nada nuevo
    que liberar.
  */

  if (!reservationId) {
    console.warn(
      "[ATB Shop] Sesión sin reserva al intentar liberar inventario:",
      {
        stripeSessionId:
          session.id,

        status,
      },
    );

    return;
  }

  const {
    data,
    error,
  } =
    await supabase.rpc(
      "release_shop_inventory_reservation",
      {
        p_reservation_id:
          reservationId,

        p_status:
          status,
      },
    );

  if (error) {
    console.error(
      "[ATB Shop] Error liberando reserva:",
      {
        reservationId,

        stripeSessionId:
          session.id,

        status,

        message:
          error.message,

        details:
          error.details,

        hint:
          error.hint,
      },
    );

    /*
      Respondemos 500 posteriormente para que Stripe
      vuelva a enviar el evento.
    */

    throw error;
  }

  const result =
    data as
      | ReleaseReservationResponse
      | null;

  if (
    !result ||
    result.success !==
      true
  ) {
    throw new Error(
      `Invalid release response for reservation ${reservationId}.`,
    );
  }

  if (
    result.duplicate
  ) {
    console.log(
      "[ATB Shop] Reserva ya estaba resuelta:",
      {
        reservationId,

        stripeSessionId:
          session.id,

        currentStatus:
          result.status,
      },
    );

    return;
  }

  console.log(
    "[ATB Shop] Reserva liberada:",
    {
      reservationId,

      stripeSessionId:
        session.id,

      status,
    },
  );
}

// ============================================================
// POST
// ============================================================

export const POST:
  APIRoute =
  async ({
    request,
  }) => {
    // ========================================================
    // CONFIG
    // ========================================================

    if (!stripe) {
      console.error(
        "[ATB Shop] Webhook: falta STRIPE_SECRET_KEY.",
      );

      return jsonResponse(
        {
          error:
            "Stripe not configured.",
        },

        500,
      );
    }

    if (
      !stripeWebhookSecret
    ) {
      console.error(
        "[ATB Shop] Webhook: falta STRIPE_WEBHOOK_SECRET.",
      );

      return jsonResponse(
        {
          error:
            "Stripe webhook not configured.",
        },

        500,
      );
    }

    if (!supabase) {
      console.error(
        "[ATB Shop] Webhook: Supabase no está configurado.",
      );

      return jsonResponse(
        {
          error:
            "Supabase not configured.",
        },

        500,
      );
    }

    // ========================================================
    // SIGNATURE
    // ========================================================

    const signature =
      request.headers.get(
        "stripe-signature",
      );

    if (!signature) {
      console.warn(
        "[ATB Shop] Webhook sin stripe-signature.",
      );

      return jsonResponse(
        {
          error:
            "Missing Stripe signature.",
        },

        400,
      );
    }

    // ========================================================
    // RAW BODY
    //
    // IMPORTANTE:
    //
    // Stripe requiere el cuerpo EXACTO.
    // No usar request.json() antes de constructEvent().
    // ========================================================

    const rawBody =
      await request.text();

    let event:
      Stripe.Event;

    try {
      event =
        stripe.webhooks
          .constructEvent(
            rawBody,

            signature,

            stripeWebhookSecret,
          );
    } catch (
      error
    ) {
      console.error(
        "[ATB Shop] Firma Stripe inválida:",
        error instanceof
          Error
          ? error.message
          : error,
      );

      return jsonResponse(
        {
          error:
            "Invalid Stripe signature.",
        },

        400,
      );
    }

    // ========================================================
    // EVENT
    // ========================================================

    try {
      switch (
        event.type
      ) {
        // ====================================================
        // CHECKOUT COMPLETED
        //
        // Tarjetas normales suelen llegar aquí ya pagadas.
        // ====================================================

        case "checkout.session.completed": {
          const session =
            event.data
              .object as
              Stripe.Checkout.Session;

          await processPaidCheckout(
            session,
          );

          break;
        }

        // ====================================================
        // ASYNC PAYMENT SUCCESS
        // ====================================================

        case "checkout.session.async_payment_succeeded": {
          const session =
            event.data
              .object as
              Stripe.Checkout.Session;

          await processPaidCheckout(
            session,
          );

          break;
        }

        // ====================================================
        // ASYNC PAYMENT FAILED
        // ====================================================

        case "checkout.session.async_payment_failed": {
          const session =
            event.data
              .object as
              Stripe.Checkout.Session;

          await releaseReservation(
            session,
            "failed",
          );

          break;
        }

        // ====================================================
        // CHECKOUT EXPIRED
        //
        // El usuario no terminó de pagar.
        // Devolvemos reserved_stock.
        // ====================================================

        case "checkout.session.expired": {
          const session =
            event.data
              .object as
              Stripe.Checkout.Session;

          await releaseReservation(
            session,
            "expired",
          );

          break;
        }

        // ====================================================
        // UNHANDLED
        // ====================================================

        default: {
          /*
            Stripe envía muchos tipos de eventos.

            No es un error recibir uno que ATB Shop
            no necesita.
          */

          break;
        }
      }

      // ======================================================
      // ACKNOWLEDGE
      // ======================================================

      return jsonResponse(
        {
          received:
            true,

          event:
            event.type,
        },

        200,
      );
    } catch (
      error
    ) {
      console.error(
        "[ATB Shop] Webhook processing error:",
        {
          eventId:
            event.id,

          eventType:
            event.type,

          error:
            error instanceof
            Error
              ? error.message
              : error,
        },
      );

      /*
        500 es deliberado.

        Stripe volverá a intentar enviar el evento,
        mientras nuestras funciones SQL son idempotentes.
      */

      return jsonResponse(
        {
          error:
            "Webhook processing failed.",
        },

        500,
      );
    }
  };

// ============================================================
// GET
// ============================================================

export const GET:
  APIRoute =
  async () => {
    return jsonResponse(
      {
        error:
          "Method not allowed.",
      },

      405,
    );
  };