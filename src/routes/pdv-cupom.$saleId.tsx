import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL } from "@/lib/format";
import { formatOrderNo, RECEIPT_PRINT_STYLES } from "@/lib/print-receipt";

export const Route = createFileRoute("/pdv-cupom/$saleId")({
  component: CupomPage,
});

function CupomPage() {
  const { saleId } = Route.useParams();
  const printed = useRef(false);

  const { data, isLoading } = useQuery({
    queryKey: ["pdv-cupom", saleId],
    queryFn: async () => {
      const [{ data: sale }, { data: items }, { data: bar }] = await Promise.all([
        supabase.from("sales").select("id, total, payment_method, daily_number, pickup_token, created_at, category, consumacao_target").eq("id", saleId).maybeSingle(),
        supabase.from("sale_items").select("product_name, quantity, unit_price").eq("sale_id", saleId).order("created_at"),
        supabase.from("bar_settings").select("bar_name").maybeSingle(),
      ]);
      return { sale, items: items ?? [], bar };
    },
  });

  useEffect(() => {
    if (!data?.sale || printed.current) return;
    printed.current = true;
    
    // Marca as unidades como impressas no banco para evitar duplicidade no scanner
    const markAsPrinted = async () => {
      const { data: units } = await supabase
        .from("lojinha_order_units")
        .select("qr_token")
        .eq("order_id", saleId);
      
      if (units && units.length > 0) {
        const tokens = units.map(u => u.qr_token);
        await supabase.rpc("mark_units_printed", { _qr_tokens: tokens });
      }
    };
    
    void markAsPrinted();
    setTimeout(() => window.print(), 350);
  }, [data, saleId]);

  if (isLoading || !data?.sale) {
    return <div style={{ padding: 20, fontFamily: "monospace" }}>Carregando cupom…</div>;
  }

  const sale = data.sale as {
    id: string;
    total: number;
    payment_method: string | null;
    daily_number: number | null;
    pickup_token: string | null;
    created_at: string;
    category: string | null;
    consumacao_target: string | null;
  };
  const isConsumacao = sale.category === "consumacao";
  const TARGET_LABEL: Record<string, string> = {
    banda: "BANDA", dj: "DJ", seguranca: "SEGURANÇA", funcionario: "FUNCIONÁRIO", sorteio: "SORTEIO",
  };
  const bar = data.bar as { bar_name: string | null } | null;
  const items = data.items as { product_name: string; quantity: number; unit_price: number }[];

  return (
    <>
      <style>{RECEIPT_PRINT_STYLES}{`
        .actions { max-width: 80mm; margin: 12px auto; display: flex; gap: 8px; }
        .actions button { flex:1; padding: 10px; border-radius: 8px; border: 1px solid #ccc; background:#fff; cursor:pointer; font-family: inherit; }
        @media print { .actions { display: none; } }
        .consumacao-banner { border: 2px dashed #000; padding: 6px; margin: 6px 0; text-align: center; font-weight: 900; letter-spacing: 1px; }
        .consumacao-target { text-align: center; font-weight: 700; margin-top: 4px; }
        .consumacao-note { text-align: center; font-size: 10px; margin-top: 6px; font-style: italic; }
      `}</style>
      <div className="sheet">
        <div className="center big">{bar?.bar_name ?? "NightOps"}</div>
        <div className="center small muted">{new Date(sale.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</div>
        {isConsumacao && (
          <>
            <div className="consumacao-banner">*** CONSUMAÇÃO INTERNA ***<br/>NÃO É VENDA</div>
            {sale.consumacao_target && (
              <div className="consumacao-target">Destino: {TARGET_LABEL[sale.consumacao_target] ?? sale.consumacao_target.toUpperCase()}</div>
            )}
          </>
        )}
        <hr />
        <div className="center huge">{formatOrderNo(sale.daily_number)}</div>
        <hr />
        {items.map((i, idx) => (
          <div className="row" key={idx}>
            <span>{i.quantity}× {i.product_name}</span>
            <span>{isConsumacao ? "—" : formatBRL(i.unit_price * i.quantity)}</span>
          </div>
        ))}
        <hr />
        {isConsumacao ? (
          <>
            <div className="row big"><span>TOTAL</span><span>R$ 0,00</span></div>
            <div className="consumacao-note">
              Itens entregues como cortesia / consumo de equipe.<br/>
              Não compõem faturamento. Estoque baixado normalmente.
            </div>
          </>
        ) : (
          <>
            <div className="row big"><span>TOTAL</span><span>{formatBRL(Number(sale.total))}</span></div>
            <div className="row small muted"><span>Pagamento</span><span>{sale.payment_method ?? "—"}</span></div>
          </>
        )}
        {sale.pickup_token && !isConsumacao && (
          <>
            <hr />
            <div className="qr-wrap">
              <QRCodeSVG value={sale.pickup_token} size={180} level="M" />
            </div>
            <div className="center small">Apresente este QR ao garçom<br/>para retirar seu pedido</div>
          </>
        )}
      </div>
      <div className="actions">
        <button onClick={() => window.print()}>Imprimir novamente</button>
        <button onClick={() => window.close()}>Fechar</button>
      </div>
    </>
  );
}
