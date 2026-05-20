import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createMpPixPayment } from "./mp.server";

/**
 * Cria (ou reaproveita) uma cobrança PIX vinculada a um pedido da Lojinha.
 * Público: o cliente final não está logado.
 */
export const createPublicPixCharge = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ orderId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    // Pedido
    const { data: order, error: orderErr } = await supabaseAdmin
      .from("lojinha_orders")
      .select("id, user_id, total, status, customer_email, customer_name")
      .eq("id", data.orderId)
      .maybeSingle();
    if (orderErr) throw new Error(orderErr.message);
    if (!order) throw new Error("Pedido não encontrado");
    if (order.status !== "pending") {
      throw new Error("Pedido não está aguardando pagamento");
    }

    // Reaproveita cobrança pendente, se existir e não expirada
    const { data: existing } = await supabaseAdmin
      .from("pix_charges")
      .select("id, qr_code, qr_code_base64, expires_at, status, amount")
      .eq("order_id", order.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing) {
      const stillValid =
        !existing.expires_at || new Date(existing.expires_at).getTime() > Date.now() + 30_000;
      if (stillValid) return existing;
    }

    // Cria nova no MP
    const mp = await createMpPixPayment({
      amount: Number(order.total),
      description: `Pedido Lojinha · ${order.customer_name}`,
      externalReference: `lojinha:${order.id}`,
      payerEmail: order.customer_email || undefined,
    });

    const td = mp.point_of_interaction?.transaction_data;
    const { data: charge, error } = await supabaseAdmin
      .from("pix_charges")
      .insert({
        user_id: order.user_id,
        amount: Number(order.total),
        origin: "lojinha",
        sector: "lojinha",
        order_id: order.id,
        mp_payment_id: String(mp.id),
        qr_code: td?.qr_code ?? null,
        qr_code_base64: td?.qr_code_base64 ?? null,
        status: "pending",
        expires_at: mp.date_of_expiration,
      })
      .select("id, qr_code, qr_code_base64, expires_at, status, amount")
      .single();
    if (error) throw new Error(error.message);
    return charge;
  });

/** Polling público pelo status (lê pelo orderId, devolve a última cobrança). */
export const getPublicPixChargeStatus = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ orderId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { data: charge, error } = await supabaseAdmin
      .from("pix_charges")
      .select("id, status, amount, paid_at")
      .eq("order_id", data.orderId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return charge;
  });
