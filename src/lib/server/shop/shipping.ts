// ============================================================
// ATB SHOP
// SHIPPING
// ============================================================

export type ShopShippingProfile =
  | "document"
  | "small-parcel"
  | "apparel"
  | "large-parcel";

// ============================================================
// ITEM
// ============================================================

export type ShopShippingItem = {
  quantity: number;

  weightGrams: number;

  profile?:
    ShopShippingProfile;
};

// ============================================================
// COUNTRY RATE
// ============================================================

export type ShopCountryShippingRate = {
  countryCode: string;

  basePrice: number;

  pricePerKg: number;

  minimumDeliveryDays: number;

  maximumDeliveryDays: number;
};

// ============================================================
// CONFIG
// ============================================================

export type ShopShippingConfig = {
  standardPrice: number;

  freeShippingEnabled:
    boolean;

  freeShippingThreshold:
    number;

  freeShippingCountries:
    string[];

  minimumDeliveryDays:
    number;

  maximumDeliveryDays:
    number;
};

// ============================================================
// OPTION
// ============================================================

export type ShopShippingOption = {
  id:
    | "standard"
    | "free";

  name: string;

  amount: number;

  minimumDeliveryDays:
    number;

  maximumDeliveryDays:
    number;
};

// ============================================================
// QUOTE INPUT
// ============================================================

export type ShopShippingQuoteInput = {
  subtotal: number;

  destinationCountry:
    string;

  items?: ShopShippingItem[];
};

// ============================================================
// QUOTE RESULT
// ============================================================

export type ShopShippingQuote =
  | {
      available: true;

      countryCode: string;

      totalWeightGrams: number;

      shipping:
        ShopShippingOption;
    }
  | {
      available: false;

      countryCode: string;

      totalWeightGrams: number;

      reason: string;
    };

// ============================================================
// ENV HELPERS
// ============================================================

