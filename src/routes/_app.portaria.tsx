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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  CalendarDays, Search, UserCheck, UserX, Crown, Users,
  Ticket, BarChart3, Plus, Wallet, LockKeyhole,
} from "lucide-react";
import { formatBRL } from "@/lib/format";
import { OpenCashDialog } from "@/components/vendas/OpenCashDialog";
import { CashClosingDialog } from "@/components/vendas/CashClosingDialog";
import { SessionWithdrawalsCard } from "@/components/vendas/SessionWithdrawalsCard";

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
  const { user } = useAuth();
  const { ownerId, isOwner, can, acceptedMethods, loading } = usePermissions();
  const allowed = isOwner || can("portaria");
  const qc = useQueryClient();

  const [eventId, setEventId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [payAmount, setPayAmount] = useState<string>("");
  const [payGender, setPayGender] = useState<string>("");
  const [payMethod, setPayMethod] = useState<"dinheiro" | "debito" | "credito" | "pix">(
    (acceptedMethods[0] as "dinheiro" | "debito" | "credito" | "pix") ?? "dinheiro",
  );
  const [openCash, setOpenCash] = useState(false);
  const [closingCash, setClosingCash] = useState(false);

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

  useEffect(() => {
    if (!eventId && events.length > 0) setEventId(events[0].id);
  }, [events, eventId]);

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
    queryKey: ["portaria-promoters", ownerId, eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("promoters")
        .select("id, name");
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

  const filteredGuests = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return guests;
    return guests.filter((g) =>
      g.name.toLowerCase().includes(q) ||
      (g.phone ?? "").toLowerCase().includes(q),
    );
  }, [guests, search]);

  const checkin = async (guest: Guest, checked: boolean) => {
    const { error } = await supabase.rpc("checkin_guest", {
      _entry_id: guest.id,
      _checked: checked,
    });
    if (error) return toast.error(error.message);
    toast.success(checked ? `✓ ${guest.name} entrou` : `${guest.name} desfeito`);
    qc.invalidateQueries({ queryKey: ["portaria-guests", eventId] });
    refetchSummary();
  };

  const addPaying = async () => {
    if (!ownerId || !eventId) return;
    if (!session?.id) return toast.error("Abra o caixa antes de registrar entradas");
    const amount = Number((payAmount || "0").replace(",", "."));
    if (!Number.isFinite(amount) || amount < 0) return toast.error("Valor inválido");
    const { error } = await supabase.rpc("register_event_entry", {
      _event_id: eventId,
      _ticket_type_id: null as unknown as string,
      _gender: payGender || null as unknown as string,
      _amount: amount,
      _payment_method: payMethod,
      _notes: null as unknown as string,
    });
    if (error) return toast.error(error.message);
    toast.success(`+1 pagante (${formatBRL(amount)})`);
    setPayAmount("");
    setPayGender("");
    refetchSummary();
    qc.invalidateQueries({ queryKey: ["session-withdrawals", session.id] });
  };

  if (loading) return null;
  if (!allowed) {
    return <PageHeader title="Portaria" subtitle="Você não tem permissão para acessar esta página" />;
  }

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

  return (
    <div className="pb-8">
      <PageHeader title="Portaria" subtitle="Check-in da lista, entradas pagantes e relatório ao vivo" />

      {/* Evento ativo */}
      <div className="mb-4">
        <Label className="text-xs flex items-center gap-1 mb-1"><CalendarDays className="h-3 w-3" />Evento</Label>
        <Select value={eventId} onValueChange={setEventId}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {events.map((e) => (
              <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Status do caixa */}
      <Card className="mb-4">
        <CardContent className="p-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-sm">
            <Wallet className="h-4 w-4 text-primary" />
            {session ? (
              <span>
                Caixa <strong className="text-emerald-500">aberto</strong> · troco {formatBRL(Number(session.opening_amount))}
              </span>
            ) : (
              <span className="text-muted-foreground">Caixa fechado — abra para registrar entradas pagantes</span>
            )}
          </div>
          {!session ? (
            <Button size="sm" onClick={() => setOpenCash(true)}>
              <Wallet className="h-4 w-4" /> Abrir caixa
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setClosingCash(true)}>
              <LockKeyhole className="h-4 w-4" /> Fechar caixa
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Resumo ao vivo */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <Card><CardContent className="p-3">
          <div className="text-[11px] uppercase text-muted-foreground">Total entrou</div>
          <div className="text-2xl font-bold">{totalIn}</div>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <div className="text-[11px] uppercase text-muted-foreground">Da lista</div>
          <div className="text-2xl font-bold">{listIn}<span className="text-sm text-muted-foreground">/{listTotal}</span></div>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <div className="text-[11px] uppercase text-muted-foreground">Pagantes</div>
          <div className="text-2xl font-bold">{payCount}</div>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <div className="text-[11px] uppercase text-muted-foreground">Receita portaria</div>
          <div className="text-2xl font-bold text-gradient">{formatBRL(Number(payValue))}</div>
        </CardContent></Card>
      </div>

      <Tabs defaultValue="lista" className="space-y-4">
        <TabsList>
          <TabsTrigger value="lista" className="gap-1"><Users className="h-4 w-4" />Lista VIP</TabsTrigger>
          <TabsTrigger value="pagante" className="gap-1"><Ticket className="h-4 w-4" />Pagante</TabsTrigger>
          <TabsTrigger value="caixa" className="gap-1"><Wallet className="h-4 w-4" />Caixa</TabsTrigger>
          <TabsTrigger value="relatorio" className="gap-1"><BarChart3 className="h-4 w-4" />Relatório</TabsTrigger>
        </TabsList>

        {/* LISTA */}
        <TabsContent value="lista" className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              autoFocus
              placeholder="Buscar nome ou telefone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-12 text-base"
            />
          </div>

          {filteredGuests.length === 0 ? (
            <Card><CardContent className="py-10 text-center text-muted-foreground">
              {search ? "Nenhum nome encontrado" : "Lista vazia"}
            </CardContent></Card>
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
                      <Button variant="outline" size="sm" onClick={() => checkin(g, false)}>
                        <UserX className="h-4 w-4" /> Desfazer
                      </Button>
                    ) : (
                      <Button size="sm" onClick={() => checkin(g, true)}>
                        <UserCheck className="h-4 w-4" /> Entrou
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* PAGANTE */}
        <TabsContent value="pagante" className="space-y-3">
          <Card><CardContent className="p-4 space-y-3">
            <div>
              <Label>Valor pago</Label>
              <Input
                type="number"
                inputMode="decimal"
                step="0.50"
                min={0}
                placeholder="0,00"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                className="h-12 text-lg"
              />
            </div>
            <div>
              <Label>Gênero (opcional)</Label>
              <div className="flex gap-2">
                {[{k:"M",l:"Masculino"},{k:"F",l:"Feminino"},{k:"",l:"Não informar"}].map((g) => (
                  <Button
                    key={g.l}
                    type="button"
                    variant={payGender === g.k ? "default" : "outline"}
                    onClick={() => setPayGender(g.k)}
                    className="flex-1"
                  >{g.l}</Button>
                ))}
              </div>
            </div>
            <div>
              <Label>Forma de pagamento</Label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {([
                  { k: "dinheiro", l: "Dinheiro" },
                  { k: "pix", l: "Pix" },
                  { k: "debito", l: "Débito" },
                  { k: "credito", l: "Crédito" },
                ] as const).filter((m) => acceptedMethods.includes(m.k)).map((m) => (
                  <Button
                    key={m.k}
                    type="button"
                    variant={payMethod === m.k ? "default" : "outline"}
                    onClick={() => setPayMethod(m.k)}
                  >{m.l}</Button>
                ))}
              </div>
            </div>
            <Button size="lg" className="w-full h-14 text-base font-bold" onClick={addPaying} disabled={!session}>
              <Plus className="h-5 w-5" /> Registrar entrada pagante
            </Button>
            {!session && (
              <p className="text-xs text-amber-500 text-center">Abra o caixa para registrar entradas pagantes.</p>
            )}
          </CardContent></Card>
          <p className="text-xs text-muted-foreground text-center">
            As entradas pagantes contam no total da portaria e somam à receita do evento.
          </p>
        </TabsContent>

        {/* CAIXA */}
        <TabsContent value="caixa" className="space-y-3">
          {!session ? (
            <Card><CardContent className="p-6 text-center space-y-3">
              <Wallet className="h-10 w-10 mx-auto text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Abra o caixa com autorização para começar a vender entradas e registrar sangrias.
              </p>
              <Button onClick={() => setOpenCash(true)}>
                <Wallet className="h-4 w-4" /> Abrir caixa
              </Button>
            </CardContent></Card>
          ) : (
            <>
              <SessionWithdrawalsCard />
              <Card><CardContent className="p-4 space-y-3">
                <div>
                  <h3 className="font-display font-bold">Fechamento da portaria</h3>
                  <p className="text-sm text-muted-foreground">
                    Declare os totais de cada forma de pagamento. Requer autorização do responsável.
                  </p>
                </div>
                <Button onClick={() => setClosingCash(true)} className="w-full md:w-auto">
                  <LockKeyhole className="h-4 w-4" /> Iniciar fechamento
                </Button>
              </CardContent></Card>
            </>
          )}
        </TabsContent>

        {/* RELATÓRIO */}
        <TabsContent value="relatorio" className="space-y-3">
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
        </TabsContent>
      </Tabs>

      <OpenCashDialog
        open={openCash}
        onOpenChange={setOpenCash}
        onOpened={() => { refetchSession(); }}
      />
      <CashClosingDialog
        open={closingCash}
        onOpenChange={setClosingCash}
        onDone={() => { setClosingCash(false); refetchSession(); }}
      />
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
