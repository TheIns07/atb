// ============================================================
// ATB SHOP
// INTERNAL ORDER EMAIL NOTIFICATIONS
//
// Este archivo únicamente:
// - recibe los datos de una compra ya confirmada
// - envía un correo al propietario de ATB
//
// NO:
// - modifica inventario
// - confirma pagos
// - actualiza pedidos
// - envía correos al cliente
// ============================================================

// ============================================================
// RESEND
// ============================================================

const RESEND_API_URL =
  "https://api.resend.com/emails";

// ============================================================
// ENVIRONMENT
// ============================================================

const resendApiKey =
  import.meta.env
    .RESEND_API_KEY;

const emailEnabled =
  (
    import.meta.env
      .SHOP_EMAIL_ENABLED ??
    "true"
  )
    .trim()
    .toLowerCase() !==
  "false";

const fromEmail =
  import.meta.env
    .SHOP_FROM_EMAIL;

const ownerEmail =
  import.meta.env
    .SHOP_OWNER_EMAIL;

// ============================================================
// TYPES
// ============================================================

export type OrderNotificationItem = {
  sku:
    string;

  name:
    string;

  variant?:
    | string
    | null;

  quantity:
    number;

  unitAmount:
    number;

  lineTotal:
    number;
};

export type OrderNotificationAddress = {
  name?:
    | string
    | null;

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

  postalCode?:
    | string
    | null;

  country?:
    | string
    | null;
};

export type NewOrderNotificationInput = {
  orderId:
    string;

  reference:
    string;

  stripeSessionId:
    string;

  paymentIntentId?:
    | string
    | null;

  customerName?:
    | string
    | null;

  customerEmail?:
    | string
    | null;

  customerPhone?:
    | string
    | null;

  currency:
    string;

  amountSubtotal:
    number;

  amountShipping:
    number;

  amountTotal:
    number;

  shippingMethodName?:
    | string
    | null;

  shippingAddress?:
    | OrderNotificationAddress
    | null;

  items:
    OrderNotificationItem[];
};

export type SendEmailResult = {
  success:
    boolean;

  skipped?:
    boolean;

  emailId?:
    string;

  error?:
    string;
};

type ResendSuccessResponse = {
  id?:
    string;
};

type ResendErrorResponse = {
  message?:
    string;

  name?:
    string;

  statusCode?:
    number;
};

// ============================================================
// HTML ESCAPE
// ============================================================

function escapeHtml(
  value:
    unknown,
): string {
  return String(
    value ??
      "",
  )
    .replace(
      /&/g,
      "&amp;",
    )
    .replace(
      /</g,
      "&lt;",
    )
    .replace(
      />/g,
      "&gt;",
    )
    .replace(
      /"/g,
      "&quot;",
    )
    .replace(
      /'/g,
      "&#039;",
    );
}

// ============================================================
// MONEY
// ============================================================

function formatMoney(
  amount:
    number,

  currency:
    string,
): string {
  const normalizedCurrency =
    (
      currency ||
      "MXN"
    ).toUpperCase();

  try {
    return new Intl.NumberFormat(
      "es-MX",
      {
        style:
          "currency",

        currency:
          normalizedCurrency,

        minimumFractionDigits:
          2,

        maximumFractionDigits:
          2,
      },
    ).format(
      amount /
        100,
    );
  } catch {
    return `$${(
      amount /
      100
    ).toFixed(
      2,
    )}`;
  }
}

// ============================================================
// EMAIL VALIDATION
// ============================================================

function isValidEmail(
  value:
    string,
): boolean {
  const normalized =
    value.trim();

  return (
    normalized.length >
      3 &&
    normalized.length <=
      320 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      normalized,
    )
  );
}

// ============================================================
// ADDRESS LINES
// ============================================================

function buildAddressLines(
  address:
    | OrderNotificationAddress
    | null
    | undefined,
): string[] {
  if (!address) {
    return [];
  }

  const lines:
    string[] =
    [];

  if (
    address.name
  ) {
    lines.push(
      address.name,
    );
  }

  if (
    address.line1
  ) {
    lines.push(
      address.line1,
    );
  }

  if (
    address.line2
  ) {
    lines.push(
      address.line2,
    );
  }

  const cityAndState =
    [
      address.city,
      address.state,
    ]
      .filter(
        Boolean,
      )
      .join(
        ", ",
      );

  const localityLine =
    [
      cityAndState ||
        null,
      address.postalCode,
    ]
      .filter(
        Boolean,
      )
      .join(
        " ",
      );

  if (
    localityLine
  ) {
    lines.push(
      localityLine,
    );
  }

  if (
    address.country
  ) {
    lines.push(
      address.country,
    );
  }

  return lines;
}

