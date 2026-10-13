// ============================================================
// ATB SHOP
// Catálogo central
//
// IMPORTANTE:
// Los precios están expresados en CENTAVOS.
//
// 100     = $1 MXN
// 1000    = $10 MXN
// 45000   = $450 MXN
// 65000   = $650 MXN
// 85000   = $850 MXN
// ============================================================

// ============================================================
// TYPES
// ============================================================

export type ProductCategory =
  | "shirt"
  | "documentary-prop"
  | "documentary-script";

export type ProductStatus =
  | "coming-soon"
  | "available"
  | "sold-out";

export type InventoryMode =
  | "variants"
  | "single-item";

// ============================================================
// COLOR
// ============================================================

export type ProductColor = {
  id: string;

  name: string;

  hex: string;
};

// ============================================================
// VARIANT
// ============================================================

export type ProductVariant = {
  sku: string;

  colorId?: string;

  size?: string;

  /**
   * Precio expresado en centavos.
   *
   * Ejemplo:
   *
   * 45000 = $450 MXN
   *
   * null = precio aún no definido.
   */
  price: number | null;

  /**
   * Inventario disponible.
   */
  stock: number;

  /**
   * Permite desactivar una variante
   * sin eliminarla del catálogo.
   */
  active: boolean;

  /**
   * Opcional.
   *
   * Más adelante podríamos utilizar
   * Stripe Price IDs persistentes.
   *
   * Actualmente checkout.ts utiliza
   * price_data directamente.
   */
  stripePriceId?: string;
};

// ============================================================
// DOCUMENTARY INFORMATION
// ============================================================

export type DocumentaryInfo = {
  documentary:
    | "vaporwave"
    | "signalwave"
    | "psicodelia-90s";

  /**
   * El objeto fue utilizado físicamente
   * durante la producción.
   */
  usedInProduction?: boolean;

  /**
   * Sólo existe una unidad física.
   */
  uniquePiece?: boolean;
};

// ============================================================
// PRODUCT
// ============================================================

export type Product = {
  id: string;

  slug: string;

  name: string;

  subtitle?: string;

  collection?: string;

  category: ProductCategory;

  description: string;

  story?: string;

  thumbnail: string;

  images: string[];

  colors?: ProductColor[];

  sizes?: string[];

  variants: ProductVariant[];

  inventoryMode: InventoryMode;

  documentaryInfo?: DocumentaryInfo;

  status: ProductStatus;

  /**
   * Mostrar en ShopPreview.
   */
  featured: boolean;

  /**
   * Mostrar públicamente.
   */
  active: boolean;

  /**
   * Orden dentro de la tienda.
   */
  order: number;
};

// ============================================================
// PRICES
// ============================================================

/**
 * PRODUCTO TEMPORAL DE PRUEBA
 *
 * 100 = $1 MXN
 *
 * NOTA:
 * Stripe no permitirá completar un cargo de
 * $1 MXN porque su mínimo para MXN es mayor.
 *
 * Para probar Stripe Checkout realmente:
 *
 * const TEST_PRICE = 1000;
 *
 * Eso equivale a $10 MXN.
 */
const TEST_PRICE =
  1000;

const CASSETTE_PRICE =
  45000;

const SCRIPT_PRICE =
  65000;

const CAMCORDER_PRICE =
  85000;

// ============================================================
// SHIRT SIZES
// ============================================================

export const STANDARD_SHIRT_SIZES = [
  "S",
  "M",
  "L",
  "XL",
];

// ============================================================
// HELPERS
// ============================================================

type ShirtVariantOptions = {
  productCode: string;

  colors: ProductColor[];

  sizes: string[];

  price?: number | null;

  stockPerVariant?: number;
};

// ============================================================
// CREATE SHIRT VARIANTS
// ============================================================

function createShirtVariants({
  productCode,
  colors,
  sizes,
  price = null,
  stockPerVariant = 0,
}: ShirtVariantOptions): ProductVariant[] {
  return colors.flatMap(
    (color) =>
      sizes.map(
        (size): ProductVariant => ({
          sku:
            `${productCode}-` +
            `${color.id.toUpperCase()}-` +
            `${size}`,

          colorId:
            color.id,

          size,

          price,

          stock:
            stockPerVariant,

          active:
            true,
        }),
      ),
  );
}

// ============================================================
// CREATE UNIQUE VARIANT
// ============================================================

function createUniqueVariant(
  sku: string,

  price:
    | number
    | null,
): ProductVariant {
  return {
    sku,

    price,

    stock: 1,

    active: true,
  };
}

// ============================================================
// SHIRT 01 COLORS
// ============================================================

