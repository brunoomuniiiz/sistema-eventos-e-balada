import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

import { usePermissions } from "@/hooks/usePermissions";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { CompactTabsList, CompactTabsTrigger } from "@/components/ui/compact-tabs";
import { toast } from "sonner";
import {
  CalendarDays, Search, UserCheck, UserX, Crown, Users,
  Ticket, BarChart3, Wallet, LockKeyhole, History, ShoppingCart, ShieldCheck,
} from "lucide-react";
import { formatBRL } from "@/lib/format";
import { OpenCashDialog } from "@/components/vendas/OpenCashDialog";
import { CashClosingDialog } from "@/components/vendas/CashClosingDialog";
import { SessionWithdrawalsCard } from "@/components/vendas/SessionWithdrawalsCard";
import { CashGate } from "@/components/caixa/CashGate";
import { PixQrDialog } from "@/components/vendas/PixQrDialog";
import { AuthorizationDialog } from "@/components/AuthorizationDialog";
import { TicketCart, type CartLine } from "@/components/portaria/TicketCart";
import { SplitPaymentPanel, type SplitLine, type PaymentMethod } from "@/components/portaria/SplitPaymentPanel";
import { SaleDetailSheet, type PortariaSale } from "@/components/portaria/SaleDetailSheet";

export const Route = createFileRoute("/_app/portaria")({
  component: PortariaPage,
});

type Guest = {
  id: string;
  name: string;
  phone: string | null;
  gender: string | null;
  checked_in: boolean;
  checked_in_at: string | null;
  promoter_id: string;
};

type Promoter = { id: string; name: string };