// ============================================================
// CONFIG VALIDATION
// ============================================================

function validateEmailConfiguration():
  string | null {
  if (
    !resendApiKey
  ) {
    return "Falta RESEND_API_KEY.";
  }

  if (
    !fromEmail
  ) {
    return "Falta SHOP_FROM_EMAIL.";
  }

  if (
    !ownerEmail
  ) {
    return "Falta SHOP_OWNER_EMAIL.";
  }

  if (
    !isValidEmail(
      ownerEmail,
    )
  ) {
    return "SHOP_OWNER_EMAIL no contiene un correo válido.";
  }

  return null;
}

// ============================================================
// ITEMS HTML
// ============================================================

function buildItemsHtml(
  input:
    NewOrderNotificationInput,
): string {
  return input.items
    .map(
      (
        item,
      ) => {
        const variant =
          item.variant
            ? `
              <div
                style="
                  margin-top: 4px;
                  color: #777777;
                  font-size: 12px;
                  line-height: 1.5;
                "
              >
                ${escapeHtml(
                  item.variant,
                )}
              </div>
            `
            : "";

        return `
          <tr>
            <td
              style="
                padding: 16px 0;
                border-bottom: 1px solid #e8e8e8;
                vertical-align: top;
              "
            >
              <div
                style="
                  color: #111111;
                  font-size: 14px;
                  font-weight: 600;
                  line-height: 1.45;
                "
              >
                ${escapeHtml(
                  item.name,
                )}
              </div>

              ${variant}

              <div
                style="
                  margin-top: 6px;
                  color: #999999;
                  font-family: monospace;
                  font-size: 11px;
                  line-height: 1.5;
                "
              >
                SKU:
                ${escapeHtml(
                  item.sku,
                )}
              </div>

              <div
                style="
                  margin-top: 3px;
                  color: #777777;
                  font-size: 12px;
                "
              >
                Cantidad:
                ${escapeHtml(
                  item.quantity,
                )}
              </div>
            </td>

            <td
              align="right"
              style="
                padding: 16px 0;
                border-bottom: 1px solid #e8e8e8;
                vertical-align: top;
                white-space: nowrap;
                color: #222222;
                font-size: 13px;
              "
            >
              ${escapeHtml(
                formatMoney(
                  item.lineTotal,
                  input.currency,
                ),
              )}
            </td>
          </tr>
        `;
      },
    )
    .join(
      "",
    );
}

// ============================================================
// HTML EMAIL
// ============================================================

