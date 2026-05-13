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
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData.user) return json({ error: "Inválido" }, 401);
    const ownerId = userData.user.id;
    const admin = createClient(supabaseUrl, serviceKey);

    const { staff_user_id } = await req.json();
    if (!staff_user_id) return json({ error: "staff_user_id obrigatório" }, 400);

    // confirma vínculo
    const { data: link } = await admin.from("user_roles")
      .select("id, role").eq("user_id", staff_user_id).eq("owner_id", ownerId).maybeSingle();
    if (!link || link.role === "owner") return json({ error: "Não autorizado" }, 403);

    await admin.from("user_roles").delete().eq("id", link.id);
    await admin.auth.admin.deleteUser(staff_user_id);
    return json({ ok: true });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
