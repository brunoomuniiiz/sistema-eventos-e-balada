import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { applyMpPaymentToCharge, createMpPixPayment, getMpPayment } from "./mp.server";

/**
 * Cria (ou reaproveita) uma cobrança PIX vinculada a um pedido da Lojinha.
 * Público: o cliente final não está logado.
 */
export const createPublicPixCharge = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ orderId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
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

    const { error: resErr } = await supabaseAdmin.rpc("lojinha_reserve_for_checkout", {
      _order_id: order.id,
    });
    if (resErr) {
      console.error("[createPublicPixCharge] reserve fail:", resErr);
      throw new Error(resErr.message);
    }

    let mp;
    try {
      mp = await createMpPixPayment({
        amount: Number(order.total),
        description: `Pedido Lojinha · ${order.customer_name}`.slice(0, 200),
        externalReference: `lojinha:${order.id}`,
        payerEmail: order.customer_email || "test_user_lojinha@testuser.com",
        expiresInMinutes: 24 * 60, // 24h para cliente final
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[createPublicPixCharge] MP fail:", msg);
      throw new Error(`Falha ao gerar PIX: ${msg}`);
    }

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
    if (error) {
      console.error("[createPublicPixCharge] insert fail:", error);
      throw new Error(error.message);
    }

    return charge;
  });

/**
 * Polling público pelo status. Além de ler o banco, consulta o MP quando ainda
 * está pending — funciona como fallback se o webhook atrasou ou falhou.
 */
export const getPublicPixChargeStatus = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ orderId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { data: charge, error } = await supabaseAdmin
      .from("pix_charges")
      .select("id, status, amount, paid_at, mp_payment_id")
      .eq("order_id", data.orderId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);

    // Se ainda pending e temos mp_payment_id, consulta MP e reconcilia.
    if (charge && charge.status === "pending" && charge.mp_payment_id) {
      try {
        const mp = await getMpPayment(charge.mp_payment_id);
        const result = await applyMpPaymentToCharge(mp);
        if (result.updated && result.status !== "pending") {
          // Releitura para devolver o status final
          const { data: fresh } = await supabaseAdmin
            .from("pix_charges")
            .select("id, status, amount, paid_at, mp_payment_id")
            .eq("id", charge.id)
            .maybeSingle();
          return fresh ?? charge;
        }
      } catch (e) {
        console.warn("[getPublicPixChargeStatus] MP poll fail:", e instanceof Error ? e.message : e);
      }
    }

    return charge;
  });

/**
 * [TESTE / sandbox] Simula a aprovação de uma cobrança PIX, replicando
 * exatamente o que o webhook do Mercado Pago faz quando o pagamento é
 * confirmado em produção. Útil porque QR codes de sandbox não podem ser
 * pagos por um banco real.
 */
export const simulatePixApproval = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ chargeId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const nowIso = new Date().toISOString();

    const { data: updated, error } = await supabaseAdmin
      .from("pix_charges")
      .update({ status: "approved", paid_at: nowIso, updated_at: nowIso })
      .eq("id", data.chargeId)
      .select("id, order_id, origin, mp_payment_id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!updated) throw new Error("Cobrança não encontrada");

    if (updated.order_id && updated.origin === "lojinha") {
      const { error: orderErr } = await supabaseAdmin
        .from("lojinha_orders")
        .update({
          status: "paid",
          paid_at: nowIso,
          mp_payment_id: updated.mp_payment_id ?? null,
        })
        .eq("id", updated.order_id)
        .in("status", ["pending"]);
      if (orderErr) throw new Error(orderErr.message);

      await supabaseAdmin.rpc("lojinha_release_order_reservation", {
        _order_id: updated.order_id,
      });
    }

    return { ok: true };
  });