function buildNewOrderHtml(
  input:
    NewOrderNotificationInput,
): string {
  const itemsHtml =
    buildItemsHtml(
      input,
    );

  const addressLines =
    buildAddressLines(
      input.shippingAddress,
    );

  const customerName =
    input.customerName ??
    input.shippingAddress
      ?.name ??
    "Sin nombre";

  const customerEmail =
    input.customerEmail ??
    "Sin correo";

  const customerPhone =
    input.customerPhone ??
    "Sin teléfono";

  const shippingMethod =
    input.shippingMethodName ??
    "Envío estándar";

  const addressHtml =
    addressLines.length >
      0
      ? addressLines
          .map(
            (
              line,
            ) =>
              escapeHtml(
                line,
              ),
          )
          .join(
            "<br>",
          )
      : "Sin dirección registrada";

  return `
    <!doctype html>

    <html>
      <body
        style="
          margin: 0;
          padding: 0;
          background: #f3f3f3;
          color: #111111;
          font-family: Arial, Helvetica, sans-serif;
        "
      >
        <table
          width="100%"
          cellpadding="0"
          cellspacing="0"
          role="presentation"
          style="
            background: #f3f3f3;
          "
        >
          <tr>
            <td
              align="center"
              style="
                padding: 40px 16px;
              "
            >
              <table
                width="100%"
                cellpadding="0"
                cellspacing="0"
                role="presentation"
                style="
                  max-width: 680px;
                  background: #ffffff;
                "
              >
                <tr>
                  <td
                    style="
                      padding: 42px 40px;
                    "
                  >
                    <!-- ======================================
                         HEADER
                    ======================================= -->

                    <div
                      style="
                        color: #888888;
                        font-size: 10px;
                        letter-spacing: 0.14em;
                      "
                    >
                      ATB SHOP
                    </div>

                    <h1
                      style="
                        margin: 20px 0 0;
                        color: #111111;
                        font-size: 34px;
                        font-weight: 400;
                        line-height: 1.05;
                        letter-spacing: -0.04em;
                      "
                    >
                      Nueva compra.
                    </h1>

                    <p
                      style="
                        margin: 16px 0 0;
                        color: #666666;
                        font-size: 14px;
                        line-height: 1.6;
                      "
                    >
                      Stripe confirmó el pago y el pedido quedó
                      registrado en ATB Shop.
                    </p>

                    <!-- ======================================
                         ORDER REFERENCE
                    ======================================= -->

                    <div
                      style="
                        margin-top: 30px;
                        padding: 18px 0;
                        border-top: 1px solid #e5e5e5;
                        border-bottom: 1px solid #e5e5e5;
                      "
                    >
                      <div
                        style="
                          color: #999999;
                          font-size: 10px;
                          letter-spacing: 0.1em;
                          text-transform: uppercase;
                        "
                      >
                        Pedido
                      </div>

                      <div
                        style="
                          margin-top: 6px;
                          color: #111111;
                          font-family: monospace;
                          font-size: 15px;
                        "
                      >
                        #${escapeHtml(
                          input.reference,
                        )}
                      </div>
                    </div>

                    <!-- ======================================
                         CUSTOMER
                    ======================================= -->

                    <div
                      style="
                        margin-top: 30px;
                      "
                    >
                      <div
                        style="
                          margin-bottom: 12px;
                          color: #999999;
                          font-size: 10px;
                          letter-spacing: 0.1em;
                          text-transform: uppercase;
                        "
                      >
                        Cliente
                      </div>

                      <div
                        style="
                          color: #222222;
                          font-size: 14px;
                          line-height: 1.75;
                        "
                      >
                        <strong>
                          ${escapeHtml(
                            customerName,
                          )}
                        </strong>

                        <br>

                        ${escapeHtml(
                          customerEmail,
                        )}

                        <br>

                        ${escapeHtml(
                          customerPhone,
                        )}
                      </div>
                    </div>

                    <!-- ======================================
                         PRODUCTS
                    ======================================= -->

                    <div
                      style="
                        margin-top: 32px;
                      "
                    >
                      <div
                        style="
                          margin-bottom: 4px;
                          color: #999999;
                          font-size: 10px;
                          letter-spacing: 0.1em;
                          text-transform: uppercase;
                        "
                      >
                        Productos
                      </div>

                      <table
                        width="100%"
                        cellpadding="0"
                        cellspacing="0"
                        role="presentation"
                      >
                        ${itemsHtml}
                      </table>
                    </div>

                    <!-- ======================================
                         TOTALS
                    ======================================= -->

                    <table
                      width="100%"
                      cellpadding="0"
                      cellspacing="0"
                      role="presentation"
                      style="
                        margin-top: 26px;
                      "
                    >
                      <tr>
                        <td
                          style="
                            padding: 6px 0;
                            color: #777777;
                            font-size: 13px;
                          "
                        >
                          Subtotal
                        </td>

                        <td
                          align="right"
                          style="
                            padding: 6px 0;
                            color: #333333;
                            font-size: 13px;
                          "
                        >
                          ${escapeHtml(
                            formatMoney(
                              input.amountSubtotal,
                              input.currency,
                            ),
                          )}
                        </td>
                      </tr>

                      <tr>
                        <td
                          style="
                            padding: 6px 0;
                            color: #777777;
                            font-size: 13px;
                          "
                        >
                          ${escapeHtml(
                            shippingMethod,
                          )}
                        </td>

                        <td
                          align="right"
                          style="
                            padding: 6px 0;
                            color: #333333;
                            font-size: 13px;
                          "
                        >
                          ${
                            input.amountShipping ===
                              0
                              ? "Gratis"
                              : escapeHtml(
                                  formatMoney(
                                    input.amountShipping,
                                    input.currency,
                                  ),
                                )
                          }
                        </td>
                      </tr>

                      <tr>
                        <td
                          style="
                            padding: 16px 0 0;
                            border-top: 1px solid #dddddd;
                            color: #111111;
                            font-size: 15px;
                            font-weight: 600;
                          "
                        >
                          Total
                        </td>

                        <td
                          align="right"
                          style="
                            padding: 16px 0 0;
                            border-top: 1px solid #dddddd;
                            color: #111111;
                            font-size: 15px;
                            font-weight: 600;
                          "
                        >
                          ${escapeHtml(
                            formatMoney(
                              input.amountTotal,
                              input.currency,
                            ),
                          )}
                        </td>
                      </tr>
                    </table>

                    <!-- ======================================
                         DELIVERY
                    ======================================= -->

                    <div
                      style="
                        margin-top: 32px;
                        padding-top: 26px;
                        border-top: 1px solid #e5e5e5;
                      "
                    >
                      <div
                        style="
                          margin-bottom: 10px;
                          color: #999999;
                          font-size: 10px;
                          letter-spacing: 0.1em;
                          text-transform: uppercase;
                        "
                      >
                        Entrega
                      </div>

                      <div
                        style="
                          color: #444444;
                          font-size: 13px;
                          line-height: 1.7;
                        "
                      >
                        ${addressHtml}
                      </div>
                    </div>

                    <!-- ======================================
                         PAYMENT REFERENCES
                    ======================================= -->

                    <div
                      style="
                        margin-top: 32px;
                        padding-top: 26px;
                        border-top: 1px solid #e5e5e5;
                      "
                    >
                      <div
                        style="
                          margin-bottom: 10px;
                          color: #999999;
                          font-size: 10px;
                          letter-spacing: 0.1em;
                          text-transform: uppercase;
                        "
                      >
                        Stripe
                      </div>

                      <div
                        style="
                          color: #777777;
                          font-family: monospace;
                          font-size: 11px;
                          line-height: 1.7;
                          word-break: break-all;
                        "
                      >
                        Session:
                        ${escapeHtml(
                          input.stripeSessionId,
                        )}

                        ${
                          input.paymentIntentId
                            ? `
                              <br>

                              Payment Intent:
                              ${escapeHtml(
                                input.paymentIntentId,
                              )}
                            `
                            : ""
                        }
                      </div>
                    </div>

                    <!-- ======================================
                         FOOTER
                    ======================================= -->

                    <p
                      style="
                        margin: 36px 0 0;
                        color: #aaaaaa;
                        font-size: 11px;
                        line-height: 1.6;
                      "
                    >
                      Este correo es una notificación interna
                      automática de ATB Shop.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;
}

// ============================================================
// TEXT EMAIL
// ============================================================

function buildNewOrderText(
  input:
    NewOrderNotificationInput,
): string {
  const addressLines =
    buildAddressLines(
      input.shippingAddress,
    );

  const lines:
    string[] =
    [
      "ATB SHOP",
      "",
      "NUEVA COMPRA",
      "",
      `Pedido: #${input.reference}`,
      "",
      "CLIENTE",
      `Nombre: ${
        input.customerName ??
        input.shippingAddress
          ?.name ??
        "Sin nombre"
      }`,
      `Correo: ${
        input.customerEmail ??
        "Sin correo"
      }`,
      `Teléfono: ${
        input.customerPhone ??
        "Sin teléfono"
      }`,
      "",
      "PRODUCTOS",
    ];

  for (
    const item
    of input.items
  ) {
    lines.push(
      "",
      item.name,
    );

    if (
      item.variant
    ) {
      lines.push(
        `Variante: ${item.variant}`,
      );
    }

    lines.push(
      `SKU: ${item.sku}`,
      `Cantidad: ${item.quantity}`,
      `Importe: ${formatMoney(
        item.lineTotal,
        input.currency,
      )}`,
    );
  }

  lines.push(
    "",
    "TOTALES",
    `Subtotal: ${formatMoney(
      input.amountSubtotal,
      input.currency,
    )}`,
    `Envío: ${
      input.amountShipping ===
      0
        ? "Gratis"
        : formatMoney(
            input.amountShipping,
            input.currency,
          )
    }`,
    `Total: ${formatMoney(
      input.amountTotal,
      input.currency,
    )}`,
    "",
    "ENTREGA",
  );

  if (
    addressLines.length >
    0
  ) {
    lines.push(
      ...addressLines,
    );
  } else {
    lines.push(
      "Sin dirección registrada",
    );
  }

  lines.push(
    "",
    "STRIPE",
    `Session: ${input.stripeSessionId}`,
  );

  if (
    input.paymentIntentId
  ) {
    lines.push(
      `Payment Intent: ${input.paymentIntentId}`,
    );
  }

  return lines.join(
    "\n",
  );
}

