import type {
    APIRoute,
  } from "astro";
  
  import {
    createClient,
  } from "@supabase/supabase-js";
  
  import {
    authenticateShopAdmin,
    createAdminAuthErrorResponse,
  } from "../../../../lib/server/shop/admin-auth";
  
  import {
    sendShippingEmail,
  } from "../../../../lib/server/shop/email";
  
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
  
  type ShippingStatus =
    | "pending"
    | "ready"
    | "shipped"
    | "delivered"
    | "cancelled";
  
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
      ShippingStatus;
  
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
  
  type PatchOrderBody = {
    shippingStatus?:
      string;
  
    carrier?:
      string | null;
  
    trackingNumber?:
      string | null;
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
  // UUID
  // ============================================================
  
  function isUuid(
    value:
      string,
  ): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    );
  }
  
  // ============================================================
  // SHIPPING STATUS
  // ============================================================
  
  function isShippingStatus(
    value:
      string,
  ): value is ShippingStatus {
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
  // VALID STATUS TRANSITIONS
  //
  // pending   -> ready / cancelled
  // ready     -> shipped / cancelled
  // shipped   -> delivered
  //
  // El mismo estado se permite para actualizaciones idempotentes.
  // ============================================================
  
  function canTransitionShippingStatus(
    current:
      ShippingStatus,
  
    next:
      ShippingStatus,
  ): boolean {
    if (
      current ===
      next
    ) {
      return true;
    }
  
    switch (
      current
    ) {
      case "pending":
        return (
          next ===
            "ready" ||
          next ===
            "cancelled"
        );
  
      case "ready":
        return (
          next ===
            "shipped" ||
          next ===
            "cancelled"
        );
  
      case "shipped":
        return (
          next ===
          "delivered"
        );
  
      case "delivered":
        return false;
  
      case "cancelled":
        return false;
  
      default:
        return false;
    }
  }
  
  // ============================================================
  // GET ORDER
  // ============================================================
  
  async function getOrder(
    orderId:
      string,
  ): Promise<{
    order:
      OrderRow | null;
  
    error:
      string | null;
  }> {
    if (
      !supabase
    ) {
      return {
        order:
          null,
  
        error:
          "Supabase no está configurado.",
      };
    }
  
    const {
      data,
      error,
    } =
      await supabase
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
        )
        .eq(
          "id",
          orderId,
        )
        .maybeSingle();
  
    if (
      error
    ) {
      console.error(
        "[ATB Admin] Error consultando pedido:",
        {
          orderId,
  
          message:
            error.message,
  
          details:
            error.details,
  
          hint:
            error.hint,
        },
      );
  
      return {
        order:
          null,
  
        error:
          "No fue posible consultar el pedido.",
      };
    }
  
    return {
      order:
        data as
          OrderRow | null,
  
      error:
        null,
    };
  }
  
  // ============================================================
  // SERIALIZE ORDER
  // ============================================================
  
  function serializeOrder(
    order:
      OrderRow,
  ) {
    return {
      id:
        order.id,
  
      reference:
        getOrderReference(
          order.id,
        ),
  
      customer: {
        name:
          order.customer_name,
  
        email:
          order.customer_email,
  
        phone:
          order.customer_phone,
      },
  
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
  
      createdAt:
        order.created_at,
    };
  }
  
  // ============================================================
  // SAVE EMAIL ERROR
  // ============================================================
  
  async function saveEmailError(
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
          "[ATB Admin] No se pudo guardar email_last_error:",
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
        "[ATB Admin] Error guardando fallo de email:",
        {
          orderId,
  
          error,
        },
      );
    }
  }
  
  // ============================================================
  // SHIPPING EMAIL
  //
  // Nunca hacemos rollback del estado "shipped" si Resend falla.
  // ============================================================
  
  async function sendShippingEmailSafely(
    order:
      OrderRow,
  ): Promise<void> {
    if (
      !supabase
    ) {
      return;
    }
  
    // ==========================================================
    // ALREADY SENT
    // ==========================================================
  
    if (
      order.shipping_email_sent_at
    ) {
      console.log(
        "[ATB Admin] Correo de envío ya enviado:",
        {
          orderId:
            order.id,
  
          emailId:
            order.shipping_email_id,
        },
      );
  
      return;
    }
  
    // ==========================================================
    // CUSTOMER EMAIL
    // ==========================================================
  
    const customerEmail =
      getString(
        order.customer_email,
      );
  
    if (
      !customerEmail
    ) {
      await saveEmailError(
        order.id,
        "No existe un correo del comprador para enviar la guía.",
      );
  
      return;
    }
  
    // ==========================================================
    // TRACKING
    // ==========================================================
  
    const carrier =
      getString(
        order.carrier,
      );
  
    const trackingNumber =
      getString(
        order.tracking_number,
      );
  
    if (
      !carrier ||
      !trackingNumber
    ) {
      await saveEmailError(
        order.id,
        "Falta la paquetería o el número de guía.",
      );
  
      return;
    }
  
    // ==========================================================
    // SEND
    // ==========================================================
  
    try {
      const result =
        await sendShippingEmail({
          orderId:
            order.id,
  
          reference:
            getOrderReference(
              order.id,
            ),
  
          customerEmail,
  
          customerName:
            order.customer_name,
  
          carrier,
  
          trackingNumber,
        });
  
      // ========================================================
      // EMAIL DISABLED
      // ========================================================
  
      if (
        result.success &&
        result.skipped
      ) {
        console.log(
          "[ATB Admin] Correo de envío omitido porque email está deshabilitado:",
          {
            orderId:
              order.id,
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
          "No fue posible enviar el correo de envío.";
  
        console.error(
          "[ATB Admin] Falló correo de envío:",
          {
            orderId:
              order.id,
  
            message,
          },
        );
  
        await saveEmailError(
          order.id,
          message,
        );
  
        return;
      }
  
      // ========================================================
      // SUCCESS BUT NO ID
      // ========================================================
  
      if (
        !result.emailId
      ) {
        await saveEmailError(
          order.id,
          "Resend reportó éxito pero no devolvió emailId.",
        );
  
        return;
      }
  
      // ========================================================
      // SAVE EMAIL STATE
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
            shipping_email_sent_at:
              new Date()
                .toISOString(),
  
            shipping_email_id:
              result.emailId,
  
            email_last_error:
              null,
          })
          .eq(
            "id",
            order.id,
          );
  
      if (
        updateError
      ) {
        /*
          El correo ya salió.
  
          No hacemos rollback.
  
          La Idempotency-Key de Resend protege contra
          duplicados en un reintento inmediato.
        */
  
        console.error(
          "[ATB Admin] Correo enviado pero no se pudo guardar su estado:",
          {
            orderId:
              order.id,
  
            emailId:
              result.emailId,
  
            message:
              updateError.message,
          },
        );
  
        return;
      }
  
      console.log(
        "[ATB Admin] Correo de envío enviado:",
        {
          orderId:
            order.id,
  
          emailId:
            result.emailId,
        },
      );
    } catch (
      error
    ) {
      console.error(
        "[ATB Admin] Error inesperado enviando correo de tracking:",
        {
          orderId:
            order.id,
  
          error,
        },
      );
  
      await saveEmailError(
        order.id,
  
        error instanceof
          Error
          ? error.message
          : "Error inesperado enviando correo.",
      );
    }
  }
  
  // ============================================================
  // GET
  // ============================================================
  
  export const GET:
    APIRoute =
    async ({
      request,
      params,
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
      // CONFIG
      // ========================================================
  
      if (
        !supabase
      ) {
        return jsonResponse(
          {
            error:
              "No fue posible consultar el pedido.",
          },
  
          500,
        );
      }
  
      // ========================================================
      // ID
      // ========================================================
  
      const orderId =
        params.id
          ?.trim();
  
      if (
        !orderId ||
        !isUuid(
          orderId,
        )
      ) {
        return jsonResponse(
          {
            error:
              "El identificador del pedido no es válido.",
          },
  
          400,
        );
      }
  
      // ========================================================
      // ORDER
      // ========================================================
  
      const result =
        await getOrder(
          orderId,
        );
  
      if (
        result.error
      ) {
        return jsonResponse(
          {
            error:
              result.error,
          },
  
          500,
        );
      }
  
      if (
        !result.order
      ) {
        return jsonResponse(
          {
            error:
              "El pedido no existe.",
          },
  
          404,
        );
      }
  
      // ========================================================
      // SUCCESS
      // ========================================================
  
      return jsonResponse(
        {
          order:
            serializeOrder(
              result.order,
            ),
        },
  
        200,
      );
    };
  
  // ============================================================
  // PATCH
  // ============================================================
  
  export const PATCH:
    APIRoute =
    async ({
      request,
      params,
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
      // CONFIG
      // ========================================================
  
      if (
        !supabase
      ) {
        return jsonResponse(
          {
            error:
              "No fue posible actualizar el pedido.",
          },
  
          500,
        );
      }
  
      // ========================================================
      // ORDER ID
      // ========================================================
  
      const orderId =
        params.id
          ?.trim();
  
      if (
        !orderId ||
        !isUuid(
          orderId,
        )
      ) {
        return jsonResponse(
          {
            error:
              "El identificador del pedido no es válido.",
          },
  
          400,
        );
      }
  
      // ========================================================
      // BODY
      // ========================================================
  
      let body:
        PatchOrderBody;
  
      try {
        body =
          (await request.json()) as
            PatchOrderBody;
      } catch {
        return jsonResponse(
          {
            error:
              "La solicitud no contiene JSON válido.",
          },
  
          400,
        );
      }
  
      // ========================================================
      // SHIPPING STATUS
      // ========================================================
  
      const rawShippingStatus =
        getString(
          body.shippingStatus,
        )?.toLowerCase();
  
      if (
        !rawShippingStatus ||
        !isShippingStatus(
          rawShippingStatus,
        )
      ) {
        return jsonResponse(
          {
            error:
              "Debes proporcionar un estado de envío válido.",
          },
  
          400,
        );
      }
  
      const nextStatus:
        ShippingStatus =
        rawShippingStatus;
  
      // ========================================================
      // CURRENT ORDER
      // ========================================================
  
      const currentResult =
        await getOrder(
          orderId,
        );
  
      if (
        currentResult.error
      ) {
        return jsonResponse(
          {
            error:
              currentResult.error,
          },
  
          500,
        );
      }
  
      const currentOrder =
        currentResult.order;
  
      if (
        !currentOrder
      ) {
        return jsonResponse(
          {
            error:
              "El pedido no existe.",
          },
  
          404,
        );
      }
  
      // ========================================================
      // CURRENT SHIPPING STATUS
      // ========================================================
  
      const currentStatus =
        currentOrder
          .shipping_status;
  
      if (
        !isShippingStatus(
          currentStatus,
        )
      ) {
        console.error(
          "[ATB Admin] Pedido contiene shipping_status inválido:",
          {
            orderId,
  
            currentStatus,
          },
        );
  
        return jsonResponse(
          {
            error:
              "El pedido contiene un estado de envío inválido.",
          },
  
          500,
        );
      }
  
      // ========================================================
      // TRANSITION
      // ========================================================
  
      if (
        !canTransitionShippingStatus(
          currentStatus,
          nextStatus,
        )
      ) {
        return jsonResponse(
          {
            error:
              `No se puede cambiar el pedido de "${currentStatus}" a "${nextStatus}".`,
          },
  
          409,
        );
      }
  
      // ========================================================
      // CARRIER / TRACKING
      // ========================================================
  
      const requestedCarrier =
        getString(
          body.carrier,
        );
  
      const requestedTrackingNumber =
        getString(
          body.trackingNumber,
        );
  
      if (
        requestedCarrier &&
        requestedCarrier.length >
          120
      ) {
        return jsonResponse(
          {
            error:
              "El nombre de la paquetería es demasiado largo.",
          },
  
          400,
        );
      }
  
      if (
        requestedTrackingNumber &&
        requestedTrackingNumber.length >
          200
      ) {
        return jsonResponse(
          {
            error:
              "El número de guía es demasiado largo.",
          },
  
          400,
        );
      }
  
      // ========================================================
      // SHIPPING DATA
      //
      // Para enviar necesitamos siempre carrier + tracking.
      //
      // Si ya estaba shipped, permitimos actualizar esos datos.
      // ========================================================
  
      const carrier =
        requestedCarrier ??
        currentOrder.carrier;
  
      const trackingNumber =
        requestedTrackingNumber ??
        currentOrder.tracking_number;
  
      if (
        nextStatus ===
          "shipped" &&
        (
          !carrier ||
          !trackingNumber
        )
      ) {
        return jsonResponse(
          {
            error:
              "Para marcar el pedido como enviado debes indicar paquetería y número de guía.",
          },
  
          400,
        );
      }
  
      // ========================================================
      // UPDATE DATA
      // ========================================================
  
      const updateData:
        Record<
          string,
          unknown
        > = {
          shipping_status:
            nextStatus,
        };
  
      // ========================================================
      // SHIPPED
      // ========================================================
  
      if (
        nextStatus ===
        "shipped"
      ) {
        updateData.carrier =
          carrier;
  
        updateData.tracking_number =
          trackingNumber;
  
        /*
          Si ya estaba shipped y sólo corregimos la guía,
          no reemplazamos la fecha original.
        */
  
        if (
          !currentOrder
            .shipped_at
        ) {
          updateData.shipped_at =
            new Date()
              .toISOString();
        }
      }
  
      // ========================================================
      // DELIVERED
      // ========================================================
  
      if (
        nextStatus ===
        "delivered"
      ) {
        if (
          !currentOrder
            .delivered_at
        ) {
          updateData.delivered_at =
            new Date()
              .toISOString();
        }
      }
  
      // ========================================================
      // DATABASE UPDATE
      // ========================================================
  
      const {
        data:
          updatedData,
  
        error:
          updateError,
      } =
        await supabase
          .from(
            "shop_orders",
          )
          .update(
            updateData,
          )
          .eq(
            "id",
            orderId,
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
          )
          .maybeSingle();
  
      if (
        updateError
      ) {
        console.error(
          "[ATB Admin] Error actualizando pedido:",
          {
            admin:
              auth.admin.email,
  
            orderId,
  
            currentStatus,
  
            nextStatus,
  
            message:
              updateError.message,
  
            details:
              updateError.details,
  
            hint:
              updateError.hint,
          },
        );
  
        return jsonResponse(
          {
            error:
              "No fue posible actualizar el pedido.",
          },
  
          500,
        );
      }
  
      if (
        !updatedData
      ) {
        return jsonResponse(
          {
            error:
              "El pedido no pudo ser actualizado.",
          },
  
          500,
        );
      }
  
      let updatedOrder =
        updatedData as
          OrderRow;
  
      // ========================================================
      // SHIPPING EMAIL
      //
      // Sólo cuando el pedido está shipped.
      //
      // Si ya fue enviado previamente:
      // shipping_email_sent_at evita otro correo.
      //
      // Además Resend tiene Idempotency-Key.
      // ========================================================
  
      if (
        nextStatus ===
        "shipped"
      ) {
        await sendShippingEmailSafely(
          updatedOrder,
        );
  
        /*
          Volvemos a consultar para que la respuesta incluya:
  
          shipping_email_sent_at
          shipping_email_id
          email_last_error
  
          actualizados por sendShippingEmailSafely().
        */
  
        const refreshed =
          await getOrder(
            orderId,
          );
  
        if (
          refreshed.order
        ) {
          updatedOrder =
            refreshed.order;
        }
      }
  
      // ========================================================
      // LOG
      // ========================================================
  
      console.log(
        "[ATB Admin] Pedido actualizado:",
        {
          admin:
            auth.admin.email,
  
          orderId,
  
          reference:
            getOrderReference(
              orderId,
            ),
  
          previousStatus:
            currentStatus,
  
          shippingStatus:
            nextStatus,
  
          carrier:
            updatedOrder.carrier,
  
          trackingNumber:
            updatedOrder
              .tracking_number,
        },
      );
  
      // ========================================================
      // SUCCESS
      // ========================================================
  
      return jsonResponse(
        {
          success:
            true,
  
          order:
            serializeOrder(
              updatedOrder,
            ),
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