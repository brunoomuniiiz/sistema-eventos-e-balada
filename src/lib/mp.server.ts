// Helper para a API de pagamentos do Mercado Pago (PIX)
// Server-only — usa MP_ACCESS_TOKEN.

import { supabaseAdmin } from "@/integrations/supabase/client.server";

const MP_BASE = "https://api.mercadopago.com";

export type MpPixPayment = {
  id: number;
  status: "pending" | "approved" | "authorized" | "in_process" | "in_mediation" | "rejected" | "cancelled" | "refunded" | "charged_back";
  status_detail: string;
  transaction_amount: number;
  date_of_expiration: string | null;
  point_of_interaction?: {
    transaction_data?: {
      qr_code?: string;
      qr_code_base64?: string;
      ticket_url?: string;
    };
  };
};

function getToken(): string {
  const t = process.env.MP_ACCESS_TOKEN;
  if (!t) throw new Error("MP_ACCESS_TOKEN não configurado");
  return t;
}

/**
 * Cria um pagamento PIX no Mercado Pago.
 * Default 24h de expiração (lojinha online — cliente pode pagar mais tarde).
 */
export async function createMpPixPayment(input: {
  amount: number;
  description: string;
  externalReference?: string;
  payerEmail?: string;
  expiresInMinutes?: number;
}): Promise<MpPixPayment> {
  const expiresAt = new Date(
    Date.now() + (input.expiresInMinutes ?? 24 * 60) * 60 * 1000,
  ).toISOString();

  // MP retorna 403 "Payer email forbidden" se o e-mail do pagador
  // for igual (ou do mesmo domínio) ao da conta recebedora.
  // Usamos sempre um e-mail anônimo por pedido — o e-mail real do cliente
  // segue salvo em lojinha_orders, só não vai pro MP.
  const refSlug = (input.externalReference || "pix").replace(/[^a-zA-Z0-9]/g, "").slice(0, 12) || "pix";
  const anonEmail = `pix-${refSlug}-${Date.now().toString(36)}@nightops.app`;

  const body = {
    transaction_amount: +input.amount.toFixed(2),
    description: input.description,
    payment_method_id: "pix",
    payer: { email: anonEmail },
    external_reference: input.externalReference,
    date_of_expiration: expiresAt,
  };

  const res = await fetch(`${MP_BASE}/v1/payments`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getToken()}`,
      "Content-Type": "application/json",
      "X-Idempotency-Key": `${input.externalReference ?? "pix"}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    },
    body: JSON.stringify(body),
  });

  const json = (await res.json()) as MpPixPayment & { message?: string; error?: string };
  if (!res.ok) {
    throw new Error(`MP error ${res.status}: ${json.message || json.error || "falha ao criar PIX"}`);
  }
  return json;
}

/** Consulta status de um pagamento no MP. */
export async function getMpPayment(paymentId: string | number): Promise<MpPixPayment> {
  const res = await fetch(`${MP_BASE}/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  const json = (await res.json()) as MpPixPayment & { message?: string };
  if (!res.ok) throw new Error(`MP get payment ${res.status}: ${json.message || ""}`);
  return json;
}

export function mapMpStatus(s: string): "approved" | "rejected" | "pending" | "cancelled" {
  if (s === "approved" || s === "authorized") return "approved";
  if (s === "rejected" || s === "cancelled" || s === "refunded" || s === "charged_back") return "rejected";
  return "pending";
}

/**
 * Aplica o desfecho de um pagamento MP na cobrança PIX correspondente.
 * Idempotente: pode ser chamado pelo webhook e pelo polling de fallback.
 * Atualiza pix_charges, lojinha_orders (se origin=lojinha), e libera reserva.
 */
export async function applyMpPaymentToCharge(mp: MpPixPayment): Promise<{
  updated: boolean;
  status: "approved" | "rejected" | "pending" | "cancelled";
}> {
  const newStatus = mapMpStatus(mp.status);
  const nowIso = new Date().toISOString();

  const update: {
    status: string;
    updated_at: string;
    paid_at?: string;
    error_message?: string;
  } = { status: newStatus, updated_at: nowIso };
  if (newStatus === "approved") update.paid_at = nowIso;
  if (newStatus === "rejected") update.error_message = mp.status_detail;

  const { data: updated, error } = await supabaseAdmin
    .from("pix_charges")
    .update(update)
    .eq("mp_payment_id", String(mp.id))
    .select("id, order_id, origin")
    .maybeSingle();
  if (error) {
    console.error("[applyMpPaymentToCharge] pix_charges update error", error);
    return { updated: false, status: newStatus };
  }
  if (!updated) {
    console.warn("[applyMpPaymentToCharge] nenhuma cobrança com mp_payment_id", mp.id);
    return { updated: false, status: newStatus };
  }

  if (newStatus === "approved" && updated.order_id && updated.origin === "lojinha") {
    const { error: orderErr } = await supabaseAdmin
      .from("lojinha_orders")
      .update({ status: "paid", paid_at: nowIso, mp_payment_id: String(mp.id) })
      .eq("id", updated.order_id)
      .in("status", ["pending"]);
    if (orderErr) console.error("[applyMpPaymentToCharge] order update error", orderErr);
  }

  if (newStatus !== "pending" && updated.order_id && updated.origin === "lojinha") {
    const { error: relErr } = await supabaseAdmin.rpc("lojinha_release_order_reservation", {
      _order_id: updated.order_id,
    });
    if (relErr) console.error("[applyMpPaymentToCharge] release reservation error", relErr);
  }

  return { updated: true, status: newStatus };
}