function getIntegerEnv(
  value:
    | string
    | undefined,

  fallback:
    number,
): number {
  if (!value) {
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

  return parsed;
}

function getOptionalIntegerEnv(
  value:
    | string
    | undefined,
):
  | number
  | null {
  if (!value) {
    return null;
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
    return null;
  }

  return parsed;
}

function getBooleanEnv(
  value:
    | string
    | undefined,

  fallback:
    boolean,
): boolean {
  if (!value) {
    return fallback;
  }

  const normalized =
    value
      .trim()
      .toLowerCase();

  if (
    normalized ===
      "true" ||
    normalized ===
      "1" ||
    normalized ===
      "yes"
  ) {
    return true;
  }

  if (
    normalized ===
      "false" ||
    normalized ===
      "0" ||
    normalized ===
      "no"
  ) {
    return false;
  }

  return fallback;
}

function getCountryListEnv(
  value:
    | string
    | undefined,

  fallback:
    string[],
): string[] {
  if (!value) {
    return fallback;
  }

  const countries =
    value
      .split(",")
      .map(
        (
          country,
        ) =>
          normalizeCountryCode(
            country,
          ),
      )
      .filter(Boolean);

  return countries.length >
    0
    ? countries
    : fallback;
}

// ============================================================
// COUNTRY
// ============================================================

function normalizeCountryCode(
  country:
    string,
): string {
  return country
    .trim()
    .toUpperCase();
}

// ============================================================
// WEIGHT
// ============================================================

function calculateTotalWeight(
  items:
    ShopShippingItem[] =
      [],
): number {
  return items.reduce(
    (
      total,
      item,
    ) => {
      const quantity =
        Math.max(
          0,
          Math.floor(
            item.quantity,
          ),
        );

      const weight =
        Math.max(
          0,
          item.weightGrams,
        );

      return (
        total +
        quantity *
          weight
      );
    },
    0,
  );
}

// ============================================================
// CONFIG
// ============================================================

export function getShopShippingConfig():
  ShopShippingConfig {
  const standardPrice =
    Math.max(
      0,

      getIntegerEnv(
        import.meta.env
          .SHOP_SHIPPING_STANDARD_CENTS,

        14900,
      ),
    );

  const freeShippingThreshold =
    Math.max(
      0,

      getIntegerEnv(
        import.meta.env
          .SHOP_FREE_SHIPPING_THRESHOLD_CENTS,

        120000,
      ),
    );

  const minimumDeliveryDays =
    Math.max(
      1,

      getIntegerEnv(
        import.meta.env
          .SHOP_SHIPPING_MIN_DAYS,

        3,
      ),
    );

  const configuredMaximumDays =
    Math.max(
      1,

      getIntegerEnv(
        import.meta.env
          .SHOP_SHIPPING_MAX_DAYS,

        7,
      ),
    );

  const maximumDeliveryDays =
    Math.max(
      minimumDeliveryDays,
      configuredMaximumDays,
    );

  return {
    standardPrice,

    freeShippingEnabled:
      getBooleanEnv(
        import.meta.env
          .SHOP_FREE_SHIPPING_ENABLED,

        true,
      ),

    freeShippingThreshold,

    freeShippingCountries:
      getCountryListEnv(
        import.meta.env
          .SHOP_FREE_SHIPPING_COUNTRIES,

        ["MX"],
      ),

    minimumDeliveryDays,

    maximumDeliveryDays,
  };
}

// ============================================================
// COUNTRY SHIPPING RATE
// ============================================================

function getCountryShippingRate(
  countryCode:
    string,
):
  | ShopCountryShippingRate
  | null {
  const normalized =
    normalizeCountryCode(
      countryCode,
    );

  const config =
    getShopShippingConfig();

  // ==========================================================
  // MEXICO
  //
  // Conservamos exactamente la configuración actual.
  // ==========================================================

  if (
    normalized ===
    "MX"
  ) {
    const perKg =
      Math.max(
        0,

        getIntegerEnv(
          import.meta.env
            .SHOP_SHIPPING_MX_PER_KG_CENTS,

          0,
        ),
      );

    return {
      countryCode:
        "MX",

      basePrice:
        config.standardPrice,

      pricePerKg:
        perKg,

      minimumDeliveryDays:
        config.minimumDeliveryDays,

      maximumDeliveryDays:
        config.maximumDeliveryDays,
    };
  }

  // ==========================================================
  // UNITED STATES
  // ==========================================================

  if (
    normalized ===
    "US"
  ) {
    return getInternationalRate({
      countryCode:
        "US",

      basePrice:
        getOptionalIntegerEnv(
          import.meta.env
            .SHOP_SHIPPING_US_BASE_CENTS,
        ),

      pricePerKg:
        getOptionalIntegerEnv(
          import.meta.env
            .SHOP_SHIPPING_US_PER_KG_CENTS,
        ),

      minimumDeliveryDays:
        getOptionalIntegerEnv(
          import.meta.env
            .SHOP_SHIPPING_US_MIN_DAYS,
        ),

      maximumDeliveryDays:
        getOptionalIntegerEnv(
          import.meta.env
            .SHOP_SHIPPING_US_MAX_DAYS,
        ),
    });
  }

  // ==========================================================
  // CANADA
  // ==========================================================

  if (
    normalized ===
    "CA"
  ) {
    return getInternationalRate({
      countryCode:
        "CA",

      basePrice:
        getOptionalIntegerEnv(
          import.meta.env
            .SHOP_SHIPPING_CA_BASE_CENTS,
        ),

      pricePerKg:
        getOptionalIntegerEnv(
          import.meta.env
            .SHOP_SHIPPING_CA_PER_KG_CENTS,
        ),

      minimumDeliveryDays:
        getOptionalIntegerEnv(
          import.meta.env
            .SHOP_SHIPPING_CA_MIN_DAYS,
        ),

      maximumDeliveryDays:
        getOptionalIntegerEnv(
          import.meta.env
            .SHOP_SHIPPING_CA_MAX_DAYS,
        ),
    });
  }

  // ==========================================================
  // SPAIN
  // ==========================================================

  if (
    normalized ===
    "ES"
  ) {
    return getInternationalRate({
      countryCode:
        "ES",

      basePrice:
        getOptionalIntegerEnv(
          import.meta.env
            .SHOP_SHIPPING_ES_BASE_CENTS,
        ),

      pricePerKg:
        getOptionalIntegerEnv(
          import.meta.env
            .SHOP_SHIPPING_ES_PER_KG_CENTS,
        ),

      minimumDeliveryDays:
        getOptionalIntegerEnv(
          import.meta.env
            .SHOP_SHIPPING_ES_MIN_DAYS,
        ),

      maximumDeliveryDays:
        getOptionalIntegerEnv(
          import.meta.env
            .SHOP_SHIPPING_ES_MAX_DAYS,
        ),
    });
  }

  return null;
}

// ============================================================
// INTERNATIONAL RATE
// ============================================================

function getInternationalRate({
  countryCode,

  basePrice,

  pricePerKg,

  minimumDeliveryDays,

  maximumDeliveryDays,
}: {
  countryCode:
    string;

  basePrice:
    | number
    | null;

  pricePerKg:
    | number
    | null;

  minimumDeliveryDays:
    | number
    | null;

  maximumDeliveryDays:
    | number
    | null;
}):
  | ShopCountryShippingRate
  | null {
  /*
    El país sólo se considera habilitado si
    existe al menos una tarifa base.

    Esto evita inventar precios internacionales.
  */

  if (
    basePrice ===
    null
  ) {
    return null;
  }

  const minDays =
    Math.max(
      1,
      minimumDeliveryDays ??
        5,
    );

  const maxDays =
    Math.max(
      minDays,
      maximumDeliveryDays ??
        12,
    );

  return {
    countryCode,

    basePrice:
      Math.max(
        0,
        basePrice,
      ),

    pricePerKg:
      Math.max(
        0,
        pricePerKg ??
          0,
      ),

    minimumDeliveryDays:
      minDays,

    maximumDeliveryDays:
      maxDays,
  };
}

// ============================================================
// SHIPPING AMOUNT
// ============================================================

function calculateShippingAmount(
  rate:
    ShopCountryShippingRate,

  totalWeightGrams:
    number,
): number {
  /*
    La tarifa funciona así:

    base
    +
    precio por cada kg iniciado.

    Ejemplo:

    peso = 1,300 g
    kilos cobrables = 2
  */

  const billableKg =
    totalWeightGrams >
    0
      ? Math.ceil(
          totalWeightGrams /
            1000,
        )
      : 0;

  return Math.max(
    0,

    rate.basePrice +
      rate.pricePerKg *
        billableKg,
  );
}

// ============================================================
// FREE SHIPPING
// ============================================================

function qualifiesForFreeShipping({
  subtotal,

  countryCode,
}: {
  subtotal:
    number;

  countryCode:
    string;
}): boolean {
  const config =
    getShopShippingConfig();

  if (
    !config.freeShippingEnabled
  ) {
    return false;
  }

  if (
    config.freeShippingThreshold <=
    0
  ) {
    return false;
  }

  const normalizedCountry =
    normalizeCountryCode(
      countryCode,
    );

  const allowedCountry =
    config.freeShippingCountries.includes(
      normalizedCountry,
    );

  if (
    !allowedCountry
  ) {
    return false;
  }

  return (
    Math.max(
      0,
      subtotal,
    ) >=
    config.freeShippingThreshold
  );
}

// ============================================================
// RESOLVE SHIPPING QUOTE
// ============================================================

export function resolveShopShippingQuote(
  input:
    ShopShippingQuoteInput,
): ShopShippingQuote {
  const countryCode =
    normalizeCountryCode(
      input.destinationCountry,
    );

  const subtotal =
    Math.max(
      0,
      input.subtotal,
    );

  const totalWeightGrams =
    calculateTotalWeight(
      input.items,
    );

  const rate =
    getCountryShippingRate(
      countryCode,
    );

  // ==========================================================
  // COUNTRY NOT CONFIGURED
  // ==========================================================

  if (
    !rate
  ) {
    return {
      available:
        false,

      countryCode,

      totalWeightGrams,

      reason:
        "El envío todavía no está disponible para este país.",
    };
  }

  // ==========================================================
  // FREE SHIPPING
  // ==========================================================

  if (
    qualifiesForFreeShipping({
      subtotal,
      countryCode,
    })
  ) {
    return {
      available:
        true,

      countryCode,

      totalWeightGrams,

      shipping: {
        id:
          "free",

        name:
          "Envío gratuito",

        amount:
          0,

        minimumDeliveryDays:
          rate.minimumDeliveryDays,

        maximumDeliveryDays:
          rate.maximumDeliveryDays,
      },
    };
  }

  // ==========================================================
  // STANDARD SHIPPING
  // ==========================================================

  const amount =
    calculateShippingAmount(
      rate,
      totalWeightGrams,
    );

  return {
    available:
      true,

    countryCode,

    totalWeightGrams,

    shipping: {
      id:
        "standard",

      name:
        countryCode ===
        "MX"
          ? "Envío nacional"
          : "Envío internacional",

      amount,

      minimumDeliveryDays:
        rate.minimumDeliveryDays,

      maximumDeliveryDays:
        rate.maximumDeliveryDays,
    },
  };
}

// ============================================================
// LEGACY RESOLVER
//
// Se mantiene para no romper checkout.ts.
//
// Actualmente equivale a:
// envío dentro de México, sin información de peso.
//
// Cuando actualicemos checkout.ts utilizaremos directamente
// resolveShopShippingQuote().
// ============================================================

export function resolveShopShipping(
  subtotal:
    number,
): ShopShippingOption {
  const quote =
    resolveShopShippingQuote({
      subtotal,

      destinationCountry:
        "MX",

      items:
        [],
    });

  /*
    México siempre tiene una tarifa
    por defecto, por lo que este caso
    sólo existe como protección.
  */

  if (
    !quote.available
  ) {
    const config =
      getShopShippingConfig();

    return {
      id:
        "standard",

      name:
        "Envío nacional",

      amount:
        config.standardPrice,

      minimumDeliveryDays:
        config.minimumDeliveryDays,

      maximumDeliveryDays:
        config.maximumDeliveryDays,
    };
  }

  return quote.shipping;
}