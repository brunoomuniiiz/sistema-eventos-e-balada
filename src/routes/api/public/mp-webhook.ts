import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";
import { applyMpPaymentToCharge, getMpPayment } from "@/lib/mp.server";

/**
 * Webhook do Mercado Pago.
 * MP envia POST com body { action, data: { id } } e headers:
 *   x-signature: ts=...,v1=<hash>
 *   x-request-id: <uuid>
 * O hash v1 é HMAC-SHA256 sobre `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`
 * usando o secret configurado no painel MP.
 */
export const Route = createFileRoute("/api/public/mp-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const bodyText = await request.text();
        let payload: { action?: string; type?: string; data?: { id?: string | number } };
        try {
          payload = JSON.parse(bodyText);
        } catch {
          return new Response("invalid json", { status: 400 });
        }

        const dataId = payload?.data?.id ? String(payload.data.id) : null;
        if (!dataId) return new Response("ok", { status: 200 }); // pings sem id

        const secret = process.env.MP_WEBHOOK_SECRET;
        const xSig = request.headers.get("x-signature");
        const xReq = request.headers.get("x-request-id") || "";

        if (secret && xSig) {
          const parts = Object.fromEntries(
            xSig.split(",").map((kv) => {
              const [k, ...rest] = kv.trim().split("=");
              return [k, rest.join("=")];
            }),
          ) as Record<string, string>;
          const ts = parts.ts;
          const v1 = parts.v1;
          if (ts && v1) {
            const manifest = `id:${dataId};request-id:${xReq};ts:${ts};`;
            const expected = createHmac("sha256", secret).update(manifest).digest("hex");
            try {
              const a = Buffer.from(v1, "hex");
              const b = Buffer.from(expected, "hex");
              if (a.length !== b.length || !timingSafeEqual(a, b)) {
                console.warn("[mp-webhook] assinatura inválida", { dataId });
                return new Response("invalid signature", { status: 401 });
              }
            } catch {
              return new Response("invalid signature", { status: 401 });
            }
          }
        }

        let mp;
        try {
          mp = await getMpPayment(dataId);
        } catch (e) {
          console.error("[mp-webhook] falha ao buscar pagamento", e);
          return new Response("ok", { status: 200 });
        }

        const result = await applyMpPaymentToCharge(mp);
        if (!result.updated) {
          console.warn("[mp-webhook] cobrança não encontrada para mp_payment_id", mp.id);
        }

        return new Response("ok", { status: 200 });
      },
      GET: async () => new Response("ok", { status: 200 }),
    },
  },
});
