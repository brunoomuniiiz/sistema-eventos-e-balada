// Helper para a API de pagamentos do Mercado Pago (PIX)
// Server-only — usa MP_ACCESS_TOKEN.

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
 * Retorna o payment_id, copia-e-cola, imagem base64 e expiração.
 */
export async function createMpPixPayment(input: {
  amount: number;
  description: string;
  externalReference?: string;
  payerEmail?: string;
  expiresInMinutes?: number;
}): Promise<MpPixPayment> {
  const expiresAt = new Date(
    Date.now() + (input.expiresInMinutes ?? 30) * 60 * 1000,
  ).toISOString();

  const body = {
    transaction_amount: +input.amount.toFixed(2),
    description: input.description,
    payment_method_id: "pix",
    payer: { email: input.payerEmail || "comprador@nightops.app" },
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

/** Consulta status de um pagamento no MP (usado pelo webhook para validar). */
export async function getMpPayment(paymentId: string | number): Promise<MpPixPayment> {
  const res = await fetch(`${MP_BASE}/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  const json = (await res.json()) as MpPixPayment & { message?: string };
  if (!res.ok) throw new Error(`MP get payment ${res.status}: ${json.message || ""}`);
  return json;
}
