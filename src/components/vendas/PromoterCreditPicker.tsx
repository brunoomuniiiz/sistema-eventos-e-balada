import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Search, UserCog, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL } from "@/lib/format";

type PromoterWithBalance = { id: string; name: string; balance: number };

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  maxAmount: number;
  onPick: (promoter_id: string, promoter_name: string, amount: number) => void;
}

export function PromoterCreditPicker({ open, onOpenChange, maxAmount, onPick }: Props) {
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<PromoterWithBalance | null>(null);
  const [amount, setAmount] = useState(0);

  const { data: promoters = [], isLoading } = useQuery({
    queryKey: ["promoters-with-balance", open],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase.from("promoters").select("id, name").order("name");
      if (error) throw error;
      const list: PromoterWithBalance[] = [];
      for (const p of data ?? []) {
        const { data: bal } = await supabase.rpc("promoter_active_balance", { _promoter_id: p.id });
        list.push({ id: p.id, name: p.name, balance: Number(bal ?? 0) });
      }
      return list;
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return promoters.filter((p) => !q || p.name.toLowerCase().includes(q));
  }, [promoters, search]);

  const reset = () => { setPicked(null); setSearch(""); setAmount(0); };

  const confirm = () => {
    if (!picked) return;
    const final = Math.min(amount, picked.balance, maxAmount);
    if (final <= 0) return;
    onPick(picked.id, picked.name, +final.toFixed(2));
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" /> Crédito de promoter
          </DialogTitle>
          <DialogDescription>
            Selecione o promoter e o valor a abater. Vale até {formatBRL(maxAmount)} desta venda.
          </DialogDescription>
        </DialogHeader>

        {!picked ? (
          <div className="space-y-3">
            <div className="relative">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar promoter..." className="pl-9" autoFocus />
            </div>
            <div className="max-h-72 overflow-y-auto border rounded-lg divide-y">
              {isLoading ? (
                <div className="p-6 text-center text-sm text-muted-foreground">Carregando...</div>
              ) : filtered.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">Nenhum promoter</div>
              ) : (
                filtered.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => { setPicked(p); setAmount(Math.min(p.balance, maxAmount)); }}
                    disabled={p.balance <= 0}
                    className="w-full p-3 text-left hover:bg-muted/40 flex items-center justify-between gap-2 disabled:opacity-40"
                  >
                    <span className="font-medium">{p.name}</span>
                    <Badge variant={p.balance > 0 ? "default" : "secondary"}>{formatBRL(p.balance)}</Badge>
                  </button>
                ))
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-lg border p-3 flex items-center justify-between">
              <div>
                <div className="text-xs text-muted-foreground">Promoter</div>
                <div className="font-semibold">{picked.name}</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-muted-foreground">Saldo</div>
                <div className="font-bold text-success">{formatBRL(picked.balance)}</div>
              </div>
            </div>
            <div>
              <Label>Valor a abater</Label>
              <CurrencyInput value={amount} onChange={setAmount} autoFocus />
              <p className="text-[11px] text-muted-foreground mt-1">
                Máximo: {formatBRL(Math.min(picked.balance, maxAmount))}
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setPicked(null)}>
              <UserCog className="h-3.5 w-3.5" /> trocar promoter
            </Button>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          {picked && (
            <Button onClick={confirm} disabled={amount <= 0 || amount > Math.min(picked.balance, maxAmount) + 0.005}>
              Usar {formatBRL(Math.min(amount, picked.balance, maxAmount))}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
