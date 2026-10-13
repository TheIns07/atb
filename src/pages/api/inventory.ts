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
  
  type InventoryRow = {
    sku: string;
  
    stock: number;
  
    reserved_stock: number;
  
    available_stock: number;
  
    active: boolean;
  
    updated_at:
      | string
      | null;
  };
  
  type PublicInventoryItem = {
    sku: string;
  
    /*
      IMPORTANTE:
  
      Para mantener compatibilidad con:
  
      - Product page
      - /tienda
      - ShopPreview
      - CartDrawer
  
      "stock" representa ahora el stock COMPRABLE.
  
      Es decir:
  
      available_stock =
        physical stock - reserved stock
    */
  
    stock: number;
  
    availableStock: number;
  
    active: boolean;
  
    available: boolean;
  
    updatedAt:
      | string
      | null;
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
  
          /*
            El inventario cambia con:
  
            - reservas
            - pagos
            - expiraciones
            - liberaciones
  
            Nunca debemos servir una copia antigua.
          */
          "Cache-Control":
            "no-store, no-cache, must-revalidate",
  
          Pragma:
            "no-cache",
  
          Expires:
            "0",
        },
      },
    );
  }
  
  // ============================================================
  // SKU VALIDATION
  // ============================================================
  
  function isValidSku(
    value: string,
  ): boolean {
    return /^[A-Z0-9-]+$/.test(
      value,
    );
  }
  
  // ============================================================
  // NORMALIZE SKU LIST
  // ============================================================
  
  function normalizeSkus(
    values: string[],
  ):
    | string[]
    | null {
    const unique =
      new Set<string>();
  
    for (
      const rawValue
      of values
    ) {
      /*
        Permitimos:
  
        ?sku=SKU1&sku=SKU2
  
        y también:
  
        ?skus=SKU1,SKU2,SKU3
      */
  
      const splitValues =
        rawValue.split(
          ",",
        );
  
      for (
        const splitValue
        of splitValues
      ) {
        const sku =
          splitValue
            .trim()
            .toUpperCase();
  
        if (!sku) {
          continue;
        }
  
        if (
          sku.length >
          100
        ) {
          return null;
        }
  
        if (
          !isValidSku(
            sku,
          )
        ) {
          return null;
        }
  
        unique.add(
          sku,
        );
      }
    }
  
    const skus =
      Array.from(
        unique,
      );
  
    /*
      Protección frente a consultas enormes.
    */
  
    if (
      skus.length >
      100
    ) {
      return null;
    }
  
    return skus;
  }
  
  // ============================================================
  // PUBLIC INVENTORY TRANSFORM
  // ============================================================
  
  function toPublicInventoryItem(
    row:
      InventoryRow,
  ): PublicInventoryItem {
    /*
      Nunca permitimos números negativos
      aunque la DB ya tenga constraints.
    */
  
    const availableStock =
      Math.max(
        0,
        row.available_stock,
      );
  
    return {
      sku:
        row.sku,
  
      /*
        Los componentes existentes consultan:
  
        inventory.stock
  
        Por eso lo mantenemos, pero ahora representa
        stock REALMENTE DISPONIBLE PARA COMPRA.
      */
  
      stock:
        availableStock,
  
      availableStock,
  
      active:
        row.active,
  
      available:
        row.active &&
        availableStock >
          0,
  
      updatedAt:
        row.updated_at,
    };
  }
  
  // ============================================================
  // RELEASE EXPIRED RESERVATIONS
  // ============================================================
  
  async function cleanupExpiredReservations(): Promise<void> {
    if (!supabase) {
      return;
    }
  
    try {
      const {
        data,
        error,
      } =
        await supabase.rpc(
          "release_expired_shop_reservations",
        );
  
      if (error) {
        /*
          No detenemos toda la consulta de inventario.
  
          Stripe también envía checkout.session.expired,
          así que esta función es una capa adicional
          de limpieza.
        */
  
        console.error(
          "[ATB Shop] Inventory API: no se pudieron limpiar reservas expiradas:",
          {
            message:
              error.message,
  
            details:
              error.details,
  
            hint:
              error.hint,
          },
        );
  
        return;
      }
  
      /*
        Solamente dejamos log si realmente
        se liberó algo.
      */
  
      const result =
        data as
          | {
              success?: boolean;
  
              released_count?: number;
            }
          | null;
  
      if (
        result?.released_count &&
        result.released_count >
          0
      ) {
        console.log(
          "[ATB Shop] Reservas expiradas liberadas:",
          result.released_count,
        );
      }
    } catch (
      error
    ) {
      console.error(
        "[ATB Shop] Inventory API: error limpiando reservas expiradas:",
        error,
      );
    }
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
          "[ATB Shop] Inventory API: faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.",
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
      // CLEAN EXPIRED RESERVATIONS
      //
      // Esto evita que una reserva abandonada pueda dejar
      // stock bloqueado indefinidamente si el webhook de Stripe
      // se retrasa o no llega.
      // ========================================================
  
      await cleanupExpiredReservations();
  
      // ========================================================
      // QUERY PARAMETERS
      // ========================================================
  
      const requestedValues = [
        ...url.searchParams.getAll(
          "sku",
        ),
  
        ...url.searchParams.getAll(
          "skus",
        ),
      ];
  
      const requestedSkus =
        normalizeSkus(
          requestedValues,
        );
  
      if (
        requestedSkus ===
        null
      ) {
        return jsonResponse(
          {
            error:
              "La lista de SKUs es inválida.",
          },
  
          400,
        );
      }
  
      // ========================================================
      // INVENTORY QUERY
      //
      // stock:
      //   unidades físicas
      //
      // reserved_stock:
      //   unidades temporalmente bloqueadas
      //
      // available_stock:
      //   stock - reserved_stock
      // ========================================================
  
      let query =
        supabase
          .from(
            "shop_inventory",
          )
          .select(
            `
              sku,
              stock,
              reserved_stock,
              available_stock,
              active,
              updated_at
            `,
          );
  
      // ========================================================
      // OPTIONAL SKU FILTER
      // ========================================================
  
      if (
        requestedSkus.length >
        0
      ) {
        query =
          query.in(
            "sku",
            requestedSkus,
          );
      }
  
      // ========================================================
      // EXECUTE
      // ========================================================
  
      const {
        data,
        error,
      } =
        await query.order(
          "sku",
          {
            ascending:
              true,
          },
        );
  
      // ========================================================
      // DATABASE ERROR
      // ========================================================
  
      if (error) {
        console.error(
          "[ATB Shop] Inventory API error:",
          {
            code:
              error.code,
  
            message:
              error.message,
  
            details:
              error.details,
  
            hint:
              error.hint,
          },
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
      // RAW ROWS
      // ========================================================
  
      const rows =
        (
          data ??
          []
        ) as
          InventoryRow[];
  
      // ========================================================
      // PUBLIC INVENTORY
      //
      // IMPORTANTE:
      //
      // No exponemos reserved_stock como el stock principal.
      //
      // La interfaz únicamente necesita saber:
      //
      // "¿Cuántas unidades puedo comprar AHORA?"
      // ========================================================
  
      const inventory =
        rows.map(
          toPublicInventoryItem,
        );
  
      // ========================================================
      // MAP
      // ========================================================
  
      const inventoryBySku =
        Object.fromEntries(
          inventory.map(
            (
              item,
            ) => [
              item.sku,
  
              {
                /*
                  Todos nuestros componentes actuales
                  utilizan item.stock.
  
                  Ahora equivale a available_stock.
                */
  
                stock:
                  item.stock,
  
                availableStock:
                  item.availableStock,
  
                active:
                  item.active,
  
                available:
                  item.available,
  
                updatedAt:
                  item.updatedAt,
              },
            ],
          ),
        );
  
      // ========================================================
      // MISSING SKUS
      // ========================================================
  
      const returnedSkus =
        new Set(
          inventory.map(
            (
              item,
            ) =>
              item.sku,
          ),
        );
  
      const missingSkus =
        requestedSkus.filter(
          (
            sku,
          ) =>
            !returnedSkus.has(
              sku,
            ),
        );
  
      // ========================================================
      // RESPONSE
      // ========================================================
  
      return jsonResponse(
        {
          inventory,
  
          inventoryBySku,
  
          missingSkus,
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
      /*
        Este endpoint es exclusivamente de lectura.
  
        Cambios de inventario solamente ocurren mediante:
  
        - reserva de Checkout;
        - webhook de Stripe;
        - liberación de reserva;
        - administración futura.
      */
  
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