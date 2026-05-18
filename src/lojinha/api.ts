import { supabase } from "@/integrations/supabase/client";

export type StorefrontProduct = {
  id: string;
  name: string;
  description: string | null;
  photo_url: string | null;
  price: number;
  unit: string;
  category_id: string | null;
  available_qty: number;
};

export type StorefrontSettings = {
  id: string;
  user_id: string;
  enabled: boolean;
  slug: string;
  store_name: string | null;
  pickup_message: string | null;
  accent_color: string | null;
  stock_location_id: string | null;
};

export type Storefront = {
  settings: StorefrontSettings;
  products: StorefrontProduct[];
};

export async function getStorefront(slug: string): Promise<Storefront | null> {
  const { data, error } = await supabase.rpc("lojinha_get_storefront", { _slug: slug });
  if (error) throw error;
  return data as unknown as Storefront | null;
}

export async function reserveCartItem(slug: string, cartToken: string, productId: string, qty: number) {
  const { data, error } = await supabase.rpc("lojinha_reserve_cart_item", {
    _slug: slug,
    _cart_token: cartToken,
    _product_id: productId,
    _qty: qty,
  });
  if (error) throw error;
  return data as { ok: boolean; reason?: string; available?: number; quantity?: number };
}

export async function createOrder(slug: string, cartToken: string, customer: { name: string; email: string; phone: string }) {
  const { data, error } = await supabase.rpc("lojinha_create_order", {
    _slug: slug,
    _cart_token: cartToken,
    _customer_name: customer.name,
    _customer_email: customer.email,
    _customer_phone: customer.phone,
  });
  if (error) throw error;
  return data as { order_id: string; total: number };
}

export type OrderView = {
  order: {
    id: string;
    customer_name: string;
    total: number;
    status: string;
    paid_at: string | null;
    created_at: string;
  };
  items: Array<{ id: string; product_name_snapshot: string; unit_price: number; quantity: number }>;
  units: Array<{ id: string; product_name: string; qr_token: string; status: string; delivered_at: string | null }>;
};

export async function getOrder(orderId: string): Promise<OrderView | null> {
  const { data, error } = await supabase.rpc("lojinha_get_order", { _order_id: orderId });
  if (error) throw error;
  return data as unknown as OrderView | null;
}

export async function validateQr(token: string) {
  const { data, error } = await supabase.rpc("lojinha_validate_qr", { _token: token });
  if (error) throw error;
  return data as { ok: boolean; reason?: string; product_name?: string; customer_name?: string; delivered_at?: string };
}

// --- PDV (modo caixa do garçom) ---

export async function createPosOrder(
  items: Array<{ product_id: string; quantity: number }>,
  paymentMethod: "pix" | "card",
  deviceId: string | null,
) {
  const { data, error } = await supabase.rpc("lojinha_create_pos_order", {
    _items: items,
    _payment_method: paymentMethod,
    _device_id: deviceId,
  });
  if (error) throw error;
  return data as { order_id: string; total: number };
}

export async function markPosPaid(orderId: string, paymentId: string) {
  const { data, error } = await supabase.rpc("lojinha_mark_pos_paid", {
    _order_id: orderId,
    _payment_id: paymentId,
  });
  if (error) throw error;
  return data as { ok: boolean };
}

export async function confirmDeliveryPos(orderId: string) {
  const { data, error } = await supabase.rpc("lojinha_confirm_delivery_pos", {
    _order_id: orderId,
  });
  if (error) throw error;
  return data as { ok: boolean; sale_id: string };
}