const shirtOneColors:
  ProductColor[] = [
  {
    id: "petroleo",

    name: "Petróleo",

    hex: "#173B40",
  },

  {
    id: "arena",

    name: "Arena",

    hex: "#E7DDC8",
  },

  {
    id: "arcilla",

    name: "Arcilla",

    hex: "#8B5942",
  },
];

// ============================================================
// SHIRT 02 COLORS
// ============================================================

const shirtTwoColors:
  ProductColor[] = [
  {
    id: "arena",

    name: "Arena",

    hex: "#DFCFAD",
  },

  {
    id: "carbon",

    name: "Carbón",

    hex: "#282725",
  },

  {
    id: "arcilla",

    name: "Arcilla",

    hex: "#985943",
  },
];

// ============================================================
// PRODUCTS
// ============================================================

export const products:
  Product[] = [

  // ==========================================================
  // 01
  // CAMISA 01
  //
  // PRODUCTO TEMPORAL DE PRUEBA
  // $1 MXN
  // ==========================================================

  {
    id:
      "shirt-01",

    slug:
      "camisa-01",

    name:
      "Camisa 01",

    subtitle:
      "ATB Collection",

    collection:
      "ATB Shop",

    category:
      "shirt",

    description:
      "Primera pieza de la colección de ropa de ATB.",

    story:
      "Una pieza desarrollada como parte de la primera colección física de ATB. Actualmente se encuentra habilitada con un precio temporal para probar el flujo de la tienda.",

    thumbnail:
      "/images/shop/shirt-01/cover.webp",

    images: [
      "/images/shop/shirt-01/front.webp",

      "/images/shop/shirt-01/back.webp",

      "/images/shop/shirt-01/detail.webp",
    ],

    colors:
      shirtOneColors,

    sizes:
      STANDARD_SHIRT_SIZES,

    variants:
      createShirtVariants({
        productCode:
          "ATB-SHIRT01",

        colors:
          shirtOneColors,

        sizes:
          STANDARD_SHIRT_SIZES,

        // $1 MXN
        price:
          TEST_PRICE,

        // Stock temporal para pruebas.
        stockPerVariant:
          3,
      }),

    inventoryMode:
      "variants",

    status:
      "available",

    featured:
      true,

    active:
      true,

    order:
      1,
  },

  // ==========================================================
  // 02
  // CAMISA 02
  //
  // PRECIO PENDIENTE
  // ==========================================================

  {
    id:
      "shirt-02",

    slug:
      "camisa-02",

    name:
      "Camisa 02",

    subtitle:
      "ATB Collection",

    collection:
      "ATB Shop",

    category:
      "shirt",

    description:
      "Segunda pieza de la colección de ropa de ATB.",

    story:
      "Segunda pieza desarrollada para la colección física de ATB. El precio definitivo se incorporará posteriormente.",

    thumbnail:
      "/images/shop/shirt-02/cover.webp",

    images: [
      "/images/shop/shirt-02/front.webp",

      "/images/shop/shirt-02/back.webp",

      "/images/shop/shirt-02/detail.webp",
    ],

    colors:
      shirtTwoColors,

    sizes:
      STANDARD_SHIRT_SIZES,

    variants:
      createShirtVariants({
        productCode:
          "ATB-SHIRT02",

        colors:
          shirtTwoColors,

        sizes:
          STANDARD_SHIRT_SIZES,

        price:
          null,

        stockPerVariant:
          0,
      }),

    inventoryMode:
      "variants",

    status:
      "coming-soon",

    featured:
      true,

    active:
      true,

    order:
      2,
  },

  // ==========================================================
  // 03
  // CASSETTE DOCUMENTAL 01
  //
  // $450 MXN
  // ==========================================================

  {
    id:
      "vaporwave-cassette-01",

    slug:
      "cassette-documental-vaporwave-01",

    name:
      "Cassette — Documental 01",

    subtitle:
      "Objeto utilizado en producción",

    collection:
      "Archivo ATB",

    category:
      "documentary-prop",

    description:
      "Cassette utilizado físicamente durante la producción del documental de vaporwave.",

    story:
      "Pieza original utilizada durante la realización del documental. Se conserva como objeto físico vinculado directamente a la producción audiovisual de ATB.",

    thumbnail:
      "/images/shop/cassette-01/cover.webp",

    images: [
      "/images/shop/cassette-01/front.webp",

      "/images/shop/cassette-01/back.webp",

      "/images/shop/cassette-01/detail.webp",
    ],

    variants: [
      createUniqueVariant(
        "ATB-VAPOR-CASSETTE-01",

        CASSETTE_PRICE,
      ),
    ],

    inventoryMode:
      "single-item",

    documentaryInfo: {
      documentary:
        "vaporwave",

      usedInProduction:
        true,

      uniquePiece:
        true,
    },

    status:
      "available",

    featured:
      true,

    active:
      true,

    order:
      3,
  },

  // ==========================================================
  // 04
  // CASSETTE DOCUMENTAL 02
  //
  // $450 MXN
  // ==========================================================

  {
    id:
      "vaporwave-cassette-02",

    slug:
      "cassette-documental-vaporwave-02",

    name:
      "Cassette — Documental 02",

    subtitle:
      "Objeto utilizado en producción",

    collection:
      "Archivo ATB",

    category:
      "documentary-prop",

    description:
      "Segundo cassette utilizado físicamente durante la producción del documental de vaporwave.",

    story:
      "Una pieza individual procedente de la producción del documental de vaporwave de ATB. No se trata de una reproducción comercial del objeto utilizado durante la filmación.",

    thumbnail:
      "/images/shop/cassette-02/cover.webp",

    images: [
      "/images/shop/cassette-02/front.webp",

      "/images/shop/cassette-02/back.webp",

      "/images/shop/cassette-02/detail.webp",
    ],

    variants: [
      createUniqueVariant(
        "ATB-VAPOR-CASSETTE-02",

        CASSETTE_PRICE,
      ),
    ],

    inventoryMode:
      "single-item",

    documentaryInfo: {
      documentary:
        "vaporwave",

      usedInProduction:
        true,

      uniquePiece:
        true,
    },

    status:
      "available",

    featured:
      false,

    active:
      true,

    order:
      4,
  },

  // ==========================================================
  // 05
  // GUIÓN VAPORWAVE
  //
  // $650 MXN
  // ==========================================================

  {
    id:
      "script-vaporwave",

    slug:
      "guion-documental-vaporwave",

    name:
      "Guión oficial — Vaporwave",

    subtitle:
      "Original con anotaciones",

    collection:
      "Archivo ATB",

    category:
      "documentary-script",

    description:
      "Guión físico oficial utilizado durante la producción del documental sobre vaporwave, conservando sus anotaciones.",

    story:
      "Documento de producción asociado directamente a la realización de La historia no contada del vaporwave. Incluye las marcas, notas y anotaciones realizadas durante el proceso creativo y de producción.",

    thumbnail:
      "/images/shop/script-vaporwave/cover.webp",

    images: [
      "/images/shop/script-vaporwave/cover.webp",

      "/images/shop/script-vaporwave/pages.webp",

      "/images/shop/script-vaporwave/detail.webp",
    ],

    variants: [
      createUniqueVariant(
        "ATB-SCRIPT-VAPORWAVE",

        SCRIPT_PRICE,
      ),
    ],

    inventoryMode:
      "single-item",

    documentaryInfo: {
      documentary:
        "vaporwave",

      usedInProduction:
        true,

      uniquePiece:
        true,
    },

    status:
      "available",

    featured:
      true,

    active:
      true,

    order:
      5,
  },

  // ==========================================================
  // 06
  // GUIÓN PSICODELIA ESTÉTICA DE LOS 90
  //
  // $650 MXN
  // ==========================================================

  {
    id:
      "script-psychedelia-90s",

    slug:
      "guion-psicodelia-estetica-90s",

    name:
      "Guión oficial — Psicodelia estética de los 90's",

    subtitle:
      "Original de producción",

    collection:
      "Archivo ATB",

    category:
      "documentary-script",

    description:
      "Guión oficial del documental dedicado a la psicodelia estética de los años noventa.",

    story:
      "Documento físico perteneciente al proceso de investigación y producción del documental de ATB dedicado a la psicodelia estética de los años noventa.",

    thumbnail:
      "/images/shop/script-psychedelia/cover.webp",

    images: [
      "/images/shop/script-psychedelia/cover.webp",

      "/images/shop/script-psychedelia/pages.webp",

      "/images/shop/script-psychedelia/detail.webp",
    ],

    variants: [
      createUniqueVariant(
        "ATB-SCRIPT-PSYCHEDELIA90",

        SCRIPT_PRICE,
      ),
    ],

    inventoryMode:
      "single-item",

    documentaryInfo: {
      documentary:
        "psicodelia-90s",

      usedInProduction:
        true,

      uniquePiece:
        true,
    },

    status:
      "available",

    featured:
      false,

    active:
      true,

    order:
      6,
  },

  // ==========================================================
  // 07
  // GUIÓN SIGNALWAVE
  //
  // $650 MXN
  // ==========================================================

  {
    id:
      "script-signalwave",

    slug:
      "guion-documental-signalwave",

    name:
      "Guión oficial — Signalwave",

    subtitle:
      "Original de producción",

    collection:
      "Archivo ATB",

    category:
      "documentary-script",

    description:
      "Guión oficial utilizado durante la realización del documental dedicado al signalwave.",

    story:
      "Documento perteneciente a la producción del documental de ATB sobre signalwave, conservado como parte física del proceso creativo.",

    thumbnail:
      "/images/shop/script-signalwave/cover.webp",

    images: [
      "/images/shop/script-signalwave/cover.webp",

      "/images/shop/script-signalwave/pages.webp",

      "/images/shop/script-signalwave/detail.webp",
    ],

    variants: [
      createUniqueVariant(
        "ATB-SCRIPT-SIGNALWAVE",

        SCRIPT_PRICE,
      ),
    ],

    inventoryMode:
      "single-item",

    documentaryInfo: {
      documentary:
        "signalwave",

      usedInProduction:
        true,

      uniquePiece:
        true,
    },

    status:
      "available",

    featured:
      false,

    active:
      true,

    order:
      7,
  },

  // ==========================================================
  // 08
  // VIDEOGRABADORA / CASETERA
  //
  // $850 MXN
  // ==========================================================

  {
    id:
      "documentary-camcorder",

    slug:
      "videograbadora-documental",

    name:
      "Videograbadora del documental",

    subtitle:
      "Equipo utilizado en producción",

    collection:
      "Archivo ATB",

    category:
      "documentary-prop",

    description:
      "Videograbadora utilizada durante la producción audiovisual del documental de ATB.",

    story:
      "Una pieza de equipo vinculada directamente con la producción documental de ATB. Se trata del equipo físico utilizado dentro del proceso de producción.",

    thumbnail:
      "/images/shop/camcorder/cover.webp",

    images: [
      "/images/shop/camcorder/front.webp",

      "/images/shop/camcorder/side.webp",

      "/images/shop/camcorder/detail.webp",
    ],

    variants: [
      createUniqueVariant(
        "ATB-DOC-CAMCORDER-01",

        CAMCORDER_PRICE,
      ),
    ],

    inventoryMode:
      "single-item",

    documentaryInfo: {
      documentary:
        "vaporwave",

      usedInProduction:
        true,

      uniquePiece:
        true,
    },

    status:
      "available",

    featured:
      true,

    active:
      true,

    order:
      8,
  },
];

