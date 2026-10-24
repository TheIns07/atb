import type {
  APIRoute,
} from "astro";

import Stripe from "stripe";

import {
  createClient,
} from "@supabase/supabase-js";

import type {
  OrderNotificationAddress,
} from "../../../lib/server/shop/email";

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

type PaidOrderItem = {
  sku:
    string;

  product_name:
    string;

  variant_description:
    | string
    | null;

  quantity:
    number;

  unit_amount:
    number;

  line_total:
    number;

  currency:
    string;
};

type ShippingAddressLike = {
  line1?:
    | string
    | null;

  line2?:
    | string
    | null;

  city?:
    | string
    | null;

  state?:
    | string
    | null;

  postal_code?:
    | string
    | null;

  country?:
    | string
    | null;
};

type ShippingDetailsLike = {
  name?:
    | string
    | null;

  address?:
    | ShippingAddressLike
    | null;
};

type SessionShippingCompatibility = {
  shipping_details?:
    | ShippingDetailsLike
    | null;

  collected_information?: {
    shipping_details?:
      | ShippingDetailsLike
      | null;
  } | null;
};

type ProcessOrderResponse = {
  success?:
    boolean;

  duplicate?:
    boolean;

  order_id?:
    string;

  status?:
    string;
};

type NotificationStateRow = {
  confirmation_email_sent_at?:
    string | null;

  confirmation_email_id?:
    string | null;
};

// ============================================================
// RESPONSE
// ============================================================

function okResponse(
  message =
    "ok",
): Response {
  return new Response(
    message,
    {
      status:
        200,
    },
  );
}

// ============================================================
// HELPERS
// ============================================================

function getString(
  value:
    unknown,
): string | null {
  if (
    typeof value !==
    "string"
  ) {
    return null;
  }

  const normalized =
    value.trim();

  return normalized
    ? normalized
    : null;
}

function getInteger(
  value:
    unknown,
): number | null {
  if (
    typeof value !==
      "number" ||
    !Number.isSafeInteger(
      value,
    )
  ) {
    return null;
  }

  return value;
}

function parseMetadataInteger(
  value:
    | string
    | undefined,
): number | null {
  if (!value) {
    return null;
  }

  const parsed =
    Number(
      value,
    );

  if (
    !Number.isSafeInteger(
      parsed,
    ) ||
    parsed < 0
  ) {
    return null;
  }

  return parsed;
}

// ============================================================
// ORDER REFERENCE
// ============================================================

function getOrderReference(
  orderId:
    string,
): string {
  return orderId
    .replace(
      /-/g,
      "",
    )
    .slice(
      0,
      8,
    )
    .toUpperCase();
}

// ============================================================
// PAYMENT INTENT
// ============================================================

function getPaymentIntentId(
  session:
    Stripe.Checkout.Session,
): string | null {
  const paymentIntent =
    session.payment_intent;

  if (
    typeof paymentIntent ===
    "string"
  ) {
    return paymentIntent;
  }

  if (
    paymentIntent &&
    typeof paymentIntent ===
      "object" &&
    "id" in paymentIntent
  ) {
    return getString(
      paymentIntent.id,
    );
  }

  return null;
}

// ============================================================
// SHIPPING DETAILS
// ============================================================

function getShippingDetails(
  session:
    Stripe.Checkout.Session,
): ShippingDetailsLike | null {
  const compatible =
    session as unknown as
      SessionShippingCompatibility;

  return (
    compatible
      .shipping_details ??
    compatible
      .collected_information
      ?.shipping_details ??
    null
  );
}

// ============================================================
// SHIPPING ADDRESS FOR INTERNAL EMAIL
// ============================================================