// ============================================================
// SEND THROUGH RESEND
// ============================================================

async function sendResendEmail(
  options: {
    subject:
      string;

    html:
      string;

    text:
      string;

    idempotencyKey:
      string;
  },
): Promise<SendEmailResult> {
  // ========================================================
  // DISABLED
  // ========================================================

  if (
    !emailEnabled
  ) {
    console.log(
      "[ATB Shop] Email interno deshabilitado:",
      options.subject,
    );

    return {
      success:
        true,

      skipped:
        true,
    };
  }

  // ========================================================
  // CONFIG
  // ========================================================

  const configError =
    validateEmailConfiguration();

  if (
    configError
  ) {
    console.error(
      "[ATB Shop] Configuración de email:",
      configError,
    );

    return {
      success:
        false,

      error:
        configError,
    };
  }

  /*
    TypeScript ya sabe que validateEmailConfiguration()
    pasó correctamente en runtime, pero las variables de
    entorno continúan tipadas como string | undefined.

    Por eso normalizamos explícitamente aquí.
  */

  const apiKey =
    String(
      resendApiKey,
    );

  const sender =
    String(
      fromEmail,
    );

  const recipient =
    String(
      ownerEmail,
    );

  // ========================================================
  // REQUEST
  // ========================================================

  try {
    const response =
      await fetch(
        RESEND_API_URL,
        {
          method:
            "POST",

          headers: {
            Authorization:
              `Bearer ${apiKey}`,

            "Content-Type":
              "application/json",

            /*
              Si Stripe procesa dos veces el mismo evento,
              el mismo pedido utiliza la misma clave.
            */

            "Idempotency-Key":
              options.idempotencyKey,
          },

          body:
            JSON.stringify({
              from:
                sender,

              to: [
                recipient,
              ],

              subject:
                options.subject,

              html:
                options.html,

              text:
                options.text,
            }),
        },
      );

    // ======================================================
    // RESEND ERROR
    // ======================================================

    if (
      !response.ok
    ) {
      let errorData:
        ResendErrorResponse =
        {};

      try {
        errorData =
          (await response.json()) as
            ResendErrorResponse;
      } catch {
        // Respuesta sin JSON válido.
      }

      const message =
        errorData.message ??
        `Resend respondió HTTP ${response.status}.`;

      console.error(
        "[ATB Shop] Resend rechazó la notificación:",
        {
          status:
            response.status,

          message,
        },
      );

      return {
        success:
          false,

        error:
          message,
      };
    }

    // ======================================================
    // SUCCESS
    // ======================================================

    const data =
      (await response.json()) as
        ResendSuccessResponse;

    if (
      !data.id
    ) {
      return {
        success:
          false,

        error:
          "Resend no devolvió un identificador de correo.",
      };
    }

    console.log(
      "[ATB Shop] Notificación interna enviada:",
      {
        emailId:
          data.id,

        orderNotification:
          options.idempotencyKey,
      },
    );

    return {
      success:
        true,

      emailId:
        data.id,
    };
  } catch (
    error
  ) {
    console.error(
      "[ATB Shop] Error enviando notificación interna:",
      error,
    );

    return {
      success:
        false,

      error:
        error instanceof
          Error
          ? error.message
          : "Error desconocido enviando correo.",
    };
  }
}

