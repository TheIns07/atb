import {
    getVariantBySku,
    type Product,
    type ProductVariant,
  } from "../../data/products";
  
  // ============================================================
  // CONFIG
  // ============================================================
  
  const CART_STORAGE_KEY =
    "atb-shop-cart";
  
  export const CART_CHANGE_EVENT =
    "atb:cart-change";
  
  // ============================================================
  // TYPES
  // ============================================================
  
  export type CartItem = {
    sku: string;
    quantity: number;
  };
  
  export type CartState = {
    items: CartItem[];
  };
  
  export type ResolvedCartItem = {
    sku: string;
  
    quantity: number;
  
    product: Product;
  
    variant: ProductVariant;
  
    lineTotal: number | null;
  };
  
  // ============================================================
  // DEFAULT STATE
  // ============================================================
  
  const EMPTY_CART: CartState = {
    items: [],
  };
  
  // ============================================================
  // BROWSER CHECK
  // ============================================================
  
  function canUseStorage(): boolean {
    return (
      typeof window !== "undefined" &&
      typeof window.localStorage !==
        "undefined"
    );
  }
  
  // ============================================================
  // VALIDATION
  // ============================================================
  
  function normalizeQuantity(
    quantity: number,
  ): number {
    if (
      !Number.isFinite(quantity)
    ) {
      return 1;
    }
  
    return Math.max(
      1,
      Math.floor(quantity),
    );
  }
  
  function normalizeCartItem(
    value: unknown,
  ): CartItem | null {
    if (
      typeof value !== "object" ||
      value === null
    ) {
      return null;
    }
  
    const candidate =
      value as Partial<CartItem>;
  
    if (
      typeof candidate.sku !==
        "string" ||
      candidate.sku.trim() === ""
    ) {
      return null;
    }
  
    if (
      typeof candidate.quantity !==
        "number"
    ) {
      return null;
    }
  
    return {
      sku: candidate.sku,
      quantity:
        normalizeQuantity(
          candidate.quantity,
        ),
    };
  }
  
  // ============================================================
  // READ
  // ============================================================
  
  export function getCart(): CartState {
    if (!canUseStorage()) {
      return {
        ...EMPTY_CART,
        items: [],
      };
    }
  
    try {
      const raw =
        window.localStorage.getItem(
          CART_STORAGE_KEY,
        );
  
      if (!raw) {
        return {
          items: [],
        };
      }
  
      const parsed: unknown =
        JSON.parse(raw);
  
      if (
        typeof parsed !== "object" ||
        parsed === null
      ) {
        return {
          items: [],
        };
      }
  
      const candidate =
        parsed as Partial<CartState>;
  
      if (
        !Array.isArray(
          candidate.items,
        )
      ) {
        return {
          items: [],
        };
      }
  
      const items =
        candidate.items
          .map(
            normalizeCartItem,
          )
          .filter(
            (
              item,
            ): item is CartItem =>
              item !== null,
          );
  
      return {
        items,
      };
    } catch {
      return {
        items: [],
      };
    }
  }
  
  // ============================================================
  // WRITE
  // ============================================================
  
  function saveCart(
    cart: CartState,
  ): CartState {
    if (!canUseStorage()) {
      return cart;
    }
  
    window.localStorage.setItem(
      CART_STORAGE_KEY,
      JSON.stringify(cart),
    );
  
    notifyCartChange(cart);
  
    return cart;
  }
  
  // ============================================================
  // EVENT
  // ============================================================
  
  function notifyCartChange(
    cart: CartState,
  ): void {
    if (
      typeof window === "undefined"
    ) {
      return;
    }
  
    window.dispatchEvent(
      new CustomEvent<CartState>(
        CART_CHANGE_EVENT,
        {
          detail: cart,
        },
      ),
    );
  }
  
  // ============================================================
  // QUANTITY LIMIT
  // ============================================================
  
  function getMaximumQuantity(
    sku: string,
  ): number | null {
    const result =
      getVariantBySku(sku);
  
    if (!result) {
      return null;
    }
  
    const {
      variant,
    } = result;
  
    if (
      !variant.active ||
      variant.stock <= 0
    ) {
      return 0;
    }
  
    return variant.stock;
  }
  
  // ============================================================
  // ADD
  // ============================================================
  
  export function addToCart(
    sku: string,
    quantity = 1,
  ): CartState {
    const catalogItem =
      getVariantBySku(sku);
  
    if (!catalogItem) {
      console.warn(
        `[ATB Shop] SKU no encontrado: ${sku}`,
      );
  
      return getCart();
    }
  
    if (
      !catalogItem.variant.active
    ) {
      console.warn(
        `[ATB Shop] Variante inactiva: ${sku}`,
      );
  
      return getCart();
    }
  
    if (
      catalogItem.variant.stock <= 0
    ) {
      console.warn(
        `[ATB Shop] Sin stock: ${sku}`,
      );
  
      return getCart();
    }
  
    const cart =
      getCart();
  
    const requestedQuantity =
      normalizeQuantity(quantity);
  
    const maximumQuantity =
      getMaximumQuantity(sku);
  
    if (
      maximumQuantity === null ||
      maximumQuantity <= 0
    ) {
      return cart;
    }
  
    const existing =
      cart.items.find(
        (item) =>
          item.sku === sku,
      );
  
    if (existing) {
      existing.quantity =
        Math.min(
          existing.quantity +
            requestedQuantity,
          maximumQuantity,
        );
  
      return saveCart({
        items: [
          ...cart.items,
        ],
      });
    }
  
    cart.items.push({
      sku,
      quantity:
        Math.min(
          requestedQuantity,
          maximumQuantity,
        ),
    });
  
    return saveCart({
      items: [
        ...cart.items,
      ],
    });
  }
  
  // ============================================================
  // UPDATE QUANTITY
  // ============================================================
  
  export function updateCartQuantity(
    sku: string,
    quantity: number,
  ): CartState {
    if (quantity <= 0) {
      return removeFromCart(sku);
    }
  
    const cart =
      getCart();
  
    const item =
      cart.items.find(
        (candidate) =>
          candidate.sku === sku,
      );
  
    if (!item) {
      return cart;
    }
  
    const maximumQuantity =
      getMaximumQuantity(sku);
  
    if (
      maximumQuantity === null ||
      maximumQuantity <= 0
    ) {
      return removeFromCart(sku);
    }
  
    item.quantity =
      Math.min(
        normalizeQuantity(quantity),
        maximumQuantity,
      );
  
    return saveCart({
      items: [
        ...cart.items,
      ],
    });
  }
  
  // ============================================================
  // REMOVE
  // ============================================================
  
  export function removeFromCart(
    sku: string,
  ): CartState {
    const cart =
      getCart();
  
    return saveCart({
      items:
        cart.items.filter(
          (item) =>
            item.sku !== sku,
        ),
    });
  }
  
  // ============================================================
  // CLEAR
  // ============================================================
  
  export function clearCart(): CartState {
    return saveCart({
      items: [],
    });
  }
  
  // ============================================================
  // ITEM COUNT
  // ============================================================
  
  export function getCartCount(): number {
    const cart =
      getCart();
  
    return cart.items.reduce(
      (
        total,
        item,
      ) =>
        total +
        item.quantity,
  
      0,
    );
  }
  
  // ============================================================
  // RESOLVE CART
  // ============================================================
  
  export function resolveCartItems():
    ResolvedCartItem[] {
    const cart =
      getCart();
  
    const resolved:
      ResolvedCartItem[] = [];
  
    cart.items.forEach(
      (item) => {
        const result =
          getVariantBySku(
            item.sku,
          );
  
        if (!result) {
          return;
        }
  
        const {
          product,
          variant,
        } = result;
  
        resolved.push({
          sku: item.sku,
  
          quantity:
            item.quantity,
  
          product,
  
          variant,
  
          lineTotal:
            variant.price === null
              ? null
              : variant.price *
                item.quantity,
        });
      },
    );
  
    return resolved;
  }
  
  // ============================================================
  // CART TOTAL
  // ============================================================
  
  export function getCartTotal():
    number | null {
    const items =
      resolveCartItems();
  
    if (
      items.length === 0
    ) {
      return 0;
    }
  
    if (
      items.some(
        (item) =>
          item.lineTotal === null,
      )
    ) {
      return null;
    }
  
    return items.reduce(
      (
        total,
        item,
      ) =>
        total +
        (item.lineTotal ?? 0),
  
      0,
    );
  }
  
  // ============================================================
  // AVAILABILITY CLEANUP
  // ============================================================
  
  /**
   * Limpia artículos que ya no existen,
   * están desactivados o ya no tienen stock.
   *
   * También limita cantidades si el stock
   * disponible disminuyó.
   */
  export function sanitizeCart():
    CartState {
    const cart =
      getCart();
  
    const sanitized:
      CartItem[] = [];
  
    cart.items.forEach(
      (item) => {
        const result =
          getVariantBySku(
            item.sku,
          );
  
        if (!result) {
          return;
        }
  
        const {
          variant,
        } = result;
  
        if (
          !variant.active ||
          variant.stock <= 0
        ) {
          return;
        }
  
        sanitized.push({
          sku: item.sku,
  
          quantity:
            Math.min(
              item.quantity,
              variant.stock,
            ),
        });
      },
    );
  
    return saveCart({
      items: sanitized,
    });
  }
  
  // ============================================================
  // SUBSCRIBE
  // ============================================================
  
  /**
   * Permite que Navbar, CartDrawer y demás
   * componentes reaccionen cuando cambie
   * el carrito.
   *
   * Retorna una función para cancelar
   * la suscripción.
   */
  export function subscribeToCart(
    callback: (
      cart: CartState,
    ) => void,
  ): () => void {
    if (
      typeof window === "undefined"
    ) {
      return () => {};
    }
  
    const handler = (
      event: Event,
    ): void => {
      const customEvent =
        event as CustomEvent<CartState>;
  
      callback(
        customEvent.detail ??
          getCart(),
      );
    };
  
    window.addEventListener(
      CART_CHANGE_EVENT,
      handler,
    );
  
    return () => {
      window.removeEventListener(
        CART_CHANGE_EVENT,
        handler,
      );
    };
  }