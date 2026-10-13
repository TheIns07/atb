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
  
  type DatabaseRow =
    Record<
      string,
      unknown
    >;
  
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
      !Number.isInteger(
        number,
      )
    ) {
      return null;
    }
  
    return number;
  }
  
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
      separator ===
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
  
    const visible =
      local.slice(
        0,
        Math.min(
          2,
          local.length,
        ),
      );
  
    return `${visible}${"*".repeat(
      Math.max(
        3,
        local.length -
          visible.length,
      ),
    )}@${domain}`;
  }
  
  function getOrderReference(
    id:
      | string
      | null,
  ): string | null {
    if (!id) {
      return null;
    }
  
    const normalized =
      id.replace(
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
  
    return /^cs_[A-Za-z0-9_]+$/.test(
      value,
    );
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
            "*",
          )
          .eq(
            "stripe_session_id",
            sessionId,
          )
          .maybeSingle();
  
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
      // ========================================================
  
      if (!orderData) {
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
        orderData as
          DatabaseRow;
  
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
          itemsData,
  
        error:
          itemsError,
      } =
        await supabase
          .from(
            "shop_order_items",
          )
          .select(
            "*",
          )
          .eq(
            "order_id",
            orderId,
          );
  
      if (
        itemsError
      ) {
        console.error(
          "[ATB Shop] order-status: error consultando artículos:",
          {
            orderId,
  
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
  
      const items =
        (
          itemsData ??
          []
        ).map(
          (
            rawItem,
          ) => {
            const item =
              rawItem as
                DatabaseRow;
  
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
                null
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
            };
          },
        );
  
      // ========================================================
      // PUBLIC ORDER DATA
      // ========================================================
  
      const currency =
        (
          getString(
            order.currency,
          ) ??
          "mxn"
        ).toUpperCase();
  
      const amountTotal =
        getInteger(
          order.amount_total,
        );
  
      const customerEmail =
        getString(
          order.customer_email,
        );
  
      const createdAt =
        getString(
          order.created_at,
        );
  
      const status =
        getString(
          order.status,
        ) ??
        "paid";
  
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
            id:
              orderId,
  
            reference:
              getOrderReference(
                orderId,
              ),
  
            status,
  
            currency,
  
            amountTotal,
  
            customerEmail:
              maskEmail(
                customerEmail,
              ),
  
            createdAt,
  
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