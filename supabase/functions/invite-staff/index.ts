// Edge function: admin (owner) cria conta de funcionário e atribui permissões
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Sem autenticação" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: "Usuário inválido" }, 401);
    const ownerId = userData.user.id;

    const admin = createClient(supabaseUrl, serviceKey);

    // Confirma que o usuário atual é owner
    const { data: ownerRole } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", ownerId)
      .eq("owner_id", ownerId)
      .eq("role", "owner")
      .maybeSingle();
    if (!ownerRole) return json({ error: "Apenas o dono pode convidar" }, 403);

    const body = await req.json();
    const {
      email, password, display_name, role_preset, permissions,
      can_discount, max_discount_percent, can_sell_cash, can_authorize,
      lojinha_can_sell, lojinha_payment_methods, lojinha_point_device_id,
      pode_adicionar_bebidas, aceita_dinheiro, aceita_pix, aceita_cartao,
    } = body as {
      email: string; password: string; display_name?: string; role_preset?: string; permissions: string[];
      can_discount?: boolean; max_discount_percent?: number; can_sell_cash?: boolean; can_authorize?: boolean;
      lojinha_can_sell?: boolean; lojinha_payment_methods?: string[]; lojinha_point_device_id?: string | null;
      pode_adicionar_bebidas?: boolean; aceita_dinheiro?: boolean; aceita_pix?: boolean; aceita_cartao?: boolean;
    };
    if (!email || !password) return json({ error: "Email e senha obrigatórios" }, 400);
    if (password.length < 6) return json({ error: "Senha mínima de 6 caracteres" }, 400);

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: display_name ?? email.split("@")[0], invited_by: ownerId },
    });
    if (createErr || !created.user) return json({ error: createErr?.message ?? "Falha ao criar" }, 400);

    const aceita_dinheiro_final = aceita_dinheiro ?? (can_sell_cash !== false);

    const { error: roleErr } = await admin.from("user_roles").insert({
      user_id: created.user.id,
      owner_id: ownerId,
      role: "staff",
      role_preset: role_preset ?? null,
      permissions: permissions ?? [],
      display_name: display_name ?? email.split("@")[0],
      email,
      can_discount: !!can_discount,
      max_discount_percent: Math.max(0, Math.min(100, Number(max_discount_percent ?? 0))),
      can_sell_cash: aceita_dinheiro_final,
      can_authorize: !!can_authorize,
      lojinha_can_sell: !!lojinha_can_sell,
      lojinha_payment_methods: lojinha_payment_methods ?? [],
      lojinha_point_device_id: lojinha_point_device_id ?? null,
      pode_adicionar_bebidas: !!pode_adicionar_bebidas,
      aceita_dinheiro: aceita_dinheiro_final,
      aceita_pix: aceita_pix !== false,
      aceita_cartao: aceita_cartao !== false,
    });
    if (roleErr) {
      await admin.auth.admin.deleteUser(created.user.id);
      return json({ error: roleErr.message }, 400);
    }

    return json({ ok: true, user_id: created.user.id });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