// ============================================================
// GET ACTIVE PRODUCTS
// ============================================================

export function getActiveProducts():
  Product[] {
  return products
    .filter(
      (product) =>
        product.active,
    )
    .sort(
      (
        a,
        b,
      ) =>
        a.order -
        b.order,
    );
}

// ============================================================
// GET FEATURED PRODUCTS
// ============================================================

export function getFeaturedProducts():
  Product[] {
  return products
    .filter(
      (product) =>
        product.active &&
        product.featured,
    )
    .sort(
      (
        a,
        b,
      ) =>
        a.order -
        b.order,
    );
}

// ============================================================
// GET PRODUCT BY SLUG
// ============================================================

export function getProductBySlug(
  slug: string,
):
  | Product
  | undefined {
  return products.find(
    (product) =>
      product.active &&
      product.slug ===
        slug,
  );
}

// ============================================================
// GET VARIANT BY SKU
// ============================================================

export function getVariantBySku(
  sku: string,
):
  | {
      product: Product;
      variant: ProductVariant;
    }
  | undefined {
  for (
    const product
    of products
  ) {
    const variant =
      product.variants.find(
        (
          candidate,
        ) =>
          candidate.sku ===
          sku,
      );

    if (variant) {
      return {
        product,

        variant,
      };
    }
  }

  return undefined;
}

// ============================================================
// STARTING PRICE
// ============================================================

export function getProductStartingPrice(
  product: Product,
):
  | number
  | null {
  const prices =
    product.variants
      .filter(
        (variant) =>
          variant.active &&
          variant.price !==
            null,
      )
      .map(
        (variant) =>
          variant.price,
      )
      .filter(
        (
          price,
        ): price is number =>
          typeof price ===
          "number",
      );

  if (
    prices.length === 0
  ) {
    return null;
  }

  return Math.min(
    ...prices,
  );
}

// ============================================================
// MXN FORMATTER
// ============================================================

export function formatMXN(
  cents: number,
): string {
  return new Intl.NumberFormat(
    "es-MX",
    {
      style:
        "currency",

      currency:
        "MXN",

      maximumFractionDigits:
        0,
    },
  ).format(
    cents / 100,
  );
}