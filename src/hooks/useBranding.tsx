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

    const PRIMARY_KEYS = [
      "--background", "--sidebar", "--card", "--popover", "--secondary", "--muted", "--sidebar-accent",
      "--foreground", "--sidebar-foreground", "--card-foreground", "--popover-foreground",
      "--secondary-foreground", "--muted-foreground",
      "--primary", "--primary-foreground", "--primary-glow", "--ring",
      "--sidebar-primary", "--sidebar-primary-foreground", "--sidebar-ring",
      "--accent", "--accent-foreground", "--chart-1",
      "--gradient-primary", "--gradient-accent", "--shadow-glow-primary",
      "--border", "--input",
    ];
    PRIMARY_KEYS.forEach((k) => root.style.removeProperty(k));

    // ===== BUTTON / PRIMARY COLOR =====
    if (branding.button_color) {
      const c = branding.button_color;
      const glow = lighten(c, 0.15);
      const fg = readableOn(c);
      root.style.setProperty("--primary", c);
      root.style.setProperty("--primary-foreground", fg);
      root.style.setProperty("--primary-glow", glow);
      root.style.setProperty("--ring", c);
      root.style.setProperty("--accent", c);
      root.style.setProperty("--accent-foreground", fg);
      root.style.setProperty("--chart-1", c);
      root.style.setProperty("--sidebar-primary", c);
      root.style.setProperty("--sidebar-primary-foreground", fg);
      root.style.setProperty("--sidebar-ring", c);
      root.style.setProperty("--gradient-primary", `linear-gradient(135deg, ${c}, ${glow})`);
      root.style.setProperty("--gradient-accent", `linear-gradient(135deg, ${c}, ${glow})`);
      root.style.setProperty("--shadow-glow-primary", `0 0 40px ${withAlpha(c, 0.35)}, 0 0 80px ${withAlpha(c, 0.15)}`);
    }

    // ===== BACKGROUND =====
    if (branding.bg_color) {
      const b = branding.bg_color;
      root.style.setProperty("--background", b);
      root.style.setProperty("--sidebar", darken(b, 0.04));
      root.style.setProperty("--card", lighten(b, 0.05));
      root.style.setProperty("--popover", lighten(b, 0.04));
      root.style.setProperty("--secondary", lighten(b, 0.08));
      root.style.setProperty("--muted", lighten(b, 0.06));
      root.style.setProperty("--sidebar-accent", lighten(b, 0.07));
      // bordas/inputs sutis em cima do fundo
      const isDarkBg = luminance(b) < 0.5;
      root.style.setProperty("--border", isDarkBg ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.10)");
      root.style.setProperty("--input", isDarkBg ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.10)");
    }

    // ===== TEXT =====
    if (branding.text_color) {
      const t = branding.text_color;
      root.style.setProperty("--foreground", t);
      root.style.setProperty("--sidebar-foreground", t);
      root.style.setProperty("--card-foreground", t);
      root.style.setProperty("--popover-foreground", t);
      root.style.setProperty("--secondary-foreground", t);
      root.style.setProperty("--muted-foreground", withAlpha(t, 0.65));
    }
  }, [branding]);

  return <Ctx.Provider value={branding}>{children}</Ctx.Provider>;
}

// ===== helpers =====
function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace("#", "").trim();
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex(r: number, g: number, b: number): string {
  const c = (x: number) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}
function lighten(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(r + (255 - r) * amount, g + (255 - g) * amount, b + (255 - b) * amount);
}
function darken(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(r * (1 - amount), g * (1 - amount), b * (1 - amount));
}
function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function readableOn(hex: string): string {
  return luminance(hex) > 0.55 ? "#0a0a14" : "#ffffff";
}

export function useBranding() {
  return useContext(Ctx);
}

export { FONT_FAMILIES };
