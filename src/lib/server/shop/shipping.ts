// ============================================================
// ATB SHOP
// SHIPPING CONFIGURATION
// ============================================================

export type ShopShippingConfig = {
    standardPrice:
      number;
  
    freeShippingEnabled:
      boolean;
  
    freeShippingThreshold:
      number;
  
    minimumDeliveryDays:
      number;
  
    maximumDeliveryDays:
      number;
  };
  
  export type ShopShippingOption = {
    id:
      | "standard"
      | "free";
  
    name:
      string;
  
    amount:
      number;
  
    minimumDeliveryDays:
      number;
  
    maximumDeliveryDays:
      number;
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
  
      minimumDeliveryDays,
  
      maximumDeliveryDays,
    };
  }
  
  // ============================================================
  // RESOLVE SHIPPING
  // ============================================================
  
  export function resolveShopShipping(
    subtotal:
      number,
  ): ShopShippingOption {
    const config =
      getShopShippingConfig();
  
    const normalizedSubtotal =
      Math.max(
        0,
        subtotal,
      );
  
    const hasFreeShipping =
      config.freeShippingEnabled &&
      config.freeShippingThreshold >
        0 &&
      normalizedSubtotal >=
        config.freeShippingThreshold;
  
    if (
      hasFreeShipping
    ) {
      return {
        id:
          "free",
  
        name:
          "Envío estándar gratuito",
  
        amount:
          0,
  
        minimumDeliveryDays:
          config.minimumDeliveryDays,
  
        maximumDeliveryDays:
          config.maximumDeliveryDays,
      };
    }
  
    return {
      id:
        "standard",
  
      name:
        "Envío estándar",
  
      amount:
        config.standardPrice,
  
      minimumDeliveryDays:
        config.minimumDeliveryDays,
  
      maximumDeliveryDays:
        config.maximumDeliveryDays,
    };
  }