import type {
    APIRoute,
  } from "astro";
  
  import {
    createClient,
  } from "@supabase/supabase-js";
  
  import {
    authenticateShopAdmin,
    createAdminAuthErrorResponse,
  } from "../../../lib/server/shop/admin-auth";
  
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
  
  type OrderRow = {
    id:
      string;
  
    customer_email:
      string | null;
  
    customer_name:
      string | null;
  
    customer_phone:
      string | null;
  
    currency:
      string;
  
    amount_subtotal:
      number;
  
    amount_shipping:
      number;
  
    amount_total:
      number;
  
    status:
      string;
  
    shipping_method:
      string | null;
  
    shipping_status:
      string;
  
    shipping_name:
      string | null;
  
    shipping_phone:
      string | null;
  
    shipping_address_line1:
      string | null;
  
    shipping_address_line2:
      string | null;
  
    shipping_city:
      string | null;
  
    shipping_state:
      string | null;
  
    shipping_postal_code:
      string | null;
  
    shipping_country:
      string | null;
  
    carrier:
      string | null;
  
    tracking_number:
      string | null;
  
    shipped_at:
      string | null;
  
    delivered_at:
      string | null;
  
    confirmation_email_sent_at:
      string | null;
  
    confirmation_email_id:
      string | null;
  
    shipping_email_sent_at:
      string | null;
  
    shipping_email_id:
      string | null;
  
    email_last_error:
      string | null;
  
    created_at:
      string;
  };
  
  type OrderItemRow = {
    id:
      string;
  
    order_id:
      string;
  
    sku:
      string;
  
    product_name:
      string;
  
    variant_description:
      string | null;
  
    quantity:
      number;
  
    unit_amount:
      number;
  
    line_total:
      number;
  
    currency:
      string;
  };
  
  // ============================================================
  // RESPONSE
  // ============================================================
  
  function jsonResponse(
    body:
      Record<
        string,
        unknown
      >,
  
    status =
      200,
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
  // INTEGER PARAM
  // ============================================================
  
  function getIntegerParam(
    value:
      string | null,
  
    fallback:
      number,
  
    minimum:
      number,
  
    maximum:
      number,
  ): number {
    if (
      !value
    ) {
      return fallback;
    }
  
    const parsed =
      Number.parseInt(
        value,
        10,
      );
  
    if (
      !Number.isFinite(
        parsed,
      )
    ) {
      return fallback;
    }
  
    return Math.min(
      maximum,
      Math.max(
        minimum,
        parsed,
      ),
    );
  }
  
  // ============================================================
  // VALID SHIPPING STATUS
  // ============================================================
  
  function isValidShippingStatus(
    value:
      string,
  ): boolean {
    return [
      "pending",
      "ready",
      "shipped",
      "delivered",
      "cancelled",
    ].includes(
      value,
    );
  }
  
  // ============================================================
  // GET
  // ============================================================
  
  export const GET:
    APIRoute =
    async ({
      request,
      url,
    }) => {
      // ========================================================
      // AUTH
      // ========================================================
  
      const auth =
        await authenticateShopAdmin(
          request,
        );
  
      if (
        !auth.ok
      ) {
        return createAdminAuthErrorResponse(
          auth,
        );
      }
  
      // ========================================================
      // SERVER CONFIG
      // ========================================================
  
      if (
        !supabase
      ) {
        console.error(
          "[ATB Admin] Supabase no está configurado.",
        );
  
        return jsonResponse(
          {
            error:
              "No fue posible consultar los pedidos.",
          },
  
          500,
        );
      }
  
      // ========================================================
      // PAGINATION
      // ========================================================
  
      const page =
        getIntegerParam(
          url.searchParams.get(
            "page",
          ),
  
          1,
          1,
          100000,
        );
  
      const limit =
        getIntegerParam(
          url.searchParams.get(
            "limit",
          ),
  
          25,
          1,
          100,
        );
  
      const offset =
        (
          page -
          1
        ) *
        limit;
  
      const rangeEnd =
        offset +
        limit -
        1;
  
      // ========================================================
      // OPTIONAL FILTER
      //
      // /api/admin/orders?shipping_status=pending
      // ========================================================
  
      const rawShippingStatus =
        url.searchParams
          .get(
            "shipping_status",
          )
          ?.trim()
          .toLowerCase() ??
        null;
  
      if (
        rawShippingStatus &&
        !isValidShippingStatus(
          rawShippingStatus,
        )
      ) {
        return jsonResponse(
          {
            error:
              "El estado de envío no es válido.",
          },
  
          400,
        );
      }
  
      // ========================================================
      // ORDERS QUERY
      // ========================================================
  
      let query =
        supabase
          .from(
            "shop_orders",
          )
          .select(
            `
              id,
              customer_email,
              customer_name,
              customer_phone,
              currency,
              amount_subtotal,
              amount_shipping,
              amount_total,
              status,
              shipping_method,
              shipping_status,
              shipping_name,
              shipping_phone,
              shipping_address_line1,
              shipping_address_line2,
              shipping_city,
              shipping_state,
              shipping_postal_code,
              shipping_country,
              carrier,
              tracking_number,
              shipped_at,
              delivered_at,
              confirmation_email_sent_at,
              confirmation_email_id,
              shipping_email_sent_at,
              shipping_email_id,
              email_last_error,
              created_at
            `,
            {
              count:
                "exact",
            },
          )
          .order(
            "created_at",
            {
              ascending:
                false,
            },
          )
          .range(
            offset,
            rangeEnd,
          );
  
      // ========================================================
      // SHIPPING FILTER
      // ========================================================
  
      if (
        rawShippingStatus
      ) {
        query =
          query.eq(
            "shipping_status",
            rawShippingStatus,
          );
      }
  
      // ========================================================
      // FETCH ORDERS
      // ========================================================
  
      const {
        data:
          orderData,
  
        error:
          orderError,
  
        count,
      } =
        await query;
  
      if (
        orderError
      ) {
        console.error(
          "[ATB Admin] Error consultando pedidos:",
          {
            admin:
              auth.admin.email,
  
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
              "No fue posible consultar los pedidos.",
          },
  
          500,
        );
      }
  
      const orders =
        (
          orderData ??
          []
        ) as
          OrderRow[];
  
      // ========================================================
      // EMPTY
      // ========================================================
  
      if (
        orders.length ===
        0
      ) {
        return jsonResponse(
          {
            orders:
              [],
  
            pagination: {
              page,
  
              limit,
  
              total:
                count ??
                0,
  
              totalPages:
                0,
            },
          },
  
          200,
        );
      }
  
      // ========================================================
      // ORDER IDS
      // ========================================================
  
      const orderIds =
        orders.map(
          (
            order,
          ) =>
            order.id,
        );
  
      // ========================================================
      // ITEMS
      //
      // Hacemos una sola consulta para todos los pedidos de
      // esta página, en lugar de una consulta por pedido.
      // ========================================================
  
      const {
        data:
          itemData,
  
        error:
          itemError,
      } =
        await supabase
          .from(
            "shop_order_items",
          )
          .select(
            `
              id,
              order_id,
              sku,
              product_name,
              variant_description,
              quantity,
              unit_amount,
              line_total,
              currency
            `,
          )
          .in(
            "order_id",
            orderIds,
          )
          .order(
            "id",
            {
              ascending:
                true,
            },
          );
  
      if (
        itemError
      ) {
        console.error(
          "[ATB Admin] Error consultando productos de pedidos:",
          {
            admin:
              auth.admin.email,
  
            message:
              itemError.message,
  
            details:
              itemError.details,
  
            hint:
              itemError.hint,
          },
        );
  
        return jsonResponse(
          {
            error:
              "No fue posible consultar los productos de los pedidos.",
          },
  
          500,
        );
      }
  
      const items =
        (
          itemData ??
          []
        ) as
          OrderItemRow[];
  
      // ========================================================
      // GROUP ITEMS
      // ========================================================
  
      const itemsByOrder =
        new Map<
          string,
          OrderItemRow[]
        >();
  
      for (
        const item
        of items
      ) {
        const current =
          itemsByOrder.get(
            item.order_id,
          ) ??
          [];
  
        current.push(
          item,
        );
  
        itemsByOrder.set(
          item.order_id,
          current,
        );
      }
  
      // ========================================================
      // PUBLIC ADMIN RESPONSE
      //
      // Esta respuesta contiene información privada.
      //
      // Únicamente sale después de authenticateShopAdmin().
      // ========================================================
  
      const responseOrders =
        orders.map(
          (
            order,
          ) => ({
            id:
              order.id,
  
            reference:
              getOrderReference(
                order.id,
              ),
  
            // ==================================================
            // CUSTOMER
            // ==================================================
  
            customer: {
              name:
                order.customer_name,
  
              email:
                order.customer_email,
  
              phone:
                order.customer_phone,
            },
  
            // ==================================================
            // PAYMENT
            // ==================================================
  
            payment: {
              status:
                order.status,
  
              currency:
                order.currency
                  ?.toUpperCase() ??
                "MXN",
  
              amountSubtotal:
                order.amount_subtotal,
  
              amountShipping:
                order.amount_shipping,
  
              amountTotal:
                order.amount_total,
            },
  
            // ==================================================
            // SHIPPING
            // ==================================================
  
            shipping: {
              method:
                order.shipping_method,
  
              status:
                order.shipping_status,
  
              name:
                order.shipping_name,
  
              phone:
                order.shipping_phone,
  
              address: {
                line1:
                  order.shipping_address_line1,
  
                line2:
                  order.shipping_address_line2,
  
                city:
                  order.shipping_city,
  
                state:
                  order.shipping_state,
  
                postalCode:
                  order.shipping_postal_code,
  
                country:
                  order.shipping_country,
              },
  
              carrier:
                order.carrier,
  
              trackingNumber:
                order.tracking_number,
  
              shippedAt:
                order.shipped_at,
  
              deliveredAt:
                order.delivered_at,
            },
  
            // ==================================================
            // EMAIL
            // ==================================================
  
            email: {
              confirmationSentAt:
                order.confirmation_email_sent_at,
  
              confirmationEmailId:
                order.confirmation_email_id,
  
              shippingSentAt:
                order.shipping_email_sent_at,
  
              shippingEmailId:
                order.shipping_email_id,
  
              lastError:
                order.email_last_error,
            },
  
            // ==================================================
            // ITEMS
            // ==================================================
  
            items:
              (
                itemsByOrder.get(
                  order.id,
                ) ??
                []
              ).map(
                (
                  item,
                ) => ({
                  id:
                    item.id,
  
                  sku:
                    item.sku,
  
                  productName:
                    item.product_name,
  
                  variantDescription:
                    item.variant_description,
  
                  quantity:
                    item.quantity,
  
                  unitAmount:
                    item.unit_amount,
  
                  lineTotal:
                    item.line_total,
  
                  currency:
                    item.currency
                      ?.toUpperCase() ??
                    order.currency
                      ?.toUpperCase() ??
                    "MXN",
                }),
              ),
  
            // ==================================================
            // DATE
            // ==================================================
  
            createdAt:
              order.created_at,
          }),
        );
  
      // ========================================================
      // PAGINATION
      // ========================================================
  
      const total =
        count ??
        responseOrders.length;
  
      const totalPages =
        total ===
          0
          ? 0
          : Math.ceil(
              total /
                limit,
            );
  
      // ========================================================
      // SUCCESS
      // ========================================================
  
      return jsonResponse(
        {
          orders:
            responseOrders,
  
          pagination: {
            page,
  
            limit,
  
            total,
  
            totalPages,
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
  // PATCH
  // ============================================================
  
  export const PATCH:
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