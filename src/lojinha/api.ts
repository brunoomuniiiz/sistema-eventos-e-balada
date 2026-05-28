import { supabase } from "@/integrations/supabase/client";

export type StorefrontProduct = {
  id: string;
  name: string;
  description: string | null;
  photo_url: string | null;
  price: number;
  unit: string;
  category_id: string | null;
  category_name: string | null;
  available_qty: number;
};

export async function toggleProductOnline(productId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("lojinha_toggle_sell_online", { _product_id: productId });
  if (error) throw error;
  return data as boolean;
}

export type StorefrontSettings = {
  id: string;
  user_id: string;
  enabled: boolean;
  slug: string;
  store_name: string | null;
  pickup_message: string | null;
  accent_color: string | null;
  stock_location_id: string | null;
  logo_url?: string | null;
  closed_message?: string | null;
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

export type ReserveResult = {
  ok: boolean;
  reason?: string;
  available?: number;
  quantity?: number;
  low_stock?: boolean;
  remaining?: number | null;
  blocked_by?: string;
};

export async function reserveCartItem(slug: string, cartToken: string, productId: string, qty: number): Promise<ReserveResult> {
  const { data, error } = await supabase.rpc("lojinha_reserve_cart_item", {
    _slug: slug,
    _cart_token: cartToken,
    _product_id: productId,
    _qty: qty,
  });
  if (error) throw error;
  return data as ReserveResult;
}

export async function createOrder(
  slug: string,
  cartToken: string,
  customer: { name: string; email: string; phone: string },
  items: Array<{ product_id: string; quantity: number }>,
) {
  const { data, error } = await supabase.rpc("lojinha_create_order", {
    _slug: slug,
    _cart_token: cartToken,
    _customer_name: customer.name,
    _customer_email: customer.email,
    _customer_phone: customer.phone,
    _items: items as never,
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
    _items: items as never,
    _payment_method: paymentMethod,
    _device_id: deviceId as never,
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

export async function markOrderDelivered(orderId: string) {
  const { data, error } = await supabase.rpc("lojinha_mark_order_delivered" as never, { _order_id: orderId } as never);
  if (error) throw error;
  return data as unknown as { ok: boolean; reason?: string };
}

// --- Pedido por QR (novo fluxo do garçom) ---

export type OrderLookupItem = {
  id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  product_type: "simple" | "combo";
};

export type OrderLookup =
  | { ok: false; reason: string }
  | {
      ok: true;
      source: "sale" | "order";
      id: string;
      daily_number: number | null;
      status: string;
      total: number;
      customer_name: string | null;
      customer_phone: string | null;
      delivered_at: string | null;
      delivered_by_name: string | null;
      items: OrderLookupItem[];
    };

export async function orderLookupByToken(token: string): Promise<OrderLookup> {
  const { data, error } = await supabase.rpc("order_lookup_by_token" as never, { _token: token } as never);
  if (error) throw error;
  return data as unknown as OrderLookup;
}

export type PrepSlipPayload = {
  daily_number: number | null;
  bar_name: string | null;
  item_name: string;
  unit_index: number;
  unit_total: number;
  components: { name: string; qty: number }[];
  waiter: string | null;
  created_at: string;
  category_id: string | null;
};

export async function orderRelease(source: "sale" | "order", id: string) {
  const { data, error } = await supabase.rpc("order_release" as never, { _source: source, _id: id } as never);
  if (error) throw error;
  return data as unknown as { ok: boolean; daily_number: number | null; prep_slips: PrepSlipPayload[] };
}

// Funcionario marca pedido como abandonado na hora (sem esperar 10min)
export async function abandonLojinhaOrder(orderId: string) {
  const { data, error } = await supabase.rpc("abandon_lojinha_order" as never, { _order_id: orderId } as never);
  if (error) throw error;
  return data as unknown as { ok: boolean; reason?: string };
}

// Cancela venda local (dinheiro/cartao fisico) - somente owner
export async function cancelLocalSale(saleId: string, reason: string) {
  const { data, error } = await supabase.rpc("cancel_local_sale" as never, { _sale_id: saleId, _reason: reason } as never);
  if (error) throw error;
  return data as unknown as { ok: boolean; reason?: string };
}

// Lojinha online: detecta pedido pendente do mesmo cliente (por telefone)
export type PendingForCustomer =
  | { found: false }
  | {
      found: true;
      order_id: string;
      total: number;
      expires_at: string | null;
      created_at: string;
      customer_name: string;
    };

export async function findPendingForCustomer(slug: string, phone: string): Promise<PendingForCustomer> {
  const { data, error } = await supabase.rpc("lojinha_find_pending_for_customer" as never, {
    _slug: slug,
    _customer_phone: phone,
  } as never);
  if (error) throw error;
  return data as unknown as PendingForCustomer;
}

// Cliente abandona pedido na hora (DELETE - não vai pra abandonados)
export async function customerAbandonOrder(orderId: string, phone: string) {
  const { data, error } = await supabase.rpc("lojinha_customer_abandon_order" as never, {
    _order_id: orderId,
    _customer_phone: phone,
  } as never);
  if (error) throw error;
  return data as unknown as { ok: boolean; reason?: string };
}

