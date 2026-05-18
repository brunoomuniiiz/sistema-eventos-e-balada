// Gerenciamento de carrinho na lojinha (localStorage por slug)

const CART_KEY = (slug: string) => `lojinha:cart:${slug}`;
const TOKEN_KEY = (slug: string) => `lojinha:token:${slug}`;
const CUSTOMER_KEY = "lojinha:customer";

export type CartItem = { product_id: string; quantity: number };
export type Customer = { name: string; email: string; phone: string };

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function getCartToken(slug: string): string {
  if (typeof window === "undefined") return "";
  let t = localStorage.getItem(TOKEN_KEY(slug));
  if (!t) {
    t = uuid();
    localStorage.setItem(TOKEN_KEY(slug), t);
  }
  return t;
}

export function resetCart(slug: string) {
  if (typeof window === "undefined") return;
  localStorage.removeItem(CART_KEY(slug));
  localStorage.removeItem(TOKEN_KEY(slug));
}

export function getCart(slug: string): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(CART_KEY(slug)) || "[]");
  } catch {
    return [];
  }
}

export function setCart(slug: string, items: CartItem[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(CART_KEY(slug), JSON.stringify(items));
}

export function getCustomer(): Customer | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CUSTOMER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveCustomer(c: Customer) {
  if (typeof window === "undefined") return;
  localStorage.setItem(CUSTOMER_KEY, JSON.stringify(c));
}