// ============================================================
// NEW ORDER NOTIFICATION
// ============================================================

export async function sendNewOrderNotificationEmail(
  input:
    NewOrderNotificationInput,
): Promise<SendEmailResult> {
  if (
    !input.orderId
  ) {
    return {
      success:
        false,

      error:
        "Falta orderId.",
    };
  }

  if (
    !input.reference
  ) {
    return {
      success:
        false,

      error:
        "Falta la referencia del pedido.",
    };
  }

  if (
    !input.stripeSessionId
  ) {
    return {
      success:
        false,

      error:
        "Falta stripeSessionId.",
    };
  }

  if (
    !Array.isArray(
      input.items,
    ) ||
    input.items.length ===
      0
  ) {
    return {
      success:
        false,

      error:
        "El pedido no contiene productos.",
    };
  }

  const html =
    buildNewOrderHtml(
      input,
    );

  const text =
    buildNewOrderText(
      input,
    );

  return sendResendEmail({
    subject:
      `Nueva compra ATB #${input.reference} — ${formatMoney(
        input.amountTotal,
        input.currency,
      )}`,

    html,

    text,

    /*
      Cada pedido tiene una clave estable.

      Si Stripe vuelve a entregar el webhook,
      evitamos enviar la misma notificación varias veces.
    */

    idempotencyKey:
      `atb-new-order/${input.orderId}`,
  });
}