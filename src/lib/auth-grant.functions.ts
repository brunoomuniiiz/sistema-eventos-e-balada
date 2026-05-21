import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Input = z.object({
  email: z.string().email().max(255),
  password: z.string().min(1).max(200),
  scope: z.enum(["withdrawal", "discount", "closing", "open_cash"]),
});

function randomToken() {
  const a = new Uint8Array(24);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Verifica e-mail+senha do autorizador (owner ou staff com can_authorize) e
 * grava um token de uso único válido por 10 min para a operação solicitada.
 */
export const requestAuthGrant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const ownerId = (context as { userId: string }).userId
      ? await getOwnerId(context.userId)
      : null;
    if (!ownerId) throw new Error("Sessão inválida");

    // Cria client temporário para validar credenciais sem afetar a sessão atual
    const url = process.env.SUPABASE_URL!;
    const anon = process.env.SUPABASE_PUBLISHABLE_KEY!;
    const tmp = createClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: signIn, error: signErr } = await tmp.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    });
    if (signErr || !signIn.user) {
      throw new Error("E-mail ou senha incorretos");
    }
    const authorizerId = signIn.user.id;
    await tmp.auth.signOut();

    // Verifica que o autorizador é owner do mesmo workspace OU staff com can_authorize
    const { data: role, error: roleErr } = await supabaseAdmin
      .from("user_roles")
      .select("role, can_authorize, owner_id, display_name, email")
      .eq("user_id", authorizerId)
      .eq("owner_id", ownerId)
      .maybeSingle();
    if (roleErr) throw new Error(roleErr.message);
    if (!role) throw new Error("Usuário não pertence à equipe");
    const isAuthorizer = role.role === "owner" || role.can_authorize === true;
    if (!isAuthorizer) throw new Error("Sem permissão para autorizar");

    const token = randomToken();
    const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const { error: insErr } = await supabaseAdmin.from("auth_grants").insert({
      user_id: ownerId,
      token,
      authorized_by: authorizerId,
      authorized_by_name: role.display_name || role.email || null,
      scope: data.scope,
      expires_at: expires,
    });
    if (insErr) throw new Error(insErr.message);

    return { token, authorized_by_name: role.display_name || role.email || "" };
  });

async function getOwnerId(userId: string): Promise<string> {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("owner_id")
    .eq("user_id", userId)
    .maybeSingle();
  return data?.owner_id ?? userId;
}
