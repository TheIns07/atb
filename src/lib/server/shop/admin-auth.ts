import {
    createClient,
    type User,
  } from "@supabase/supabase-js";
  
  // ============================================================
  // ATB SHOP
  // ADMIN AUTHORIZATION
  //
  // Este archivo:
  // - sólo debe importarse desde código server-side
  // - valida el JWT real de Supabase
  // - verifica que el correo esté autorizado
  // - nunca confía en un email enviado por el navegador
  // ============================================================
  
  // ============================================================
  // ENVIRONMENT
  // ============================================================
  
  const supabaseUrl =
    import.meta.env
      .SUPABASE_URL;
  
  const supabaseServiceRoleKey =
    import.meta.env
      .SUPABASE_SERVICE_ROLE_KEY;
  
  const configuredAdminEmails =
    import.meta.env
      .SHOP_ADMIN_EMAILS;
  
  // ============================================================
  // SUPABASE SERVER CLIENT
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
  
  export type ShopAdminUser = {
    id:
      string;
  
    email:
      string;
  };
  
  export type ShopAdminAuthSuccess = {
    ok:
      true;
  
    admin:
      ShopAdminUser;
  
    user:
      User;
  };
  
  export type ShopAdminAuthFailure = {
    ok:
      false;
  
    status:
      401 | 403 | 500;
  
    error:
      string;
  };
  
  export type ShopAdminAuthResult =
    | ShopAdminAuthSuccess
    | ShopAdminAuthFailure;
  
  // ============================================================
  // EMAIL NORMALIZATION
  // ============================================================
  
  function normalizeEmail(
    value:
      string,
  ): string {
    return value
      .trim()
      .toLowerCase();
  }
  
  // ============================================================
  // ADMIN ALLOWLIST
  //
  // .env:
  //
  // SHOP_ADMIN_EMAILS=correo@gmail.com,otro@gmail.com
  // ============================================================
  
  function getAdminEmails():
    Set<string> {
    if (
      !configuredAdminEmails
    ) {
      return new Set();
    }
  
    return new Set(
      configuredAdminEmails
        .split(
          ",",
        )
        .map(
          normalizeEmail,
        )
        .filter(
          Boolean,
        ),
    );
  }
  
  // ============================================================
  // GET BEARER TOKEN
  // ============================================================
  
  function getBearerToken(
    request:
      Request,
  ): string | null {
    const authorization =
      request.headers.get(
        "authorization",
      );
  
    if (
      !authorization
    ) {
      return null;
    }
  
    const match =
      authorization.match(
        /^Bearer\s+(.+)$/i,
      );
  
    if (
      !match
    ) {
      return null;
    }
  
    const token =
      match[1]
        ?.trim();
  
    if (
      !token
    ) {
      return null;
    }
  
    /*
      Un access token real será mucho mayor que esto.
  
      También ponemos un máximo razonable para evitar
      procesar headers absurdamente grandes.
    */
  
    if (
      token.length <
        20 ||
      token.length >
        10000
    ) {
      return null;
    }
  
    return token;
  }
  
  // ============================================================
  // IS ADMIN EMAIL
  // ============================================================
  
  export function isShopAdminEmail(
    email:
      string,
  ): boolean {
    const allowed =
      getAdminEmails();
  
    return allowed.has(
      normalizeEmail(
        email,
      ),
    );
  }
  
  // ============================================================
  // AUTHENTICATE ADMIN
  //
  // Uso:
  //
  // const auth = await authenticateShopAdmin(request);
  //
  // if (!auth.ok) {
  //   return new Response(..., {
  //     status: auth.status
  //   });
  // }
  //
  // auth.admin.id
  // auth.admin.email
  // ============================================================
  
  export async function authenticateShopAdmin(
    request:
      Request,
  ): Promise<ShopAdminAuthResult> {
    // ==========================================================
    // SERVER CONFIG
    // ==========================================================
  
    if (
      !supabase
    ) {
      console.error(
        "[ATB Admin] Supabase no está configurado.",
      );
  
      return {
        ok:
          false,
  
        status:
          500,
  
        error:
          "El administrador no está configurado correctamente.",
      };
    }
  
    // ==========================================================
    // ADMIN ALLOWLIST CONFIG
    // ==========================================================
  
    const allowedEmails =
      getAdminEmails();
  
    if (
      allowedEmails.size ===
      0
    ) {
      console.error(
        "[ATB Admin] SHOP_ADMIN_EMAILS no contiene administradores.",
      );
  
      return {
        ok:
          false,
  
        status:
          500,
  
        error:
          "El administrador no está configurado correctamente.",
      };
    }
  
    // ==========================================================
    // ACCESS TOKEN
    // ==========================================================
  
    const accessToken =
      getBearerToken(
        request,
      );
  
    if (
      !accessToken
    ) {
      return {
        ok:
          false,
  
        status:
          401,
  
        error:
          "Debes iniciar sesión para continuar.",
      };
    }
  
    // ==========================================================
    // VALIDATE USER WITH SUPABASE
    //
    // MUY IMPORTANTE:
    //
    // No decodificamos simplemente el JWT y confiamos en él.
    //
    // getUser(accessToken) pide a Supabase Auth verificar
    // realmente la sesión y nos devuelve el usuario autenticado.
    // ==========================================================
  
    let user:
      User;
  
    try {
      const {
        data,
        error,
      } =
        await supabase.auth
          .getUser(
            accessToken,
          );
  
      if (
        error ||
        !data.user
      ) {
        console.warn(
          "[ATB Admin] Sesión inválida:",
          error?.message ??
            "Usuario no encontrado.",
        );
  
        return {
          ok:
            false,
  
          status:
            401,
  
          error:
            "Tu sesión no es válida o ha expirado.",
        };
      }
  
      user =
        data.user;
    } catch (
      error
    ) {
      console.error(
        "[ATB Admin] Error verificando sesión:",
        error,
      );
  
      return {
        ok:
          false,
  
        status:
          500,
  
        error:
          "No fue posible verificar la sesión.",
      };
    }
  
    // ==========================================================
    // USER ID
    // ==========================================================
  
    const userId =
      user.id
        ?.trim();
  
    if (
      !userId
    ) {
      console.error(
        "[ATB Admin] Usuario autenticado sin ID.",
      );
  
      return {
        ok:
          false,
  
        status:
          401,
  
        error:
          "La sesión no contiene un usuario válido.",
      };
    }
  
    // ==========================================================
    // EMAIL
    // ==========================================================
  
    const rawEmail =
      user.email;
  
    if (
      !rawEmail
    ) {
      console.warn(
        "[ATB Admin] Usuario autenticado sin correo:",
        userId,
      );
  
      return {
        ok:
          false,
  
        status:
          403,
  
        error:
          "Esta cuenta no puede acceder al administrador.",
      };
    }
  
    const email =
      normalizeEmail(
        rawEmail,
      );
  
    // ==========================================================
    // ALLOWLIST
    //
    // Ser usuario de Supabase NO significa ser administrador.
    //
    // Únicamente los emails definidos explícitamente en:
    //
    // SHOP_ADMIN_EMAILS
    //
    // pueden entrar.
    // ==========================================================
  
    if (
      !allowedEmails.has(
        email,
      )
    ) {
      console.warn(
        "[ATB Admin] Acceso rechazado:",
        {
          userId,
  
          email,
        },
      );
  
      return {
        ok:
          false,
  
        status:
          403,
  
        error:
          "Tu cuenta no tiene permisos de administrador.",
      };
    }
  
    // ==========================================================
    // SUCCESS
    // ==========================================================
  
    return {
      ok:
        true,
  
      admin: {
        id:
          userId,
  
        email,
      },
  
      user,
    };
  }
  
  // ============================================================
  // AUTH ERROR RESPONSE
  //
  // Helper para no repetir lo mismo en cada endpoint.
  //
  // Uso:
  //
  // const auth = await authenticateShopAdmin(request);
  //
  // if (!auth.ok) {
  //   return createAdminAuthErrorResponse(auth);
  // }
  // ============================================================
  
  export function createAdminAuthErrorResponse(
    result:
      ShopAdminAuthFailure,
  ): Response {
    return new Response(
      JSON.stringify({
        error:
          result.error,
      }),
      {
        status:
          result.status,
  
        headers: {
          "Content-Type":
            "application/json",
  
          "Cache-Control":
            "no-store",
        },
      },
    );
  }