import type {
  APIRoute,
} from "astro";

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

const supabaseUrl =
  import.meta.env
    .SUPABASE_URL;

const supabaseServiceRoleKey =
  import.meta.env
    .SUPABASE_SERVICE_ROLE_KEY;

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

type DatabaseOrderRow = {
  id?: unknown;

  stripe_session_id?: unknown;

  customer_email?: unknown;

  currency?: unknown;

  amount_subtotal?: unknown;

  amount_shipping?: unknown;

  amount_total?: unknown;

  status?: unknown;

  shipping_method?: unknown;

  shipping_status?: unknown;

  created_at?: unknown;
};

type DatabaseItemRow = {
  sku?: unknown;

  product_name?: unknown;

  variant_description?: unknown;

  quantity?: unknown;

  unit_amount?: unknown;

  line_total?: unknown;

  currency?: unknown;
};

// ============================================================
// JSON RESPONSE
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
// HELPERS
// ============================================================

function getString(
  value: unknown,
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

function getNumber(
  value: unknown,
): number | null {
  if (
    typeof value ===
      "number" &&
    Number.isFinite(
      value,
    )
  ) {
    return value;
  }

  if (
    typeof value ===
    "string"
  ) {
    const parsed =
      Number(
        value,
      );

    if (
      Number.isFinite(
        parsed,
      )
    ) {
      return parsed;
    }
  }

  return null;
}

function getInteger(
  value: unknown,
): number | null {
  const number =
    getNumber(
      value,
    );

  if (
    number ===
      null ||
    !Number.isSafeInteger(
      number,
    )
  ) {
    return null;
  }

  return number;
}

// ============================================================
// MASK EMAIL
// ============================================================

function maskEmail(
  email:
    | string
    | null,
): string | null {
  if (!email) {
    return null;
  }

  const separator =
    email.indexOf(
      "@",
    );

  if (
    separator <= 0 ||
    separator >=
      email.length - 1
  ) {
    return null;
  }

  const local =
    email.slice(
      0,
      separator,
    );

  const domain =
    email.slice(
      separator + 1,
    );

  const visibleCharacters =
    Math.min(
      2,
      local.length,
    );

  const visible =
    local.slice(
      0,
      visibleCharacters,
    );

  const hidden =
    "*".repeat(
      Math.max(
        3,
        local.length -
          visibleCharacters,
      ),
    );

  return `${visible}${hidden}@${domain}`;
}

// ============================================================
// ORDER REFERENCE
// ============================================================

function getOrderReference(
  orderId:
    | string
    | null,
): string | null {
  if (!orderId) {
    return null;
  }

  const normalized =
    orderId.replace(
      /-/g,
      "",
    );

  if (!normalized) {
    return null;
  }

  return normalized
    .slice(
      0,
      8,
    )
    .toUpperCase();
}

// ============================================================
// STRIPE SESSION VALIDATION
// ============================================================

function isStripeSessionId(
  value:
    | string
    | null,
): value is string {
  if (!value) {
    return false;
  }

  if (
    value.length <
      10 ||
    value.length >
      255
  ) {
    return false;
  }

  /*
    Test:
    cs_test_...

    Live:
    cs_live_...
  */

  return /^cs_[A-Za-z0-9_]+$/.test(
    value,
  );
}

// ============================================================
// NORMALIZE SHIPPING METHOD
// ============================================================

function normalizeShippingMethod(
  value: unknown,
): string | null {
  const method =
    getString(
      value,
    );

  if (
    method ===
      "standard" ||
    method ===
      "free"
  ) {
    return method;
  }

  return method;
}

// ============================================================
// SHIPPING DISPLAY NAME
// ============================================================

function getShippingMethodName(
  method:
    | string
    | null,

  amountShipping:
    | number
    | null,
): string | null {
  if (
    method ===
    "free" ||
    amountShipping ===
      0
  ) {
    return "Envío estándar gratuito";
  }

  if (
    method ===
    "standard"
  ) {
    return "Envío estándar";
  }

  return method;
}

// ============================================================
// GET
// ============================================================

export const GET:
  APIRoute =
  async ({
    url,
  }) => {
    // ========================================================
    // CONFIG
    // ========================================================

    if (!supabase) {
      console.error(
        "[ATB Shop] order-status: Supabase no está configurado.",
      );

      return jsonResponse(
        {
          error:
            "No fue posible verificar el pedido.",
        },

        500,
      );
    }

    // ========================================================
    // SESSION ID
    // ========================================================

    const sessionId =
      url.searchParams
        .get(
          "session_id",
        )
        ?.trim() ??
      null;

    if (
      !isStripeSessionId(
        sessionId,
      )
    ) {
      return jsonResponse(
        {
          error:
            "La referencia de pago no es válida.",
        },

        400,
      );
    }

    // ========================================================
    // ORDER
    //
    // Sólo seleccionamos las columnas que esta API necesita.
    //
    // No exponemos:
    //
    // - dirección completa
    // - teléfono
    // - payment_intent
    // - datos internos adicionales
    // ========================================================

    const {
      data:
        rawOrderData,

      error:
        orderError,
    } =
      await supabase
        .from(
          "shop_orders",
        )
        .select(
          `
            id,
            stripe_session_id,
            customer_email,
            currency,
            amount_subtotal,
            amount_shipping,
            amount_total,
            status,
            shipping_method,
            shipping_status,
            created_at
          `,
        )
        .eq(
          "stripe_session_id",
          sessionId,
        )
        .maybeSingle();

    // ========================================================
    // DATABASE ERROR
    // ========================================================

    if (
      orderError
    ) {
      console.error(
        "[ATB Shop] order-status: error consultando pedido:",
        {
          sessionId,

          message:
            orderError.message,

          details:
            orderError.details,

          hint:
            orderError.hint,
        },
      );

      return jsonResponse(
        {
          error:
            "No fue posible verificar el pedido.",
        },

        500,
      );
    }

    // ========================================================
    // WEBHOOK MAY STILL BE PROCESSING
    //
    // Stripe puede redirigir al comprador unos instantes antes
    // de que nuestro webhook haya terminado de registrar el
    // pedido.
    //
    // La página /gracias puede reintentar al recibir 202.
    // ========================================================

    if (!rawOrderData) {
      return jsonResponse(
        {
          confirmed:
            false,

          processing:
            true,
        },

        202,
      );
    }

    const order =
      rawOrderData as
        DatabaseOrderRow;

    // ========================================================
    // ORDER ID
    // ========================================================

    const orderId =
      getString(
        order.id,
      );

    if (!orderId) {
      console.error(
        "[ATB Shop] order-status: pedido sin ID válido.",
        {
          sessionId,
        },
      );

      return jsonResponse(
        {
          error:
            "El pedido registrado no es válido.",
        },

        500,
      );
    }

    // ========================================================
    // ORDER ITEMS
    // ========================================================

    const {
      data:
        rawItemsData,

      error:
        itemsError,
    } =
      await supabase
        .from(
          "shop_order_items",
        )
        .select(
          `
            sku,
            product_name,
            variant_description,
            quantity,
            unit_amount,
            line_total,
            currency
          `,
        )
        .eq(
          "order_id",
          orderId,
        )
        .order(
          "id",
          {
            ascending:
              true,
          },
        );

    // ========================================================
    // ITEMS ERROR
    // ========================================================

    if (
      itemsError
    ) {
      console.error(
        "[ATB Shop] order-status: error consultando artículos:",
        {
          orderId,

          sessionId,

          message:
            itemsError.message,

          details:
            itemsError.details,

          hint:
            itemsError.hint,
        },
      );

      return jsonResponse(
        {
          error:
            "No fue posible consultar los artículos del pedido.",
        },

        500,
      );
    }

    // ========================================================
    // NORMALIZE ITEMS
    // ========================================================

    const items =
      (
        rawItemsData ??
        []
      ).map(
        (
          rawItem,
        ) => {
          const item =
            rawItem as
              DatabaseItemRow;

          const quantity =
            getInteger(
              item.quantity,
            ) ??
            0;

          const unitAmount =
            getInteger(
              item.unit_amount,
            );

          const storedLineTotal =
            getInteger(
              item.line_total,
            );

          const calculatedLineTotal =
            unitAmount !==
              null &&
            quantity >
              0
              ? unitAmount *
                quantity
              : null;

          return {
            sku:
              getString(
                item.sku,
              ),

            productName:
              getString(
                item.product_name,
              ) ??
              "Producto ATB",

            variantDescription:
              getString(
                item.variant_description,
              ),

            quantity,

            unitAmount,

            lineTotal:
              storedLineTotal ??
              calculatedLineTotal,

            currency:
              (
                getString(
                  item.currency,
                ) ??
                getString(
                  order.currency,
                ) ??
                "mxn"
              ).toUpperCase(),
          };
        },
      );

    // ========================================================
    // ORDER AMOUNTS
    // ========================================================

    const amountSubtotal =
      getInteger(
        order.amount_subtotal,
      );

    const amountShipping =
      getInteger(
        order.amount_shipping,
      );

    const amountTotal =
      getInteger(
        order.amount_total,
      );

    // ========================================================
    // FALLBACK FOR LEGACY ORDERS
    //
    // Pedidos anteriores a la migración de envío pueden no
    // tener una separación histórica entre subtotal y envío.
    // ========================================================

    const normalizedShipping =
      amountShipping ??
      0;

    const normalizedSubtotal =
      amountSubtotal ??
      (
        amountTotal !==
          null
          ? Math.max(
              0,
              amountTotal -
                normalizedShipping,
            )
          : null
      );

    // ========================================================
    // VERIFY AMOUNTS
    // ========================================================

    if (
      normalizedSubtotal !==
        null &&
      normalizedSubtotal < 0
    ) {
      console.error(
        "[ATB Shop] order-status: subtotal inválido.",
        {
          orderId,

          normalizedSubtotal,
        },
      );

      return jsonResponse(
        {
          error:
            "El pedido contiene importes inválidos.",
        },

        500,
      );
    }

    if (
      normalizedShipping < 0
    ) {
      console.error(
        "[ATB Shop] order-status: envío inválido.",
        {
          orderId,

          normalizedShipping,
        },
      );

      return jsonResponse(
        {
          error:
            "El pedido contiene importes inválidos.",
        },

        500,
      );
    }

    if (
      amountTotal !==
        null &&
      amountTotal < 0
    ) {
      console.error(
        "[ATB Shop] order-status: total inválido.",
        {
          orderId,

          amountTotal,
        },
      );

      return jsonResponse(
        {
          error:
            "El pedido contiene importes inválidos.",
        },

        500,
      );
    }

    // ========================================================
    // CURRENCY
    // ========================================================

    const currency =
      (
        getString(
          order.currency,
        ) ??
        "mxn"
      ).toUpperCase();

    // ========================================================
    // CUSTOMER
    // ========================================================

    const customerEmail =
      getString(
        order.customer_email,
      );

    // ========================================================
    // STATUS
    // ========================================================

    const status =
      getString(
        order.status,
      ) ??
      "paid";

    const shippingStatus =
      getString(
        order.shipping_status,
      ) ??
      "pending";

    // ========================================================
    // SHIPPING METHOD
    // ========================================================

    const shippingMethod =
      normalizeShippingMethod(
        order.shipping_method,
      );

    const shippingMethodName =
      getShippingMethodName(
        shippingMethod,
        normalizedShipping,
      );

    // ========================================================
    // CREATED AT
    // ========================================================

    const createdAt =
      getString(
        order.created_at,
      );

    // ========================================================
    // SUCCESS
    // ========================================================

    return jsonResponse(
      {
        confirmed:
          true,

        processing:
          false,

        order: {
          // ==================================================
          // IDENTIFICATION
          // ==================================================

          id:
            orderId,

          reference:
            getOrderReference(
              orderId,
            ),

          // ==================================================
          // PAYMENT STATUS
          // ==================================================

          status,

          currency,

          // ==================================================
          // AMOUNTS
          // ==================================================

          amountSubtotal:
            normalizedSubtotal,

          amountShipping:
            normalizedShipping,

          amountTotal,

          // ==================================================
          // CUSTOMER
          //
          // Nunca devolvemos el correo completo desde esta API.
          // ==================================================

          customerEmail:
            maskEmail(
              customerEmail,
            ),

          // ==================================================
          // SHIPPING
          // ==================================================

          shippingMethod,

          shippingMethodName,

          shippingStatus,

          // ==================================================
          // DATE
          // ==================================================

          createdAt,

          // ==================================================
          // ITEMS
          // ==================================================

          items,
        },
      },

      200,
    );
  };

// ============================================================
// POST
// ============================================================

export const POST:
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

// ============================================================
// PUT
// ============================================================

export const PUT:
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

// ============================================================
// DELETE
// ============================================================

export const DELETE:
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