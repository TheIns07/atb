import type {
  APIRoute,
} from "astro";

import Stripe from "stripe";

import {
  createClient,
} from "@supabase/supabase-js";

import {
  getVariantBySku,
  type Product,
  type ProductVariant,
} from "../../data/products";

// ============================================================
// SERVER ONLY
// ============================================================

export const prerender =
  false;

// ============================================================
// CONFIG
// ============================================================

const RESERVATION_TTL_MINUTES =
  35;

/*
  Stripe Checkout expirará a los 30 minutos.

  La reserva dura 35 minutos para dejar un pequeño margen
  entre la expiración de Stripe y la recepción del webhook.
*/

const STRIPE_SESSION_TTL_MINUTES =
  30;

// ============================================================
// ENVIRONMENT
// ============================================================

const stripeSecretKey =
  import.meta.env
    .STRIPE_SECRET_KEY;

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

type CheckoutRequestItem = {
  sku: string;

  quantity: number;
};

type CheckoutRequestBody = {
  items:
    CheckoutRequestItem[];
};

type NormalizedCartItem = {
  sku: string;

  quantity: number;
};

type ResolvedCheckoutItem = {
  sku: string;

  quantity: number;

  product: Product;

  variant:
    ProductVariant;
};

type ReserveInventoryResponse = {
  success?: boolean;

  reservation_id?: string;

  expires_at?: string;
};

