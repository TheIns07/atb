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
  
  type CancelRequestBody = {
    reservationId?: string;
  
    reservation_id?: string;
  };
  
  type ReservationRow = {
    id: string;
  
    stripe_session_id:
      | string
      | null;
  
    status: string;
  
    expires_at: string;
  };
  
  type ReleaseResponse = {
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
  // UUID VALIDATION
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
  // RELEASE RESERVATION
  // ============================================================
  
  async function releaseReservation(
    reservationId: string,
  
    status:
      | "released"
      | "expired",
  ): Promise<ReleaseResponse> {
    if (!supabase) {
      throw new Error(
        "Supabase is not configured.",
      );
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
        "[ATB Shop] Cancel checkout: error liberando reserva:",
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
  
    const result =
      data as
        | ReleaseResponse
        | null;
  
    if (
      !result ||
      result.success !==
        true
    ) {
      throw new Error(
        `Invalid reservation release response for ${reservationId}.`,
      );
    }
  
    return result;
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
          "[ATB Shop] Cancel checkout: falta STRIPE_SECRET_KEY.",
        );
  
        return jsonResponse(
          {
            error:
              "No fue posible cancelar la sesión de pago.",
          },
  
          500,
        );
      }
  
      if (!supabase) {
        console.error(
          "[ATB Shop] Cancel checkout: Supabase no está configurado.",
        );
  
        return jsonResponse(
          {
            error:
              "No fue posible liberar el inventario.",
          },
  
          500,
        );
      }
  
      // ========================================================
      // BODY
      // ========================================================
  
      let body:
        CancelRequestBody;
  
      try {
        body =
          (await request.json()) as
            CancelRequestBody;
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
      // RESERVATION ID
      // ========================================================
  
      const reservationId =
        (
          body.reservationId ??
          body.reservation_id ??
          ""
        ).trim();
  
      if (
        !isUuid(
          reservationId,
        )
      ) {
        return jsonResponse(
          {
            error:
              "La referencia de reserva no es válida.",
          },
  
          400,
        );
      }
  
      // ========================================================
      // GET RESERVATION
      // ========================================================
  
      const {
        data:
          reservationData,
  
        error:
          reservationError,
      } =
        await supabase
          .from(
            "shop_inventory_reservations",
          )
          .select(
            `
              id,
              stripe_session_id,
              status,
              expires_at
            `,
          )
          .eq(
            "id",
            reservationId,
          )
          .maybeSingle();
  
      if (
        reservationError
      ) {
        console.error(
          "[ATB Shop] Cancel checkout: error consultando reserva:",
          {
            reservationId,
  
            message:
              reservationError.message,
  
            details:
              reservationError.details,
  
            hint:
              reservationError.hint,
          },
        );
  
        return jsonResponse(
          {
            error:
              "No fue posible consultar la reserva.",
          },
  
          500,
        );
      }
  
      const reservation =
        reservationData as
          | ReservationRow
          | null;
  
      // ========================================================
      // NOT FOUND
      // ========================================================
  
      if (!reservation) {
        return jsonResponse(
          {
            error:
              "La reserva no existe.",
          },
  
          404,
        );
      }
  
      // ========================================================
      // ALREADY CONFIRMED
      //
      // Nunca liberamos una compra ya pagada.
      // ========================================================
  
      if (
        reservation.status ===
        "confirmed"
      ) {
        return jsonResponse(
          {
            success:
              false,
  
            released:
              false,
  
            paid:
              true,
  
            status:
              "confirmed",
  
            error:
              "La compra ya fue confirmada.",
          },
  
          409,
        );
      }
  
      // ========================================================
      // ALREADY RELEASED
      // ========================================================
  
      if (
        reservation.status ===
          "released" ||
        reservation.status ===
          "expired" ||
        reservation.status ===
          "failed"
      ) {
        return jsonResponse(
          {
            success:
              true,
  
            released:
              false,
  
            duplicate:
              true,
  
            status:
              reservation.status,
  
            reservationId,
          },
  
          200,
        );
      }
  
      // ========================================================
      // ACTIVE ONLY
      // ========================================================
  
      if (
        reservation.status !==
        "active"
      ) {
        return jsonResponse(
          {
            success:
              false,
  
            released:
              false,
  
            error:
              "La reserva no se encuentra en un estado cancelable.",
          },
  
          409,
        );
      }
  
      // ========================================================
      // STRIPE SESSION REQUIRED
      // ========================================================
  
      const stripeSessionId =
        reservation
          .stripe_session_id;
  
      if (
        !stripeSessionId
      ) {
        console.error(
          "[ATB Shop] Cancel checkout: reserva activa sin Stripe Session:",
          {
            reservationId,
          },
        );
  
        /*
          No liberamos a ciegas.
  
          Una reserva vinculada a Checkout debería tener
          siempre una stripe_session_id.
        */
  
        return jsonResponse(
          {
            error:
              "La reserva todavía no está vinculada a una sesión de pago.",
          },
  
          409,
        );
      }
  
      // ========================================================
      // GET STRIPE SESSION
      // ========================================================
  
      let session:
        Stripe.Checkout.Session;
  
      try {
        session =
          await stripe.checkout
            .sessions.retrieve(
              stripeSessionId,
            );
      } catch (
        error
      ) {
        console.error(
          "[ATB Shop] Cancel checkout: no se pudo consultar Stripe:",
          {
            reservationId,
  
            stripeSessionId,
  
            error,
          },
        );
  
        /*
          Si no podemos verificar Stripe,
          NO liberamos inventario.
  
          Fail closed.
        */
  
        return jsonResponse(
          {
            error:
              "No fue posible verificar el estado del pago.",
          },
  
          502,
        );
      }
  
      // ========================================================
      // PAID
      //
      // Nunca liberar una unidad después del pago.
      // ========================================================
  
      if (
        session.payment_status ===
          "paid" ||
        session.payment_status ===
          "no_payment_required"
      ) {
        return jsonResponse(
          {
            success:
              false,
  
            released:
              false,
  
            paid:
              true,
  
            error:
              "La sesión de pago ya fue completada.",
          },
  
          409,
        );
      }
  
      // ========================================================
      // COMPLETED BUT NOT YET PAID
      //
      // Puede ocurrir con métodos de pago asíncronos.
      //
      // Tampoco debemos liberar inventario aquí.
      // ========================================================
  
      if (
        session.status ===
        "complete"
      ) {
        return jsonResponse(
          {
            success:
              false,
  
            released:
              false,
  
            pending:
              true,
  
            error:
              "La sesión de pago ya fue completada y está pendiente de confirmación.",
          },
  
          409,
        );
      }
  
      // ========================================================
      // ALREADY EXPIRED
      // ========================================================
  
      if (
        session.status ===
        "expired"
      ) {
        try {
          const result =
            await releaseReservation(
              reservationId,
              "expired",
            );
  
          console.log(
            "[ATB Shop] Reserva expirada liberada:",
            {
              reservationId,
  
              stripeSessionId,
            },
          );
  
          return jsonResponse(
            {
              success:
                true,
  
              released:
                result.released ??
                true,
  
              reservationId,
  
              status:
                "expired",
            },
  
            200,
          );
        } catch {
          return jsonResponse(
            {
              error:
                "No fue posible liberar el inventario.",
            },
  
            500,
          );
        }
      }
  
      // ========================================================
      // ONLY OPEN CHECKOUT MAY BE CANCELLED
      // ========================================================
  
      if (
        session.status !==
        "open"
      ) {
        console.warn(
          "[ATB Shop] Cancel checkout: estado Stripe inesperado:",
          {
            reservationId,
  
            stripeSessionId,
  
            stripeStatus:
              session.status,
  
            paymentStatus:
              session.payment_status,
          },
        );
  
        return jsonResponse(
          {
            error:
              "La sesión de pago no puede cancelarse en este momento.",
          },
  
          409,
        );
      }
  
      // ========================================================
      // EXPIRE STRIPE CHECKOUT
      //
      // Muy importante:
      //
      // Primero cerramos Stripe.
      // Después liberamos Supabase.
      //
      // Nunca al revés.
      // ========================================================
  
      try {
        await stripe.checkout
          .sessions.expire(
            stripeSessionId,
          );
      } catch (
        expireError
      ) {
        console.warn(
          "[ATB Shop] Cancel checkout: Stripe no pudo expirar la sesión. Verificando nuevamente...",
          {
            reservationId,
  
            stripeSessionId,
  
            expireError,
          },
        );
  
        /*
          Puede existir una carrera:
  
          1. consultamos status=open
          2. el usuario paga
          3. intentamos expire()
          4. Stripe lo rechaza
  
          Por eso volvemos a consultar antes de decidir.
        */
  
        try {
          const latestSession =
            await stripe.checkout
              .sessions.retrieve(
                stripeSessionId,
              );
  
          // ====================================================
          // PAYMENT WON THE RACE
          // ====================================================
  
          if (
            latestSession
              .payment_status ===
              "paid" ||
            latestSession
              .payment_status ===
              "no_payment_required" ||
            latestSession.status ===
              "complete"
          ) {
            return jsonResponse(
              {
                success:
                  false,
  
                released:
                  false,
  
                paid:
                  latestSession
                    .payment_status ===
                    "paid",
  
                pending:
                  latestSession.status ===
                    "complete" &&
                  latestSession
                    .payment_status !==
                    "paid",
  
                error:
                  "La sesión de pago ya fue completada.",
              },
  
              409,
            );
          }
  
          // ====================================================
          // EXPIRED IN THE MEANTIME
          // ====================================================
  
          if (
            latestSession.status ===
            "expired"
          ) {
            const result =
              await releaseReservation(
                reservationId,
                "expired",
              );
  
            return jsonResponse(
              {
                success:
                  true,
  
                released:
                  result.released ??
                  true,
  
                reservationId,
  
                status:
                  "expired",
              },
  
              200,
            );
          }
  
          // ====================================================
          // STILL OPEN
          // ====================================================
  
          return jsonResponse(
            {
              error:
                "No fue posible cancelar la sesión de pago.",
            },
  
            502,
          );
        } catch (
          verificationError
        ) {
          console.error(
            "[ATB Shop] Cancel checkout: error verificando Stripe después de expire():",
            {
              reservationId,
  
              stripeSessionId,
  
              verificationError,
            },
          );
  
          return jsonResponse(
            {
              error:
                "No fue posible verificar la cancelación.",
            },
  
            502,
          );
        }
      }
  
      // ========================================================
      // RELEASE INVENTORY
      //
      // Stripe ya está cerrado.
      // Ahora sí podemos devolver reserved_stock.
      // ========================================================
  
      try {
        const releaseResult =
          await releaseReservation(
            reservationId,
            "released",
          );
  
        console.log(
          "[ATB Shop] Checkout cancelado y reserva liberada:",
          {
            reservationId,
  
            stripeSessionId,
          },
        );
  
        return jsonResponse(
          {
            success:
              true,
  
            released:
              releaseResult.released ??
              true,
  
            duplicate:
              releaseResult.duplicate ??
              false,
  
            reservationId,
  
            status:
              "released",
          },
  
          200,
        );
      } catch (
        error
      ) {
        /*
          Stripe ya quedó expirado.
  
          Si Supabase falla ahora, NO hay riesgo de que
          alguien pueda pagar esta sesión.
  
          Podemos devolver 500 para que el usuario vuelva
          a intentar y además la limpieza automática acabará
          liberando la reserva.
        */
  
        console.error(
          "[ATB Shop] Stripe fue cancelado pero Supabase no pudo liberar la reserva:",
          {
            reservationId,
  
            stripeSessionId,
  
            error,
          },
        );
  
        return jsonResponse(
          {
            error:
              "La sesión fue cancelada, pero el inventario todavía se está liberando. Intenta nuevamente en unos momentos.",
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