function PortariaPage() {
  const { ownerId, isOwner, can, acceptedMethods, loading } = usePermissions();
  const allowed = isOwner || can("portaria");
  const qc = useQueryClient();

  const [eventId, setEventId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [openCash, setOpenCash] = useState(false);
  const [closingCash, setClosingCash] = useState(false);

  // Carrinho + split
  const [cart, setCart] = useState<CartLine[]>([]);
  const [payments, setPayments] = useState<SplitLine[]>([]);
  const [pixDialog, setPixDialog] = useState<{ open: boolean; amount: number }>({ open: false, amount: 0 });
  const [finalizing, setFinalizing] = useState(false);

  // PIN gate (sessão)
  const [pinToken, setPinToken] = useState<string | null>(null);
  const [pinDialog, setPinDialog] = useState<{ open: boolean; next: null | "report" | "history" | "refund" }>({ open: false, next: null });

  // Histórico
  const [openSale, setOpenSale] = useState<PortariaSale | null>(null);
  const [tab, setTab] = useState("lista");

  const { data: session, refetch: refetchSession } = useQuery({
    queryKey: ["portaria-cash-session"],
    enabled: allowed,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_my_open_session");
      if (error) throw error;
      return data as null | { id: string; opening_amount: number; opened_at: string };
    },
  });

  const { data: events = [] } = useQuery({
    queryKey: ["portaria-events", ownerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("id, name, date, status")
        .in("status", ["upcoming", "ongoing"])
        .order("date", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!ownerId && allowed,
  });

  useEffect(() => { if (!eventId && events.length > 0) setEventId(events[0].id); }, [events, eventId]);

  const { data: guests = [] } = useQuery({
    queryKey: ["portaria-guests", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("guest_list_entries")
        .select("id, name, phone, gender, checked_in, checked_in_at, promoter_id")
        .eq("event_id", eventId)
        .order("name");
      if (error) throw error;
      return data as Guest[];
    },
    enabled: !!eventId && allowed,
    refetchInterval: 8000,
  });

  const { data: promoters = [] } = useQuery({
    queryKey: ["portaria-promoters", ownerId],
    queryFn: async () => {
      const { data, error } = await supabase.from("promoters").select("id, name");
      if (error) throw error;
      return data as Promoter[];
    },
    enabled: !!ownerId && allowed,
  });
  const promoterMap = useMemo(() => {
    const m: Record<string, string> = {};
    promoters.forEach((p) => { m[p.id] = p.name; });
    return m;
  }, [promoters]);

  const { data: summary, refetch: refetchSummary } = useQuery({
    queryKey: ["portaria-summary", eventId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_portaria_summary", { _event_id: eventId });
      if (error) throw error;
      return data as Record<string, number>;
    },
    enabled: !!eventId && allowed,
    refetchInterval: 8000,
  });

  const { data: history = [], refetch: refetchHistory } = useQuery({
    queryKey: ["portaria-sales", eventId],
    enabled: !!eventId && allowed && (tab === "historico" || tab === "relatorio") && !!pinToken,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_portaria_sales", { _event_id: eventId });
      if (error) throw error;
      return (data ?? []) as PortariaSale[];
    },
  });

  const filteredGuests = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return guests;
    return guests.filter((g) =>
      g.name.toLowerCase().includes(q) || (g.phone ?? "").toLowerCase().includes(q));
  }, [guests, search]);

  const checkin = async (guest: Guest, checked: boolean) => {
    const { error } = await supabase.rpc("checkin_guest", { _entry_id: guest.id, _checked: checked });
    if (error) return toast.error(error.message);
    toast.success(checked ? `✓ ${guest.name} entrou` : `${guest.name} desfeito`);
    qc.invalidateQueries({ queryKey: ["portaria-guests", eventId] });
    refetchSummary();
  };

  const cartTotal = useMemo(() => cart.reduce((s, l) => s + l.amount * l.qty, 0), [cart]);
  const paidTotal = useMemo(() => payments.reduce((s, p) => s + p.amount, 0), [payments]);
  const fullyPaid = cart.length > 0 && Math.abs(paidTotal - cartTotal) < 0.01;

  const finalize = async () => {
    if (!session) return toast.error("Abra o caixa antes de registrar entradas");
    setFinalizing(true);
    try {
      const { error } = await supabase.rpc("register_event_entry_cart", {
        _event_id: eventId,
        _items: cart.map((l) => ({
          ticket_type_id: l.ticket_type_id,
          gender: l.gender,
          amount: l.amount,
          qty: l.qty,
        })) as unknown as never,
        _payments: payments.map((p) => ({ method: p.method, amount: p.amount })) as unknown as never,
      });
      if (error) throw error;
      toast.success(`Entrada registrada (${formatBRL(cartTotal)})`);
      setCart([]); setPayments([]);
      refetchSummary();
      refetchHistory();
      qc.invalidateQueries({ queryKey: ["session-withdrawals", session.id] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setFinalizing(false);
    }
  };

  if (loading) return null;
  if (!allowed) return <PageHeader title="Portaria" subtitle="Você não tem permissão para acessar esta página" />;

  if (events.length === 0) {
    return (
      <div>
        <PageHeader title="Portaria" subtitle="Nenhum evento aberto no momento" />
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          <CalendarDays className="h-10 w-10 mx-auto mb-3 opacity-50" />
          Crie um evento na aba Eventos para começar.
        </CardContent></Card>
      </div>
    );
  }

  const totalIn = summary?.total_in ?? 0;
  const listIn = summary?.list_checked_in ?? 0;
  const listTotal = summary?.list_total ?? 0;
  const payCount = summary?.paying_count ?? 0;
  const payValue = summary?.paying_value ?? 0;

  const requireUnlock = (next: "report" | "history" | "refund") => {
    if (pinToken) return true;
    setPinDialog({ open: true, next });
    return false;
  };

  const onApprovedPin = (token: string) => {
    setPinToken(token);
    if (pinDialog.next === "history") setTab("historico");
    if (pinDialog.next === "report") setTab("relatorio");
    setPinDialog({ open: false, next: null });
  };

  return (
    <div className="pb-8">
      <PageHeader title="Portaria" subtitle="Check-in da lista, carrinho de entradas e relatório ao vivo" />
      <CashGate sector="portaria" sectorLabel="Portaria">

      <div className="mb-4">
        <Label className="text-xs flex items-center gap-1 mb-1"><CalendarDays className="h-3 w-3" />Evento</Label>
        <Select value={eventId} onValueChange={setEventId}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {events.map((e) => (<SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>))}
          </SelectContent>
        </Select>
      </div>

      <Card className="mb-4">
        <CardContent className="p-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-sm">
            <Wallet className="h-4 w-4 text-primary" />
            {session ? (
              <span>Caixa <strong className="text-emerald-500">aberto</strong> · troco {formatBRL(Number(session.opening_amount))}</span>
            ) : (
              <span className="text-muted-foreground">Caixa fechado — abra para registrar entradas pagantes</span>
            )}
          </div>
          {!session ? (
            <Button size="sm" onClick={() => setOpenCash(true)}><Wallet className="h-4 w-4" /> Abrir caixa</Button>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setClosingCash(true)}><LockKeyhole className="h-4 w-4" /> Fechar caixa</Button>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <Card><CardContent className="p-3"><div className="text-[11px] uppercase text-muted-foreground">Total entrou</div><div className="text-2xl font-bold">{totalIn}</div></CardContent></Card>
        <Card><CardContent className="p-3"><div className="text-[11px] uppercase text-muted-foreground">Da lista</div><div className="text-2xl font-bold">{listIn}<span className="text-sm text-muted-foreground">/{listTotal}</span></div></CardContent></Card>
        <Card><CardContent className="p-3"><div className="text-[11px] uppercase text-muted-foreground">Pagantes</div><div className="text-2xl font-bold">{payCount}</div></CardContent></Card>
        <Card><CardContent className="p-3"><div className="text-[11px] uppercase text-muted-foreground">Receita portaria</div><div className="text-2xl font-bold text-gradient">{formatBRL(Number(payValue))}</div></CardContent></Card>
      </div>

      <Tabs value={tab} onValueChange={(v) => {
        if ((v === "historico" || v === "relatorio") && !pinToken) {
          setPinDialog({ open: true, next: v === "historico" ? "history" : "report" });
          return;
        }
        setTab(v);
      }} className="space-y-4">
        <CompactTabsList>
          <CompactTabsTrigger value="lista" icon={Users} short="Lista">Lista VIP</CompactTabsTrigger>
          <CompactTabsTrigger value="pagante" icon={Ticket} short="Pag.">Pagante</CompactTabsTrigger>
          <CompactTabsTrigger value="caixa" icon={Wallet} short="Cx.">Caixa</CompactTabsTrigger>
          <CompactTabsTrigger value="historico" icon={History} short="Hist.">Histórico</CompactTabsTrigger>
          <CompactTabsTrigger value="relatorio" icon={BarChart3} short="Rel.">Relatório</CompactTabsTrigger>
        </CompactTabsList>

        {/* LISTA */}
        <TabsContent value="lista" className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input autoFocus placeholder="Buscar nome ou telefone..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-12 text-base" />
          </div>
          {filteredGuests.length === 0 ? (
            <Card><CardContent className="py-10 text-center text-muted-foreground">{search ? "Nenhum nome encontrado" : "Lista vazia"}</CardContent></Card>
          ) : (
            <div className="space-y-2">
              {filteredGuests.map((g) => (
                <Card key={g.id} className={g.checked_in ? "bg-emerald-500/10 border-emerald-500/40" : ""}>
                  <CardContent className="p-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold truncate flex items-center gap-2">
                        {g.checked_in && <UserCheck className="h-4 w-4 text-emerald-500" />}
                        {g.name}
                        {g.gender && <Badge variant="outline" className="text-[10px]">{g.gender}</Badge>}
                      </div>
                      <div className="text-xs text-muted-foreground flex items-center gap-2">
                        <Crown className="h-3 w-3" />
                        {promoterMap[g.promoter_id] ?? "Casa"}
                        {g.phone && <span>· {g.phone}</span>}
                      </div>
                    </div>
                    {g.checked_in ? (
                      <Button variant="outline" size="sm" onClick={() => checkin(g, false)}><UserX className="h-4 w-4" /> Desfazer</Button>
                    ) : (
                      <Button size="sm" onClick={() => checkin(g, true)}><UserCheck className="h-4 w-4" /> Entrou</Button>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* PAGANTE — carrinho + split */}
        <TabsContent value="pagante" className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <ShoppingCart className="h-4 w-4 text-primary" /> Carrinho de ingressos
          </div>
          <TicketCart eventId={eventId} cart={cart} setCart={setCart} />

          {cart.length > 0 && (
            <>
              <div className="text-sm font-semibold mt-4">Pagamento</div>
              <SplitPaymentPanel
                total={cartTotal}
                accepted={(acceptedMethods as PaymentMethod[]).filter((m) => ["dinheiro","debito","credito","pix"].includes(m))}
                payments={payments}
                setPayments={setPayments}
                onPixRequested={(amt) => setPixDialog({ open: true, amount: amt })}
              />
              <Button
                size="lg"
                className="w-full h-14 text-base font-bold bg-gradient-primary text-primary-foreground"
                disabled={!fullyPaid || finalizing || !session}
                onClick={finalize}
              >
                {finalizing ? "Registrando..." : fullyPaid ? `Finalizar entrada · ${formatBRL(cartTotal)}` : "Complete o pagamento"}
              </Button>
              {!session && <p className="text-xs text-amber-500 text-center">Abra o caixa para registrar entradas pagantes.</p>}
            </>
          )}
        </TabsContent>

        {/* CAIXA */}
        <TabsContent value="caixa" className="space-y-3">
          {!session ? (
            <Card><CardContent className="p-6 text-center space-y-3">
              <Wallet className="h-10 w-10 mx-auto text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Abra o caixa com autorização para começar a vender entradas e registrar sangrias.</p>
              <Button onClick={() => setOpenCash(true)}><Wallet className="h-4 w-4" /> Abrir caixa</Button>
            </CardContent></Card>
          ) : (
            <>
              <SessionWithdrawalsCard />
              <Card><CardContent className="p-4 space-y-3">
                <div>
                  <h3 className="font-display font-bold">Fechamento da portaria</h3>
                  <p className="text-sm text-muted-foreground">Declare os totais de cada forma de pagamento. Requer autorização do responsável.</p>
                </div>
                <Button onClick={() => setClosingCash(true)} className="w-full md:w-auto"><LockKeyhole className="h-4 w-4" /> Iniciar fechamento</Button>
              </CardContent></Card>
            </>
          )}
        </TabsContent>

        {/* HISTÓRICO */}
        <TabsContent value="historico" className="space-y-2">
          {!pinToken ? (
            <Card><CardContent className="p-6 text-center space-y-3">
              <ShieldCheck className="h-10 w-10 mx-auto text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Histórico protegido. Desbloqueie com o PIN do dono.</p>
              <Button onClick={() => setPinDialog({ open: true, next: "history" })}><ShieldCheck className="h-4 w-4" /> Desbloquear com PIN</Button>
            </CardContent></Card>
          ) : history.length === 0 ? (
            <Card><CardContent className="py-10 text-center text-muted-foreground">Nenhuma venda registrada ainda.</CardContent></Card>
          ) : (
            <div className="space-y-1.5">
              {history.map((s) => {
                const cancelled = s.status === "cancelled";
                return (
                  <button
                    key={s.id}
                    onClick={() => setOpenSale(s)}
                    className={`w-full text-left rounded-lg border p-3 transition hover:border-primary/60 ${cancelled ? "border-destructive/40 bg-destructive/5 opacity-70" : "border-border bg-card"}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm">
                        <span className="font-bold">{formatBRL(Number(s.total))}</span>
                        <span className="text-muted-foreground"> · {s.items.length} ingresso{s.items.length === 1 ? "" : "s"}</span>
                        {cancelled && <Badge variant="destructive" className="ml-2 text-[10px]">Estornada</Badge>}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {new Date(s.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      {s.payments.map((p) => `${p.method} ${formatBRL(Number(p.amount))}`).join(" + ")} · {s.employee_name ?? "—"}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* RELATÓRIO */}
        <TabsContent value="relatorio" className="space-y-3">
          {!pinToken ? (
            <Card><CardContent className="p-6 text-center space-y-3">
              <ShieldCheck className="h-10 w-10 mx-auto text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Relatório protegido. Desbloqueie com o PIN do dono.</p>
              <Button onClick={() => setPinDialog({ open: true, next: "report" })}><ShieldCheck className="h-4 w-4" /> Desbloquear com PIN</Button>
            </CardContent></Card>
          ) : (
            <>
              <div className="grid sm:grid-cols-2 gap-3">
                <Card><CardContent className="p-4">
                  <div className="text-sm font-semibold mb-2">Lista convidados</div>
                  <Row label="Total na lista" value={listTotal} />
                  <Row label="Compareceram" value={listIn} />
                  <Row label="Mulheres na lista" value={summary?.list_female ?? 0} />
                  <Row label="Homens na lista" value={summary?.list_male ?? 0} />
                  <Row label="♀ entraram" value={summary?.list_in_female ?? 0} />
                  <Row label="♂ entraram" value={summary?.list_in_male ?? 0} />
                </CardContent></Card>
                <Card><CardContent className="p-4">
                  <div className="text-sm font-semibold mb-2">Pagantes</div>
                  <Row label="Total pagantes" value={payCount} />
                  <Row label="♀ pagantes" value={summary?.paying_female ?? 0} />
                  <Row label="♂ pagantes" value={summary?.paying_male ?? 0} />
                  <Row label="Receita portaria" value={formatBRL(Number(payValue))} />
                  <Row label="Ticket médio" value={payCount > 0 ? formatBRL(Number(payValue) / payCount) : "—"} />
                </CardContent></Card>
              </div>
              <Card><CardContent className="p-4">
                <div className="text-sm font-semibold mb-2">Total na casa agora</div>
                <div className="text-4xl font-bold text-gradient">{totalIn}</div>
                <div className="text-xs text-muted-foreground mt-1">Lista presente + pagantes</div>
              </CardContent></Card>
            </>
          )}
        </TabsContent>
      </Tabs>

      <OpenCashDialog open={openCash} onOpenChange={setOpenCash} onOpened={() => { refetchSession(); }} />
      <CashClosingDialog open={closingCash} onOpenChange={setClosingCash} onDone={() => { setClosingCash(false); refetchSession(); }} />

      {pixDialog.open && (
        <PixQrDialog
          open={pixDialog.open}
          onOpenChange={(o) => setPixDialog({ open: o, amount: pixDialog.amount })}
          amount={pixDialog.amount}
          description={`Entrada portaria · ${formatBRL(pixDialog.amount)}`}
          origin="pdv"
          sector="portaria"
          onApproved={async () => {
            setPayments((prev) => [...prev, { key: `pix-${Date.now()}`, method: "pix", amount: pixDialog.amount }]);
            setPixDialog({ open: false, amount: 0 });
          }}
        />
      )}

      <AuthorizationDialog
        open={pinDialog.open}
        onOpenChange={(o) => setPinDialog({ open: o, next: pinDialog.next })}
        scope={pinDialog.next === "refund" ? "refund" : pinDialog.next === "report" ? "report" : "operation"}
        title="Desbloquear com PIN"
        description="Digite o PIN do dono para acessar histórico, relatórios e estornos."
        onApproved={(token) => onApprovedPin(token)}
      />

      <SaleDetailSheet
        open={!!openSale}
        onOpenChange={(o) => { if (!o) setOpenSale(null); }}
        sale={openSale}
        grantToken={pinToken}
        onRequestUnlock={() => setPinDialog({ open: true, next: "refund" })}
        onDone={() => { refetchHistory(); refetchSummary(); }}
      />
      </CashGate>
    </div>
  );
}

function Row({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex justify-between py-1 text-sm border-b border-border/50 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}
