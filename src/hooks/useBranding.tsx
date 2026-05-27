import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type Branding = {
  bar_name: string | null;
  logo_url: string | null;
  font_family: string;
  theme_mode: "dark" | "light";
  bg_color: string | null;
  text_color: string | null;
  button_color: string | null;
};

const DEFAULTS: Branding = {
  bar_name: null,
  logo_url: null,
  font_family: "Space Grotesk",
  theme_mode: "dark",
  bg_color: null,
  text_color: null,
  button_color: null,
};

const Ctx = createContext<Branding>(DEFAULTS);

const FONT_FAMILIES = [
  "Space Grotesk",
  "Inter",
  "Poppins",
  "Montserrat",
  "Oswald",
  "Bebas Neue",
  "Playfair Display",
  "Roboto",
  "Lato",
];

function loadGoogleFont(name: string) {
  if (typeof document === "undefined") return;
  const id = `gf-${name.replace(/\s+/g, "-")}`;
  if (document.getElementById(id)) return;
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(name)}:wght@300;400;500;600;700;800&display=swap`;
  document.head.appendChild(link);
}

export function BrandingProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  const { data } = useQuery({
    queryKey: ["branding", user?.id],
    enabled: !!user,
    staleTime: 30_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("bar_settings")
        .select("bar_name, logo_url, font_family, theme_mode, bg_color, text_color, button_color")
        .maybeSingle();
      return data;
    },
  });

  const branding: Branding = useMemo(() => ({
    bar_name: data?.bar_name ?? null,
    logo_url: data?.logo_url ?? null,
    font_family: (data as { font_family?: string } | null)?.font_family ?? DEFAULTS.font_family,
    theme_mode: ((data as { theme_mode?: string } | null)?.theme_mode === "light" ? "light" : "dark"),
    bg_color: (data as { bg_color?: string | null } | null)?.bg_color ?? null,
    text_color: (data as { text_color?: string | null } | null)?.text_color ?? null,
    button_color: (data as { button_color?: string | null } | null)?.button_color ?? null,
  }), [data]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    loadGoogleFont(branding.font_family);

    const root = document.documentElement;
    root.style.setProperty("--font-display", `"${branding.font_family}", system-ui, sans-serif`);
    root.style.setProperty("--font-sans", `"${branding.font_family}", system-ui, sans-serif`);

    if (branding.theme_mode === "light") {
      root.classList.remove("dark");
      root.style.colorScheme = "light";
    } else {
      root.classList.add("dark");
      root.style.colorScheme = "dark";
    }

    const setOrClear = (k: string, v: string | null) => {
      if (v) root.style.setProperty(k, v);
      else root.style.removeProperty(k);
    };
    setOrClear("--background", branding.bg_color);
    setOrClear("--sidebar", branding.bg_color);
    setOrClear("--foreground", branding.text_color);
    setOrClear("--sidebar-foreground", branding.text_color);
    setOrClear("--primary", branding.button_color);
    setOrClear("--ring", branding.button_color);
    setOrClear("--sidebar-primary", branding.button_color);
  }, [branding]);

  return <Ctx.Provider value={branding}>{children}</Ctx.Provider>;
}

export function useBranding() {
  return useContext(Ctx);
}

export { FONT_FAMILIES };