type AttachReservationResponse = {
  success?: boolean;

  duplicate?: boolean;

  reservation_id?: string;

  stripe_session_id?: string;
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
// VARIANT DESCRIPTION
// ============================================================

function getVariantDescription(
  product: Product,

  variant:
    ProductVariant,
): string | undefined {
  const color =
    product.colors?.find(
      (
        candidate,
      ) =>
        candidate.id ===
        variant.colorId,
    );

  const parts = [
    color?.name,

    variant.size
      ? `Talla ${variant.size}`
      : undefined,
  ].filter(
    (
      value,
    ): value is string =>
      Boolean(
        value,
      ),
  );

  if (
    parts.length ===
    0
  ) {
    return undefined;
  }

  return parts.join(
    " / ",
  );
}

// ============================================================
// NORMALIZE CART
// ============================================================

function normalizeCartItems(
  items:
    CheckoutRequestItem[],
):
  | NormalizedCartItem[]
  | null {
  const combined =
    new Map<
      string,
      number
    >();

  for (
    const item
    of items
  ) {
    if (
      !item ||
      typeof item.sku !==
        "string"
    ) {
      return null;
    }

    const sku =
      item.sku
        .trim()
        .toUpperCase();

    if (
      !sku ||
      !/^[A-Z0-9-]+$/.test(
        sku,
      )
    ) {
      return null;
    }

    if (
      !Number.isInteger(
        item.quantity,
      ) ||
      item.quantity <= 0 ||
      item.quantity > 20
    ) {
      return null;
    }

    const previous =
      combined.get(
        sku,
      ) ?? 0;

    const quantity =
      previous +
      item.quantity;

    if (
      quantity > 20
    ) {
      return null;
    }

    combined.set(
      sku,
      quantity,
    );
  }

  const result =
    Array.from(
      combined,
      (
        [
          sku,
          quantity,
        ],
      ) => ({
        sku,

        quantity,
      }),
    );

  if (
    result.length >
    20
  ) {
    return null;
  }

  return result;
}

// ============================================================
// SAFE RELEASE RESERVATION
// ============================================================

async function releaseReservationSafely(
  reservationId: string,

  status:
    | "released"
    | "expired"
    | "failed" =
    "failed",
): Promise<boolean> {
  if (!supabase) {
    return false;
  }

  try {
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

    if (error) {
      console.error(
        "[ATB Shop] No se pudo liberar reserva:",
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

      return false;
    }

    return true;
  } catch (
    error
  ) {
    console.error(
      "[ATB Shop] Error inesperado liberando reserva:",
      {
        reservationId,

        error,
      },
    );

    return false;
  }
}

// ============================================================
// SAFE EXPIRE STRIPE SESSION
// ============================================================

async function expireStripeSessionSafely(
  sessionId: string,
): Promise<boolean> {
  if (!stripe) {
    return false;
  }

  try {
    await stripe.checkout
      .sessions.expire(
        sessionId,
      );

    return true;
  } catch (
    error
  ) {
    console.error(
      "[ATB Shop] No se pudo expirar Stripe Checkout:",
      {
        sessionId,

        error,
      },
    );

    return false;
  }
}

// ============================================================
// INVENTORY ERROR RESPONSE
// ============================================================

function getReservationErrorResponse(
  message:
    | string
    | undefined,
): Response {
  const normalized =
    (
      message ??
      ""
    ).toLowerCase();

  if (
    normalized.includes(
      "insufficient inventory",
    )
  ) {
    return jsonResponse(
      {
        error:
          "Uno de los productos ya no tiene suficiente inventario disponible.",
      },

      409,
    );
  }

  if (
    normalized.includes(
      "inventory sku is inactive",
    )
  ) {
    return jsonResponse(
      {
        error:
          "Uno de los productos ya no está disponible.",
      },

      409,
    );
  }

  if (
    normalized.includes(
      "inventory sku not found",
    )
  ) {
    return jsonResponse(
      {
        error:
          "No pudimos verificar el inventario de uno de los productos.",
      },

      409,
    );
  }

  return jsonResponse(
    {
      error:
        "No fue posible reservar el inventario.",
    },

    500,
  );
}

// ============================================================
// POST
// ============================================================

export const POST:
  APIRoute =
  async ({
    request,
    url,
  }) => {
    // ========================================================
    // SERVER CONFIG
    // ========================================================

    if (!stripe) {
      console.error(
        "[ATB Shop] Falta STRIPE_SECRET_KEY.",
      );

      return jsonResponse(
        {
          error:
            "No fue posible iniciar el proceso de pago.",
        },

        500,
      );
    }

    if (!supabase) {
      console.error(
        "[ATB Shop] Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.",
      );

      return jsonResponse(
        {
          error:
            "No fue posible consultar el inventario.",
        },

        500,
      );
    }

    // ========================================================
    // REQUEST BODY
    // ========================================================

    let body:
      CheckoutRequestBody;

    try {
      body =
        (await request.json()) as
          CheckoutRequestBody;
    } catch {
      return jsonResponse(
        {
          error:
            "Solicitud inválida.",
        },

        400,
      );
    }

    // ========================================================
    // CART VALIDATION
    // ========================================================

    if (
      !body ||
      !Array.isArray(
        body.items,
      ) ||
      body.items.length ===
        0
    ) {
      return jsonResponse(
        {
          error:
            "Tu bolsa está vacía.",
        },

        400,
      );
    }

    if (
      body.items.length >
      20
    ) {
      return jsonResponse(
        {
          error:
            "La bolsa contiene demasiados artículos.",
        },

        400,
      );
    }

    const normalizedItems =
      normalizeCartItems(
        body.items,
      );

    if (
      !normalizedItems ||
      normalizedItems.length ===
        0
    ) {
      return jsonResponse(
        {
          error:
            "La bolsa contiene artículos inválidos.",
        },

        400,
      );
    }

    // ========================================================
    // RESOLVE CATALOGUE
    // ========================================================

    const resolvedItems:
      ResolvedCheckoutItem[] =
      [];

    for (
      const item
      of normalizedItems
    ) {
      const resolved =
        getVariantBySku(
          item.sku,
        );

      if (!resolved) {
        console.warn(
          "[ATB Shop] SKU desconocido:",
          item.sku,
        );

        return jsonResponse(
          {
            error:
              "Uno de los productos ya no está disponible.",
          },

          400,
        );
      }

      const {
        product,
        variant,
      } =
        resolved;

      if (
        !product.active
      ) {
        return jsonResponse(
          {
            error:
              `${product.name} ya no está disponible.`,
          },

          409,
        );
      }

      if (
        product.status !==
        "available"
      ) {
        return jsonResponse(
          {
            error:
              `${product.name} no está disponible para compra.`,
          },

          409,
        );
      }

      if (
        !variant.active
      ) {
        return jsonResponse(
          {
            error:
              `La variante seleccionada de ${product.name} ya no está disponible.`,
          },

          409,
        );
      }

      if (
        variant.price ===
          null ||
        !Number.isInteger(
          variant.price,
        ) ||
        variant.price <= 0
      ) {
        console.error(
          "[ATB Shop] Precio inválido:",
          {
            sku:
              item.sku,

            price:
              variant.price,
          },
        );

        return jsonResponse(
          {
            error:
              `${product.name} todavía no tiene un precio válido.`,
          },

          409,
        );
      }

      resolvedItems.push({
        sku:
          item.sku,

        quantity:
          item.quantity,

        product,

        variant,
      });
    }

    // ========================================================
    // RESERVE INVENTORY
    // ========================================================

    const reservationItems =
      resolvedItems.map(
        (
          item,
        ) => ({
          sku:
            item.sku,

          quantity:
            item.quantity,
        }),
      );

    const {
      data:
        reservationData,

      error:
        reservationError,
    } =
      await supabase.rpc(
        "reserve_shop_inventory",
        {
          p_items:
            reservationItems,

          p_ttl_minutes:
            RESERVATION_TTL_MINUTES,
        },
      );

    if (
      reservationError
    ) {
      console.warn(
        "[ATB Shop] No se pudo reservar inventario:",
        {
          message:
            reservationError.message,

          details:
            reservationError.details,

          hint:
            reservationError.hint,
        },
      );

      return getReservationErrorResponse(
        reservationError.message,
      );
    }

    const reservation =
      reservationData as
        | ReserveInventoryResponse
        | null;

    const reservationId =
      reservation
        ?.reservation_id;

    if (
      !reservation ||
      reservation.success !==
        true ||
      !reservationId
    ) {
      console.error(
        "[ATB Shop] Supabase no devolvió una reserva válida:",
        reservationData,
      );

      return jsonResponse(
        {
          error:
            "No fue posible reservar el inventario.",
        },

        500,
      );
    }

    console.log(
      "[ATB Shop] Inventario reservado:",
      {
        reservationId,

        expiresAt:
          reservation.expires_at,

        items:
          reservationItems,
      },
    );

    // ========================================================
    // STRIPE LINE ITEMS
    // ========================================================

    const lineItems:
      Stripe.Checkout.SessionCreateParams.LineItem[] =
      resolvedItems.map(
        (
          item,
        ) => {
          const description =
            getVariantDescription(
              item.product,
              item.variant,
            );

          return {
            quantity:
              item.quantity,

            price_data: {
              currency:
                "mxn",

              unit_amount:
                item.variant
                  .price!,

              product_data: {
                name:
                  item.product
                    .name,

                ...(description
                  ? {
                      description,
                    }
                  : {}),

                metadata: {
                  sku:
                    item.sku,

                  product_id:
                    item.product
                      .id,
                },
              },
            },
          };
        },
      );

    // ========================================================
    // TOTAL ITEMS
    // ========================================================

    const totalItems =
      resolvedItems.reduce(
        (
          total,
          item,
        ) =>
          total +
          item.quantity,

        0,
      );

    // ========================================================
    // STRIPE EXPIRATION
    // ========================================================

    const stripeExpiresAt =
      Math.floor(
        Date.now() /
          1000,
      ) +
      STRIPE_SESSION_TTL_MINUTES *
        60;

    // ========================================================
    // CREATE STRIPE CHECKOUT
    // ========================================================

    let session:
      Stripe.Checkout.Session;

    try {
      session =
        await stripe.checkout
          .sessions.create({
            mode:
              "payment",

            line_items:
              lineItems,

            expires_at:
              stripeExpiresAt,

            // =================================================
            // RETURN URLS
            // =================================================

            success_url:
              `${url.origin}/tienda/gracias?session_id={CHECKOUT_SESSION_ID}`,

            /*
              IMPORTANTE:

              El reservation_id permite que /tienda/cancelado
              solicite la liberación inmediata de la reserva.
            */

            cancel_url:
              `${url.origin}/tienda/cancelado?reservation_id=${encodeURIComponent(
                reservationId,
              )}`,

            // =================================================
            // CUSTOMER
            // =================================================

            phone_number_collection: {
              enabled:
                true,
            },

            shipping_address_collection: {
              allowed_countries: [
                "MX",
              ],
            },

            // =================================================
            // SESSION METADATA
            // =================================================

            metadata: {
              source:
                "atb-shop",

              reservation_id:
                reservationId,

              total_items:
                String(
                  totalItems,
                ),
            },

            // =================================================
            // PAYMENT INTENT METADATA
            // =================================================

            payment_intent_data: {
              metadata: {
                source:
                  "atb-shop",

                reservation_id:
                  reservationId,
              },
            },
          });
    } catch (
      error
    ) {
      console.error(
        "[ATB Shop] Stripe no pudo crear Checkout:",
        error,
      );

      /*
        Stripe nunca creó una sesión.
        Podemos liberar la reserva inmediatamente.
      */

      await releaseReservationSafely(
        reservationId,
        "failed",
      );

      return jsonResponse(
        {
          error:
            "No fue posible iniciar el proceso de pago.",
        },

        500,
      );
    }

    // ========================================================
    // VALIDATE SESSION
    // ========================================================

    if (
      !session.id ||
      !session.url
    ) {
      console.error(
        "[ATB Shop] Stripe creó una sesión incompleta:",
        {
          sessionId:
            session.id,
        },
      );

      if (
        session.id
      ) {
        const expired =
          await expireStripeSessionSafely(
            session.id,
          );

        if (
          expired
        ) {
          await releaseReservationSafely(
            reservationId,
            "failed",
          );
        }
      }

      return jsonResponse(
        {
          error:
            "No fue posible abrir la página de pago.",
        },

        500,
      );
    }

    // ========================================================
    // ATTACH STRIPE SESSION TO RESERVATION
    // ========================================================

    const {
      data:
        attachData,

      error:
        attachError,
    } =
      await supabase.rpc(
        "attach_stripe_session_to_shop_reservation",
        {
          p_reservation_id:
            reservationId,

          p_stripe_session_id:
            session.id,
        },
      );

    // ========================================================
    // ATTACH FAILED
    // ========================================================

    if (
      attachError
    ) {
      console.error(
        "[ATB Shop] No se pudo vincular Stripe con la reserva:",
        {
          reservationId,

          stripeSessionId:
            session.id,

          message:
            attachError.message,

          details:
            attachError.details,

          hint:
            attachError.hint,
        },
      );

      const stripeExpired =
        await expireStripeSessionSafely(
          session.id,
        );

      if (
        stripeExpired
      ) {
        await releaseReservationSafely(
          reservationId,
          "failed",
        );
      } else {
        console.error(
          "[ATB Shop] La sesión Stripe no pudo cerrarse. La reserva permanecerá activa hasta expirar.",
          {
            reservationId,

            stripeSessionId:
              session.id,
          },
        );
      }

      return jsonResponse(
        {
          error:
            "No fue posible preparar la sesión de pago.",
        },

        500,
      );
    }

    const attachResult =
      attachData as
        | AttachReservationResponse
        | null;

    if (
      !attachResult ||
      attachResult.success !==
        true
    ) {
      console.error(
        "[ATB Shop] Respuesta inválida vinculando reserva:",
        attachData,
      );

      const stripeExpired =
        await expireStripeSessionSafely(
          session.id,
        );

      if (
        stripeExpired
      ) {
        await releaseReservationSafely(
          reservationId,
          "failed",
        );
      }

      return jsonResponse(
        {
          error:
            "No fue posible preparar la sesión de pago.",
        },

        500,
      );
    }

    // ========================================================
    // SUCCESS
    // ========================================================

    console.log(
      "[ATB Shop] Checkout preparado:",
      {
        reservationId,

        stripeSessionId:
          session.id,

        items:
          reservationItems,
      },
    );

    return jsonResponse(
      {
        url:
          session.url,

        sessionId:
          session.id,
      },

      200,
    );
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