function getNotificationShippingAddress(
  session:
    Stripe.Checkout.Session,
): OrderNotificationAddress | null {
  const shipping =
    getShippingDetails(
      session,
    );

  const address =
    shipping?.address;

  if (!address) {
    return null;
  }

  return {
    name:
      getString(
        shipping?.name,
      ),

    line1:
      getString(
        address.line1,
      ),

    line2:
      getString(
        address.line2,
      ),

    city:
      getString(
        address.city,
      ),

    state:
      getString(
        address.state,
      ),

    postalCode:
      getString(
        address.postal_code,
      ),

    country:
      getString(
        address.country,
      )?.toUpperCase() ??
      null,
  };
}

// ============================================================
// RESERVATION ID
// ============================================================

async function getReservationId(
  session:
    Stripe.Checkout.Session,
): Promise<string | null> {
  const metadataReservationId =
    getString(
      session.metadata
        ?.reservation_id,
    );

  if (
    metadataReservationId
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

  if (
    error
  ) {
    console.error(
      "[ATB Shop] No se pudo localizar la reserva:",
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

    return null;
  }

  return getString(
    data?.id,
  );
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
      "Supabase no está configurado.",
    );
  }

  const reservationId =
    await getReservationId(
      session,
    );

  if (
    !reservationId
  ) {
    console.warn(
      "[ATB Shop] No existe reservation_id para liberar:",
      {
        stripeSessionId:
          session.id,

        status,
      },
    );

    return;
  }

  const {
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

  if (
    error
  ) {
    console.error(
      "[ATB Shop] Error liberando reserva:",
      {
        reservationId,

        status,

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
// PAID ITEMS
// ============================================================

async function getPaidItems(
  session:
    Stripe.Checkout.Session,
): Promise<PaidOrderItem[]> {
  if (!stripe) {
    throw new Error(
      "Stripe no está configurado.",
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

  const items:
    PaidOrderItem[] =
    [];

  for (
    const lineItem
    of lineItems.data
  ) {
    const quantity =
      getInteger(
        lineItem.quantity,
      );

    const price =
      lineItem.price;

    const unitAmount =
      getInteger(
        price?.unit_amount,
      );

    const lineTotal =
      getInteger(
        lineItem.amount_total,
      );

    if (
      quantity ===
        null ||
      quantity <= 0 ||
      unitAmount ===
        null ||
      unitAmount < 0 ||
      lineTotal ===
        null ||
      lineTotal < 0
    ) {
      throw new Error(
        `Stripe devolvió cantidades inválidas para ${session.id}.`,
      );
    }

    const productReference =
      price?.product;

    if (
      !productReference ||
      typeof productReference ===
        "string"
    ) {
      throw new Error(
        `Stripe no devolvió el Product expandido para ${session.id}.`,
      );
    }

    if (
      "deleted" in
        productReference &&
      productReference.deleted
    ) {
      throw new Error(
        "Uno de los productos de Stripe fue eliminado.",
      );
    }

    const product =
      productReference as
        Stripe.Product;

    const sku =
      getString(
        product.metadata
          ?.sku,
      );

    if (
      !sku
    ) {
      throw new Error(
        `Un producto de ${session.id} no contiene SKU.`,
      );
    }

    const productName =
      getString(
        product.name,
      );

    if (
      !productName
    ) {
      throw new Error(
        `El SKU ${sku} no contiene nombre.`,
      );
    }

    const currency =
      (
        getString(
          lineItem.currency,
        ) ??
        getString(
          price?.currency,
        )
      )?.toLowerCase();

    if (
      !currency
    ) {
      throw new Error(
        `El SKU ${sku} no contiene moneda.`,
      );
    }

    items.push({
      sku,

      product_name:
        productName,

      variant_description:
        getString(
          product.description,
        ),

      quantity,

      unit_amount:
        unitAmount,

      line_total:
        lineTotal,

      currency,
    });
  }

  if (
    items.length ===
    0
  ) {
    throw new Error(
      `Checkout ${session.id} no contiene artículos.`,
    );
  }

  return items;
}

// ============================================================
// SHIPPING AMOUNT
// ============================================================

function getShippingAmount(
  session:
    Stripe.Checkout.Session,
): number | null {
  const stripeShipping =
    getInteger(
      session
        .shipping_cost
        ?.amount_total,
    );

  if (
    stripeShipping !==
    null
  ) {
    return stripeShipping;
  }

  /*
   * Compatibilidad con el checkout actual.
   */
  const currentMetadata =
    parseMetadataInteger(
      session.metadata
        ?.shipping_amount_cents,
    );

  if (
    currentMetadata !==
    null
  ) {
    return currentMetadata;
  }

  /*
   * Compatibilidad con sesiones antiguas.
   */
  return parseMetadataInteger(
    session.metadata
      ?.expected_shipping,
  );
}

function getExpectedShippingCountry(
  session:
    Stripe.Checkout.Session,
): string | null {
  return getString(
    session.metadata
      ?.shipping_country,
  )?.toUpperCase() ??
    null;
}

// ============================================================
// SHIPPING METHOD
// ============================================================

function getShippingMethod(
  session:
    Stripe.Checkout.Session,
): string | null {
  const method =
    getString(
      session.metadata
        ?.shipping_method,
    );

  if (
    method ===
      "standard" ||
    method ===
      "free"
  ) {
    return method;
  }

  return null;
}

// ============================================================
// SHIPPING METHOD NAME
// ============================================================

function getShippingMethodName(
  session:
    Stripe.Checkout.Session,

  amountShipping:
    number,
): string {
  const method =
    getShippingMethod(
      session,
    );

  const country =
    getExpectedShippingCountry(
      session,
    );

  if (
    method ===
      "free" ||
    amountShipping ===
      0
  ) {
    return country ===
      "MX"
      ? "Envío nacional gratuito"
      : "Envío internacional gratuito";
  }

  return country ===
    "MX"
    ? "Envío nacional"
    : "Envío internacional";
}

// ============================================================
// UPDATE ORDER SHIPPING
// ============================================================

async function updateOrderShippingData(
  session:
    Stripe.Checkout.Session,

  amountSubtotal:
    number,

  amountShipping:
    number,
): Promise<string> {
  if (
    !supabase
  ) {
    throw new Error(
      "Supabase no está configurado.",
    );
  }

  const shipping =
    getShippingDetails(
      session,
    );

  const address =
    shipping?.address ??
    null;

  const customerDetails =
    session.customer_details;

  const shippingName =
    getString(
      shipping?.name,
    ) ??
    getString(
      customerDetails
        ?.name,
    );

  const shippingPhone =
    getString(
      customerDetails
        ?.phone,
    );

  const line1 =
    getString(
      address?.line1,
    );

  const line2 =
    getString(
      address?.line2,
    );

  const city =
    getString(
      address?.city,
    );

  const state =
    getString(
      address?.state,
    );

  const postalCode =
    getString(
      address?.postal_code,
    );

  const country =
    getString(
      address?.country,
    )?.toUpperCase() ??
    null;

  // ========================================================
  // COUNTRY
  // ========================================================

// ========================================================
// COUNTRY
// ========================================================

const expectedCountry =
  getExpectedShippingCountry(
    session,
  );

const supportedCountries = [
  "MX",
  "US",
  "CA",
  "ES",
];

if (
  !country
) {
  throw new Error(
    `Checkout ${session.id} no contiene país de envío.`,
  );
}

if (
  !supportedCountries.includes(
    country,
  )
) {
  throw new Error(
    `País de envío no soportado: ${country}.`,
  );
}

/*
 * La dirección escrita en Stripe tiene que coincidir
 * con el país para el que calculamos el envío.
 */

if (
  expectedCountry &&
  country !==
    expectedCountry
) {
  throw new Error(
    `El país de envío no coincide. Esperado ${expectedCountry}, Stripe ${country}.`,
  );
}

  // ========================================================
  // ADDRESS
  // ========================================================

  if (
    !line1 ||
    !country
  ) {
    throw new Error(
      `Checkout ${session.id} no contiene una dirección de envío válida.`,
    );
  }

  // ========================================================
  // FIND ORDER
  // ========================================================

  const {
    data:
      orderData,

    error:
      orderError,
  } =
    await supabase
      .from(
        "shop_orders",
      )
      .select(
        "id",
      )
      .eq(
        "stripe_session_id",
        session.id,
      )
      .maybeSingle();

  if (
    orderError
  ) {
    console.error(
      "[ATB Shop] Error consultando pedido:",
      {
        stripeSessionId:
          session.id,

        message:
          orderError.message,

        details:
          orderError.details,

        hint:
          orderError.hint,
      },
    );

    throw orderError;
  }

  const orderId =
    getString(
      orderData?.id,
    );

  if (
    !orderId
  ) {
    throw new Error(
      `No encontramos shop_orders para ${session.id}.`,
    );
  }

  // ========================================================
  // UPDATE
  // ========================================================

  const {
    error:
      updateError,
  } =
    await supabase
      .from(
        "shop_orders",
      )
      .update({
        amount_subtotal:
          amountSubtotal,

        amount_shipping:
          amountShipping,

        shipping_method:
          getShippingMethod(
            session,
          ),

        shipping_name:
          shippingName,

        shipping_phone:
          shippingPhone,

        shipping_address_line1:
          line1,

        shipping_address_line2:
          line2,

        shipping_city:
          city,

        shipping_state:
          state,

        shipping_postal_code:
          postalCode,

        shipping_country:
          country,
      })
      .eq(
        "id",
        orderId,
      );

  if (
    updateError
  ) {
    console.error(
      "[ATB Shop] No se pudieron guardar datos de envío:",
      {
        orderId,

        stripeSessionId:
          session.id,

        message:
          updateError.message,

        details:
          updateError.details,

        hint:
          updateError.hint,
      },
    );

    throw updateError;
  }

  return orderId;
}

// ============================================================
// SAVE EMAIL ERROR
// ============================================================

async function saveNotificationError(
  orderId:
    string,

  message:
    string,
): Promise<void> {
  if (
    !supabase
  ) {
    return;
  }

  try {
    const {
      error,
    } =
      await supabase
        .from(
          "shop_orders",
        )
        .update({
          email_last_error:
            message.slice(
              0,
              2000,
            ),
        })
        .eq(
          "id",
          orderId,
        );

    if (
      error
    ) {
      console.error(
        "[ATB Shop] No se pudo guardar email_last_error:",
        {
          orderId,

          message:
            error.message,
        },
      );
    }
  } catch (
    error
  ) {
    console.error(
      "[ATB Shop] Error guardando fallo de notificación:",
      {
        orderId,

        error,
      },
    );
  }
}

// ============================================================
// OWNER NOTIFICATION
//
// IMPORTANTE:
//
// La notificación al propietario NO es parte crítica del pago.
//
// Si Resend falla:
// - el pago sigue válido
// - el pedido sigue válido
// - el inventario sigue descontado
// - Stripe recibe 200
//
// Sólo registramos el error.
// ============================================================

async function sendOwnerNotificationSafely(
  orderId:
    string,

  session:
    Stripe.Checkout.Session,

  items:
    PaidOrderItem[],

  amountSubtotal:
    number,

  amountShipping:
    number,

  amountTotal:
    number,

  currency:
    string,

  paymentIntentId:
    string | null,
): Promise<void> {
  if (
    !supabase
  ) {
    return;
  }

  try {
    // ========================================================
    // PREVENT DUPLICATE NOTIFICATIONS
    //
    // Reutilizamos confirmation_email_* de la migración que
    // ya existe.
    //
    // Ahora representan la notificación interna de nueva compra.
    // ========================================================

    const {
      data:
        emailStateData,

      error:
        emailStateError,
    } =
      await supabase
        .from(
          "shop_orders",
        )
        .select(
          `
            confirmation_email_sent_at,
            confirmation_email_id
          `,
        )
        .eq(
          "id",
          orderId,
        )
        .maybeSingle();

    if (
      emailStateError
    ) {
      /*
        No bloqueamos la notificación.

        Resend tiene además Idempotency-Key.
      */

      console.error(
        "[ATB Shop] No se pudo consultar estado de notificación:",
        {
          orderId,

          message:
            emailStateError.message,
        },
      );
    }

    const notificationState =
      emailStateData as
        | NotificationStateRow
        | null;

    if (
      notificationState
        ?.confirmation_email_sent_at
    ) {
      console.log(
        "[ATB Shop] Notificación de compra ya enviada:",
        {
          orderId,

          emailId:
            notificationState
              .confirmation_email_id,
        },
      );

      return;
    }

    // ========================================================
    // CUSTOMER
    // ========================================================

    const customerEmail =
      getString(
        session
          .customer_details
          ?.email,
      ) ??
      getString(
        session.customer_email,
      );

    const customerName =
      getString(
        session
          .customer_details
          ?.name,
      );

    const customerPhone =
      getString(
        session
          .customer_details
          ?.phone,
      );

    // ========================================================
    // SEND
    // ========================================================

    /*
     * Cargamos el módulo de correo de forma diferida.
     *
     * Así, cualquier problema de inicialización/configuración
     * relacionado con Resend o email.ts NO impide que el
     * endpoint de Stripe pueda cargar y procesar el pago.
     */
    const {
      sendNewOrderNotificationEmail,
    } = await import(
      "../../../lib/server/shop/email"
    );

    const result =
      await sendNewOrderNotificationEmail({
        orderId,

        reference:
          getOrderReference(
            orderId,
          ),

        stripeSessionId:
          session.id,

        paymentIntentId,

        customerName,

        customerEmail,

        customerPhone,

        currency:
          currency.toUpperCase(),

        amountSubtotal,

        amountShipping,

        amountTotal,

        shippingMethodName:
          getShippingMethodName(
            session,
            amountShipping,
          ),

        shippingAddress:
          getNotificationShippingAddress(
            session,
          ),

        items:
          items.map(
            (
              item,
            ) => ({
              sku:
                item.sku,

              name:
                item.product_name,

              variant:
                item.variant_description,

              quantity:
                item.quantity,

              unitAmount:
                item.unit_amount,

              lineTotal:
                item.line_total,
            }),
          ),
      });

    // ========================================================
    // EMAIL DISABLED
    // ========================================================

    if (
      result.success &&
      result.skipped
    ) {
      console.log(
        "[ATB Shop] Notificación interna deshabilitada:",
        {
          orderId,
        },
      );

      return;
    }

    // ========================================================
    // FAILED
    // ========================================================

    if (
      !result.success
    ) {
      const message =
        result.error ??
        "No fue posible enviar la notificación de compra.";

      console.error(
        "[ATB Shop] Falló notificación interna:",
        {
          orderId,

          message,
        },
      );

      await saveNotificationError(
        orderId,
        message,
      );

      return;
    }

    // ========================================================
    // NO EMAIL ID
    // ========================================================

    if (
      !result.emailId
    ) {
      await saveNotificationError(
        orderId,
        "Resend reportó éxito pero no devolvió emailId.",
      );

      return;
    }

    // ========================================================
    // SAVE SENT STATE
    //
    // Las columnas conservan el nombre anterior.
    // No necesitamos otra migración sólo para renombrarlas.
    // ========================================================

    const {
      error:
        updateError,
    } =
      await supabase
        .from(
          "shop_orders",
        )
        .update({
          confirmation_email_sent_at:
            new Date()
              .toISOString(),

          confirmation_email_id:
            result.emailId,

          email_last_error:
            null,
        })
        .eq(
          "id",
          orderId,
        );

    if (
      updateError
    ) {
      /*
        El email YA salió.

        No fallamos el webhook.

        Resend además utiliza:
        atb-new-order/{orderId}

        como Idempotency-Key.
      */

      console.error(
        "[ATB Shop] Notificación enviada pero no se pudo guardar su estado:",
        {
          orderId,

          emailId:
            result.emailId,

          message:
            updateError.message,
        },
      );

      return;
    }

    console.log(
      "[ATB Shop] Notificación de nueva compra enviada:",
      {
        orderId,

        emailId:
          result.emailId,
      },
    );
  } catch (
    error
  ) {
    // ========================================================
    // FINAL SAFETY BARRIER
    // ========================================================

    console.error(
      "[ATB Shop] Error inesperado enviando notificación:",
      {
        orderId,

        error,
      },
    );

    await saveNotificationError(
      orderId,

      error instanceof
        Error
        ? error.message
        : "Error inesperado enviando notificación.",
    );
  }
}

// ============================================================
// PROCESS PAID CHECKOUT
// ============================================================

async function processPaidCheckout(
  eventSession:
    Stripe.Checkout.Session,
): Promise<void> {
  if (
    !stripe ||
    !supabase
  ) {
    throw new Error(
      "Stripe o Supabase no están configurados.",
    );
  }

  // ========================================================
  // ONLY ATB
  // ========================================================

  if (
    eventSession.metadata
      ?.source !==
    "atb-shop"
  ) {
    console.log(
      "[ATB Shop] Ignorando Checkout externo:",
      eventSession.id,
    );

    return;
  }

  if (
    eventSession.mode !==
    "payment"
  ) {
    console.log(
      "[ATB Shop] Checkout ignorado por mode:",
      eventSession.id,
    );

    return;
  }

  // ========================================================
  // CURRENT STRIPE SESSION
  // ========================================================

  const session =
    await stripe.checkout
      .sessions.retrieve(
        eventSession.id,
      );

  // ========================================================
  // PAYMENT STATUS
  // ========================================================

  const paid =
    session.payment_status ===
      "paid" ||
    session.payment_status ===
      "no_payment_required";

  /*
    Para métodos de pago asíncronos:

    checkout.session.completed puede llegar antes del pago.

    En ese caso esperamos:
    checkout.session.async_payment_succeeded
  */

  if (
    !paid
  ) {
    console.log(
      "[ATB Shop] Pago todavía pendiente:",
      {
        stripeSessionId:
          session.id,

        paymentStatus:
          session.payment_status,
      },
    );

    return;
  }

  // ========================================================
  // RESERVATION
  // ========================================================

  const reservationId =
    await getReservationId(
      session,
    );

  if (
    !reservationId
  ) {
    throw new Error(
      `No se encontró reservation_id para ${session.id}.`,
    );
  }

  // ========================================================
  // AMOUNTS
  // ========================================================

  const amountSubtotal =
    getInteger(
      session.amount_subtotal,
    );

  const amountShipping =
    getShippingAmount(
      session,
    );

  const amountTotal =
    getInteger(
      session.amount_total,
    );

  if (
    amountSubtotal ===
      null ||
    amountSubtotal < 0
  ) {
    throw new Error(
      `Subtotal inválido en ${session.id}.`,
    );
  }

  if (
    amountShipping ===
      null ||
    amountShipping < 0
  ) {
    throw new Error(
      `Costo de envío inválido en ${session.id}.`,
    );
  }

  if (
    amountTotal ===
      null ||
    amountTotal < 0
  ) {
    throw new Error(
      `Total inválido en ${session.id}.`,
    );
  }

  // ========================================================
  // EXPECTED VALUES FROM OUR CHECKOUT
  // ========================================================

  const expectedSubtotal =
  parseMetadataInteger(
    session.metadata
      ?.subtotal_cents,
  ) ??
  parseMetadataInteger(
    session.metadata
      ?.expected_subtotal,
  );

const expectedShipping =
  parseMetadataInteger(
    session.metadata
      ?.shipping_amount_cents,
  ) ??
  parseMetadataInteger(
    session.metadata
      ?.expected_shipping,
  );

const legacyExpectedTotal =
  parseMetadataInteger(
    session.metadata
      ?.expected_total,
  );

const expectedTotal =
  legacyExpectedTotal ??
  (
    expectedSubtotal !==
      null &&
    expectedShipping !==
      null
      ? expectedSubtotal +
        expectedShipping
      : null
  );

  if (
    expectedSubtotal !==
      null &&
    expectedSubtotal !==
      amountSubtotal
  ) {
    throw new Error(
      `Subtotal no coincide. Esperado ${expectedSubtotal}, Stripe ${amountSubtotal}.`,
    );
  }

  if (
    expectedShipping !==
      null &&
    expectedShipping !==
      amountShipping
  ) {
    throw new Error(
      `Envío no coincide. Esperado ${expectedShipping}, Stripe ${amountShipping}.`,
    );
  }

  if (
    expectedTotal !==
      null &&
    expectedTotal !==
      amountTotal
  ) {
    throw new Error(
      `Total no coincide. Esperado ${expectedTotal}, Stripe ${amountTotal}.`,
    );
  }

  if (
    amountSubtotal +
      amountShipping !==
    amountTotal
  ) {
    throw new Error(
      `El total de Stripe no coincide: subtotal ${amountSubtotal} + envío ${amountShipping} != total ${amountTotal}.`,
    );
  }


  // ========================================================
  // CURRENCY
  // ========================================================

  const currency =
    getString(
      session.currency,
    )?.toLowerCase();

  if (
    !currency
  ) {
    throw new Error(
      `Stripe no devolvió currency para ${session.id}.`,
    );
  }

  if (
    currency !==
    "mxn"
  ) {
    throw new Error(
      `Moneda inesperada: ${currency}.`,
    );
  }

  // ========================================================
  // ITEMS
  // ========================================================

  const items =
    await getPaidItems(
      session,
    );

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
    calculatedSubtotal !==
    amountSubtotal
  ) {
    throw new Error(
      `Productos (${calculatedSubtotal}) no coinciden con subtotal (${amountSubtotal}).`,
    );
  }

  for (
    const item
    of items
  ) {
    if (
      item.currency !==
      currency
    ) {
      throw new Error(
        `Moneda inconsistente en SKU ${item.sku}.`,
      );
    }
  }

  // ========================================================
  // CUSTOMER
  // ========================================================

  const customerEmail =
    getString(
      session
        .customer_details
        ?.email,
    ) ??
    getString(
      session.customer_email,
    );

  const customerName =
    getString(
      session
        .customer_details
        ?.name,
    );

  const customerPhone =
    getString(
      session
        .customer_details
        ?.phone,
    );

  // ========================================================
  // PAYMENT INTENT
  // ========================================================

  const paymentIntentId =
    getPaymentIntentId(
      session,
    );

  // ========================================================
  // ATOMIC ORDER + INVENTORY
  //
  // PARTE CRÍTICA:
  //
  // - valida reserva
  // - crea pedido
  // - crea items
  // - descuenta stock
  // - limpia reserved_stock
  // - confirma reserva
  // ========================================================

  const {
    data:
      processData,

    error:
      processError,
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

  if (
    processError
  ) {
    console.error(
      "[ATB Shop] Error registrando pedido:",
      {
        reservationId,

        stripeSessionId:
          session.id,

        message:
          processError.message,

        details:
          processError.details,

        hint:
          processError.hint,
      },
    );

    throw processError;
  }

  const processResult =
    processData as
      | ProcessOrderResponse
      | null;

  // ========================================================
  // SHIPPING DATA
  // ========================================================

  const orderId =
    await updateOrderShippingData(
      session,
      amountSubtotal,
      amountShipping,
    );

  // ========================================================
  // CRITICAL FLOW COMPLETE
  //
  // Desde este punto:
  //
  // pago        ✅
  // pedido      ✅
  // inventario  ✅
  // reserva     ✅
  // dirección   ✅
  //
  // El correo NO puede romper la compra.
  // ========================================================

  await sendOwnerNotificationSafely(
    orderId,
    session,
    items,
    amountSubtotal,
    amountShipping,
    amountTotal,
    currency,
    paymentIntentId,
  );

  // ========================================================
  // LOG
  // ========================================================

  if (
    processResult
      ?.duplicate
  ) {
    console.log(
      "[ATB Shop] Webhook duplicado procesado idempotentemente:",
      {
        orderId,

        reservationId,

        stripeSessionId:
          session.id,
      },
    );

    return;
  }

  console.log(
    "[ATB SHOP] PEDIDO REGISTRADO",
    {
      orderId,

      reference:
        getOrderReference(
          orderId,
        ),

      reservationId,

      stripeSessionId:
        session.id,

      subtotal:
        amountSubtotal,

      shipping:
        amountShipping,

      total:
        amountTotal,

      currency,

      ownerNotification:
        "processed",
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

    if (
      !stripe ||
      !stripeWebhookSecret ||
      !supabase
    ) {
      console.error(
        "[ATB Shop] Webhook no configurado correctamente.",
      );

      return new Response(
        "Webhook configuration error",
        {
          status:
            500,
        },
      );
    }

    // ========================================================
    // SIGNATURE
    // ========================================================

    const signature =
      request.headers.get(
        "stripe-signature",
      );

    if (
      !signature
    ) {
      return new Response(
        "Missing Stripe signature",
        {
          status:
            400,
        },
      );
    }

    // ========================================================
    // RAW BODY
    //
    // No usar request.json().
    // Stripe necesita el cuerpo original para verificar firma.
    // ========================================================

    const payload =
      await request.text();

    let event:
      Stripe.Event;

    try {
      event =
        stripe.webhooks
          .constructEvent(
            payload,
            signature,
            stripeWebhookSecret,
          );
    } catch (
      error
    ) {
      console.error(
        "[ATB Shop] Firma Stripe inválida:",
        error,
      );

      return new Response(
        "Invalid Stripe signature",
        {
          status:
            400,
        },
      );
    }

    // ========================================================
    // PROCESS EVENT
    // ========================================================

    try {
      switch (
        event.type
      ) {
        // ====================================================
        // NORMAL CARD PAYMENT
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

          if (
            session.metadata
              ?.source ===
            "atb-shop"
          ) {
            await releaseReservation(
              session,
              "failed",
            );
          }

          break;
        }

        // ====================================================
        // CHECKOUT EXPIRED
        // ====================================================

        case "checkout.session.expired": {
          const session =
            event.data
              .object as
              Stripe.Checkout.Session;

          if (
            session.metadata
              ?.source ===
            "atb-shop"
          ) {
            await releaseReservation(
              session,
              "expired",
            );
          }

          break;
        }

        // ====================================================
        // IGNORE OTHER EVENTS
        // ====================================================

        default: {
          console.log(
            "[ATB Shop] Evento Stripe ignorado:",
            event.type,
          );

          break;
        }
      }
    } catch (
      error
    ) {
      /*
        Sólo errores del proceso crítico llegan aquí.

        Los errores de Resend se manejan internamente y
        NO provocan un 500 después de una compra válida.
      */

      console.error(
        "[ATB Shop] Webhook processing error:",
        {
          eventId:
            event.id,

          eventType:
            event.type,

          error,
        },
      );

      return new Response(
        "Webhook processing error",
        {
          status:
            500,
        },
      );
    }

    // ========================================================
    // SUCCESS
    // ========================================================

    return okResponse();
  };

// ============================================================
// GET
// ============================================================

export const GET:
  APIRoute =
  async () => {
    return new Response(
      "Method not allowed",
      {
        status:
          405,
      },
    );
  };

// ============================================================
// PUT
// ============================================================

export const PUT:
  APIRoute =
  async () => {
    return new Response(
      "Method not allowed",
      {
        status:
          405,
      },
    );
  };

// ============================================================
// DELETE
// ============================================================

export const DELETE:
  APIRoute =
  async () => {
    return new Response(
      "Method not allowed",
      {
        status:
          405,
      },
    );
  };