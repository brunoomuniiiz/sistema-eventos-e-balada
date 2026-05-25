import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import type { Permission } from "@/hooks/usePermissions";

export type PersonaKey = "dono" | "promoter" | "garcom" | "caixa" | "portaria" | "lojinha";

export type PersonaMask = {
  isOwner: boolean;
  permissions: Permission[];
  flags: Record<string, boolean>;
  rolePreset?: string | null;
};

export const PERSONAS: Record<PersonaKey, { label: string; mask: PersonaMask }> = {
  dono: {
    label: "Dono (visão completa)",
    mask: { isOwner: true, permissions: [], flags: {} },
  },
  promoter: {
    label: "Promoter",
    mask: {
      isOwner: false,
      permissions: ["promoters"],
      flags: { vendas_ao_vivo: false },
      rolePreset: "promoter",
    },
  },
  garcom: {
    label: "Garçom",
    mask: {
      isOwner: false,
      permissions: ["vendas", "lojinha"],
      flags: {
        vendas_pdv_caixa: false,
        vendas_garcom: true,
        vendas_validar_qr: true,
        vendas_pedidos: true,
        vendas_historico: true,
        vendas_fechamento: false,
        vendas_abre_caixa: false,
        vendas_sangria: false,
        pode_lancar_consumacao: true,
        aceita_dinheiro: false,
        aceita_pix: false,
        aceita_cartao: false,
        lojinha_can_sell: true,
      },
    },
  },
  caixa: {
    label: "Caixa (PDV)",
    mask: {
      isOwner: false,
      permissions: ["vendas"],
      flags: {
        vendas_pdv_caixa: true,
        vendas_fechamento: true,
        vendas_abre_caixa: true,
        vendas_sangria: true,
        vendas_validar_qr: true,
        vendas_pedidos: true,
        vendas_historico: true,
        aceita_dinheiro: true,
        aceita_pix: true,
        aceita_cartao: true,
        can_sell_cash: true,
      },
    },
  },
  portaria: {
    label: "Portaria",
    mask: {
      isOwner: false,
      permissions: ["portaria"],
      flags: { vendas_validar_qr: true },
    },
  },
  lojinha: {
    label: "Lojinha (vendedor online)",
    mask: {
      isOwner: false,
      permissions: ["lojinha"],
      flags: {
        vendas_pedidos: true,
        vendas_historico: true,
        lojinha_can_sell: true,
      },
    },
  },
};

export const PERSONA_DESTINATIONS: Record<PersonaKey, { to: string; search?: Record<string, string> }> = {
  dono: { to: "/dashboard" },
  promoter: { to: "/meu-extrato" },
  garcom: { to: "/vendas", search: { tab: "vender" } },
  caixa: { to: "/pdv" },
  portaria: { to: "/portaria" },
  lojinha: { to: "/vendas", search: { tab: "vender" } },
};

export function getPersonaDestination(persona: PersonaKey) {
  return PERSONA_DESTINATIONS[persona];
}

type Ctx = {
  persona: PersonaKey;
  setPersona: (p: PersonaKey) => void;
  mask: PersonaMask | null; // null quando persona = dono
};

const ViewAsContext = createContext<Ctx>({ persona: "dono", setPersona: () => {}, mask: null });

const KEY = "viewAsPersona";

export function ViewAsProvider({ children }: { children: ReactNode }) {
  const [persona, setPersonaState] = useState<PersonaKey>("dono");

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(KEY) as PersonaKey | null;
      if (saved && PERSONAS[saved]) setPersonaState(saved);
    } catch {}
  }, []);

  const setPersona = (p: PersonaKey) => {
    setPersonaState(p);
    try {
      sessionStorage.setItem(KEY, p);
    } catch {}
  };

  const mask = persona === "dono" ? null : PERSONAS[persona].mask;

  return <ViewAsContext.Provider value={{ persona, setPersona, mask }}>{children}</ViewAsContext.Provider>;
}

export function useViewAs() {
  return useContext(ViewAsContext);
}
