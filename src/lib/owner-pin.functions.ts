import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SetInput = z.object({
  pin: z.string().regex(/^[0-9]{4,8}$|^$/, "PIN deve ter 4 a 8 dígitos"),
});

export const setOwnerPin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => SetInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.rpc("set_owner_pin", { _pin: data.pin });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const hasOwnerPin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase.rpc("has_owner_pin");
    if (error) throw new Error(error.message);
    return { exists: !!data };
  });

const GrantInput = z.object({
  pin: z.string().regex(/^[0-9]{4,8}$/, "PIN inválido"),
  scope: z.enum(["withdrawal", "discount", "closing", "open_cash", "operation", "refund", "report"]),
});

export const grantViaPin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => GrantInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: res, error } = await supabase.rpc("grant_via_pin", {
      _pin: data.pin,
      _scope: data.scope,
    });
    if (error) throw new Error(error.message);
    const r = res as { token: string; authorized_by_name: string };
    return r;
  });
