import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { applyMpPaymentToCharge, createMpPixPayment, getMpPayment, mapMpStatus } from "./mp.server";

const CreateInput = z.object({
  amount: z.number().positive().max(1_000_000),
  description: z.string().min(1).max(200),
  origin: z.enum(["pdv", "lojinha"]),
  sector: z.string().min(1).max(40),
  orderId: z.string().uuid().optional().nullable(),
  salePayload: z.unknown().optional().nullable(),
});

async function getOwnerId(userId: string): Promise<string> {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("owner_id")
    .eq("user_id", userId)
    .maybeSingle();
  return (data?.owner_id as string) ?? userId;
}

/**
 * Cria uma cobrança PIX (MP) e grava em `pix_charges`. Devolve o QR pro front exibir.
 */
export const createPixCharge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => CreateInput.parse(d))
  .handler(async ({ data, context }) => {
    const userId = (context as { userId: string }).userId;
    const ownerId = await getOwnerId(userId);

    const mp = await createMpPixPayment({
      amount: data.amount,
      description: data.description,
      externalReference: `${data.origin}:${ownerId}:${Date.now()}`,
    });

    const td = mp.point_of_interaction?.transaction_data;
    const qrCode = td?.qr_code ?? null;
    const qrBase64 = td?.qr_code_base64 ?? null;

    const { data: charge, error } = await supabaseAdmin
      .from("pix_charges")
      .insert({
        user_id: ownerId,
        created_by: userId,
        amount: data.amount,
        origin: data.origin,
        sector: data.sector,
        order_id: data.orderId ?? null,
        sale_payload: (data.salePayload as never) ?? null,
        mp_payment_id: String(mp.id),
        qr_code: qrCode,
        qr_code_base64: qrBase64,
        status: "pending",
        expires_at: mp.date_of_expiration,
      })
      .select("id, mp_payment_id, qr_code, qr_code_base64, expires_at, status, amount")
      .single();

    if (error) throw new Error(error.message);
    return charge;
  });

/** Polling do status pelo front (autenticado). Reconcilia com MP se ainda pending. */
export const getPixChargeStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ chargeId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const userId = (context as { userId: string }).userId;
    const ownerId = await getOwnerId(userId);

    const { data: charge, error } = await supabaseAdmin
      .from("pix_charges")
      .select("id, status, paid_at, mp_payment_id, error_message, amount")
      .eq("id", data.chargeId)
      .eq("user_id", ownerId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!charge) throw new Error("Cobrança não encontrada");

    // Fallback: webhook pode estar atrasado/falho — consulta MP direto se ainda pending.
    if (charge.status === "pending" && charge.mp_payment_id) {
      try {
        const mp = await getMpPayment(charge.mp_payment_id);
        const result = await applyMpPaymentToCharge(mp);
        if (result.updated && result.status !== "pending") {
          const { data: fresh } = await supabaseAdmin
            .from("pix_charges")
            .select("id, status, paid_at, mp_payment_id, error_message, amount")
            .eq("id", charge.id)
            .maybeSingle();
          return fresh ?? charge;
        }
      } catch (e) {
        console.warn("[getPixChargeStatus] MP poll fail:", e instanceof Error ? e.message : e);
      }
    }

    return charge;
  });

/** Cancela manualmente uma cobrança pendente (status -> cancelled localmente). */
export const cancelPixCharge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ chargeId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const userId = (context as { userId: string }).userId;
    const ownerId = await getOwnerId(userId);
    const { error } = await supabaseAdmin
      .from("pix_charges")
      .update({ status: "cancelled" })
      .eq("id", data.chargeId)
      .eq("user_id", ownerId)
      .eq("status", "pending");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Admin: consulta o pagamento no Mercado Pago e devolve o status real.
 * Não altera nada — só inspeciona. Útil para o painel de conciliação.
 */
export const inspectMpForOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ orderId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const userId = (context as { userId: string }).userId;
    const ownerId = await getOwnerId(userId);

    const { data: charge } = await supabaseAdmin
      .from("pix_charges")
      .select("id, mp_payment_id, status, amount")
      .eq("order_id", data.orderId)
      .eq("user_id", ownerId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!charge?.mp_payment_id) {
      return { found: false as const, reason: "Sem mp_payment_id salvo" };
    }
    try {
      const mp = await getMpPayment(charge.mp_payment_id);
      return {
        found: true as const,
        mp_payment_id: String(mp.id),
        mp_status: mp.status,
        mapped: mapMpStatus(mp.status),
        amount: mp.transaction_amount,
        local_status: charge.status,
      };
    } catch (e) {
      return { found: false as const, reason: e instanceof Error ? e.message : "Falha MP" };
    }
  });

/**
 * Admin: força reconciliação puxando o status real do MP e aplicando o
 * mesmo fluxo do webhook (atualiza pix_charges + lojinha_orders + libera reserva).
 */
