import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

type State = { token: string | null; authorizedByName: string | null; expiresAt: number | null };

const KEY = "nightops.opPin";
const TTL_MS = 15 * 60 * 1000; // 15 min de inatividade

const Ctx = createContext<{
  token: string | null;
  authorizedByName: string | null;
  isUnlocked: boolean;
  setUnlocked: (token: string, authorizedByName: string) => void;
  lock: (silent?: boolean) => void;
  touch: () => void;
} | null>(null);

function readSession(): State {
  if (typeof window === "undefined") return { token: null, authorizedByName: null, expiresAt: null };
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return { token: null, authorizedByName: null, expiresAt: null };
    const parsed = JSON.parse(raw) as State;
    if (parsed.expiresAt && parsed.expiresAt > Date.now()) return parsed;
  } catch { /* ignore */ }
  return { token: null, authorizedByName: null, expiresAt: null };
}

export function OperationPinProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State>(() => readSession());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const lock = useCallback((silent = false) => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    try { sessionStorage.removeItem(KEY); } catch { /* ignore */ }
    setState({ token: null, authorizedByName: null, expiresAt: null });
    if (!silent) toast.success("Modo PIN trancado");
  }, []);

  const persist = useCallback((next: State) => {
    try { sessionStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
    setState(next);
  }, []);

  const armTimer = useCallback((expiresAt: number) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const ms = Math.max(0, expiresAt - Date.now());
    timerRef.current = setTimeout(() => lock(true), ms);
  }, [lock]);

  const setUnlocked = useCallback((token: string, authorizedByName: string) => {
    const next = { token, authorizedByName, expiresAt: Date.now() + TTL_MS };
    persist(next);
    armTimer(next.expiresAt);
  }, [persist, armTimer]);

  const touch = useCallback(() => {
    if (!state.token) return;
    const next = { ...state, expiresAt: Date.now() + TTL_MS };
    persist(next);
    armTimer(next.expiresAt);
  }, [state, persist, armTimer]);

  // Re-arma timer na montagem se vier de sessionStorage
  useEffect(() => {
    if (state.expiresAt) armTimer(state.expiresAt);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo(() => ({
    token: state.token,
    authorizedByName: state.authorizedByName,
    isUnlocked: !!state.token,
    setUnlocked,
    lock,
    touch,
  }), [state, setUnlocked, lock, touch]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useOperationPin() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useOperationPin must be used within OperationPinProvider");
  return ctx;
}
