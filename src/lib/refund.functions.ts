import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const MP_BASE = "https://api.mercadopago.com";

const Input = z.object({
  orderId: z.string().uuid(),
  amount: z.number().positive().max(1_000_000).optional().nullable(),
  reason: z.string().min(1).max(500),
});

/**
 * Estorna um pagamento de pedido da lojinha via API de refunds do Mercado Pago.
 * Apenas o owner pode executar.
 */
export const refundLojinhaOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const userId = (context as { userId: string }).userId;

    // Resolve owner e confirma que esse user EH o owner
    const { data: role } = await supabaseAdmin
      .from("user_roles")
      .select("owner_id, display_name, email")
      .eq("user_id", userId)
      .maybeSingle();

    const ownerId = (role?.owner_id as string) ?? userId;
    if (ownerId !== userId) {
      throw new Error("Apenas o dono pode estornar pedidos");
    }

    // Pega o pedido
    const { data: order, error: orderErr } = await supabaseAdmin
      .from("lojinha_orders")
      .select("id, status, total, mp_payment_id, refunded_at, user_id")
      .eq("id", data.orderId)
      .eq("user_id", ownerId)
      .maybeSingle();

    if (orderErr) throw new Error(orderErr.message);
    if (!order) throw new Error("Pedido não encontrado");
    if (order.refunded_at) throw new Error("Pedido já foi estornado");
    if (!order.mp_payment_id) {
      throw new Error("Pedido sem ID do Mercado Pago — não é possível estornar pela API");
    }
    if (!["paid", "delivered"].includes(order.status as string)) {
      throw new Error(`Pedido com status "${order.status}" não pode ser estornado`);
    }

    const token = process.env.MP_ACCESS_TOKEN;
    if (!token) throw new Error("MP_ACCESS_TOKEN não configurado");

    // Chama a API de refunds do MP
    const body = data.amount != null ? JSON.stringify({ amount: +data.amount.toFixed(2) }) : undefined;
    const res = await fetch(`${MP_BASE}/v1/payments/${order.mp_payment_id}/refunds`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": `refund-${order.id}-${Date.now()}`,
      },
      body,
    });

    const json = (await res.json()) as { id?: number; amount?: number; status?: string; message?: string };
    if (!res.ok) {
      throw new Error(`Falha no estorno (MP ${res.status}): ${json.message ?? "erro desconhecido"}`);
    }

    const refundedAmount = json.amount ?? Number(order.total);

    // Atualiza pedido
    const { error: updErr } = await supabaseAdmin
      .from("lojinha_orders")
      .update({
        refunded_at: new Date().toISOString(),
        refund_amount: refundedAmount,
        refunded_by: userId,
        refunded_by_name: (role?.display_name as string) ?? (role?.email as string) ?? null,
        refunded_reason: data.reason,
        mp_refund_id: json.id ? String(json.id) : null,
        status: "refunded",
      })
      .eq("id", order.id);

    if (updErr) throw new Error(updErr.message);

    return { ok: true, refundId: json.id ?? null, amount: refundedAmount };
  });