export const reconcileOrderFromMp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ orderId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const userId = (context as { userId: string }).userId;
    const ownerId = await getOwnerId(userId);

    const { data: charge } = await supabaseAdmin
      .from("pix_charges")
      .select("id, mp_payment_id, user_id, order_id, origin")
      .eq("order_id", data.orderId)
      .eq("user_id", ownerId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!charge?.mp_payment_id) throw new Error("Pedido sem mp_payment_id");

    const mp = await getMpPayment(charge.mp_payment_id);
    const result = await applyMpPaymentToCharge(mp);

    // Mesmo se a cobrança antes estava abandoned/cancelled e o MP aprovou,
    // garante o pedido marcado como pago.
    if (mapMpStatus(mp.status) === "approved" && charge.order_id && charge.origin === "lojinha") {
      const nowIso = new Date().toISOString();
      await supabaseAdmin
        .from("lojinha_orders")
        .update({
          status: "paid",
          paid_at: nowIso,
          mp_payment_id: String(mp.id),
          reconciled_at: nowIso,
          reconciled_by: userId,
          reconciled_note: "Conciliado via painel — pagamento aprovado no Mercado Pago",
        })
        .eq("id", charge.order_id)
        .in("status", ["pending", "abandoned"]);
    }

    return { ok: true, mp_status: mp.status, applied: result.updated };
  });

/** Verifica se o user atual é owner do escopo (não staff). */
async function assertOwner(userId: string): Promise<string> {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("owner_id, role")
    .eq("user_id", userId)
    .maybeSingle();
  const ownerId = (data?.owner_id as string) ?? userId;
  if (data && data.role && data.role !== "owner") {
    throw new Error("Apenas o dono pode excluir pedidos");
  }
  return ownerId;
}

/**
 * Admin: exclui um pedido da lojinha (e suas cargas/items/units).
 * Por padrão bloqueia exclusão de pedidos pagos/entregues — precisa `force:true`.
 */
export const deleteLojinhaOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ orderId: z.string().uuid(), force: z.boolean().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const userId = (context as { userId: string }).userId;
    const ownerId = await assertOwner(userId);

    const { data: order, error: orderErr } = await supabaseAdmin
      .from("lojinha_orders")
      .select("id, status, user_id")
      .eq("id", data.orderId)
      .eq("user_id", ownerId)
      .maybeSingle();
    if (orderErr) throw new Error(orderErr.message);
    if (!order) throw new Error("Pedido não encontrado");

    const protectedStatuses = ["paid", "delivered"];
    if (!data.force && protectedStatuses.includes(order.status)) {
      throw new Error(
        `Pedido está '${order.status}'. Confirme a exclusão forçada (afeta histórico).`,
      );
    }

    if (order.status === "pending") {
      await supabaseAdmin.rpc("lojinha_release_order_reservation", {
        _order_id: order.id,
      });
    }

    // Filhos primeiro (sem FK ON DELETE CASCADE garantida).
    await supabaseAdmin.from("pix_charges").delete().eq("order_id", order.id);
    await supabaseAdmin.from("lojinha_order_units").delete().eq("order_id", order.id);
    await supabaseAdmin.from("lojinha_order_items").delete().eq("order_id", order.id);
    await supabaseAdmin
      .from("lojinha_stock_reservations")
      .delete()
      .eq("cart_token", order.id);

    const { error: delErr } = await supabaseAdmin
      .from("lojinha_orders")
      .delete()
      .eq("id", order.id);
    if (delErr) throw new Error(delErr.message);

    return { ok: true };
  });

/**
 * Admin: exclui em lote conforme escopo.
 * - 'abandoned'  : todos pedidos abandonados (conciliados ou não)
 * - 'pending'    : todos pendentes (libera reservas)
 * - 'all_test'   : TODOS pedidos do dono (uso para limpar testes)
 */
export const deleteAllLojinhaOrders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ scope: z.enum(["abandoned", "pending", "all_test"]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const userId = (context as { userId: string }).userId;
    const ownerId = await assertOwner(userId);

    let q = supabaseAdmin
      .from("lojinha_orders")
      .select("id, status")
      .eq("user_id", ownerId);
    if (data.scope === "abandoned") q = q.eq("status", "abandoned");
    else if (data.scope === "pending") q = q.eq("status", "pending");

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const orders = rows ?? [];
    if (orders.length === 0) return { ok: true, deleted: 0 };

    for (const o of orders) {
      if (o.status === "pending") {
        await supabaseAdmin.rpc("lojinha_release_order_reservation", {
          _order_id: o.id,
        });
      }
    }

    const ids = orders.map((o) => o.id);
    await supabaseAdmin.from("pix_charges").delete().in("order_id", ids);
    await supabaseAdmin.from("lojinha_order_units").delete().in("order_id", ids);
    await supabaseAdmin.from("lojinha_order_items").delete().in("order_id", ids);
    await supabaseAdmin.from("lojinha_stock_reservations").delete().in("cart_token", ids);

    const { error: delErr } = await supabaseAdmin
      .from("lojinha_orders")
      .delete()
      .in("id", ids);
    if (delErr) throw new Error(delErr.message);

    return { ok: true, deleted: ids.length };
  });


