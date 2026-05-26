import { describe, it, expect, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { ReactNode } from "react";
import { ViewAsProvider, useViewAs } from "./useViewAs";

const KEY = "viewAsPersona";
const wrapper = ({ children }: { children: ReactNode }) => (
  <ViewAsProvider>{children}</ViewAsProvider>
);

describe("ViewAsProvider — migração lojinha → garcom", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("migra sessão antiga 'lojinha' para 'garcom' e atualiza sessionStorage", async () => {
    sessionStorage.setItem(KEY, "lojinha");
    const { result } = renderHook(() => useViewAs(), { wrapper });

    await waitFor(() => {
      expect(result.current.persona).toBe("garcom");
    });
    expect(sessionStorage.getItem(KEY)).toBe("garcom");
  });

  it("preserva persona válida ('caixa') sem reescrever storage", async () => {
    sessionStorage.setItem(KEY, "caixa");
    const { result } = renderHook(() => useViewAs(), { wrapper });

    await waitFor(() => {
      expect(result.current.persona).toBe("caixa");
    });
    expect(sessionStorage.getItem(KEY)).toBe("caixa");
  });

  it("setPersona('lojinha') em runtime normaliza para 'garcom'", async () => {
    const { result } = renderHook(() => useViewAs(), { wrapper });

    act(() => {
      result.current.setPersona("lojinha");
    });

    await waitFor(() => {
      expect(result.current.persona).toBe("garcom");
    });
    expect(sessionStorage.getItem(KEY)).toBe("garcom");
  });
});
