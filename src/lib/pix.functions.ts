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

/** Polling do status pelo front (autenticado). */
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
