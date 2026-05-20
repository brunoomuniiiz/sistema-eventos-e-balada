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
        supabase.from("sales").select("*").eq("id", saleId).maybeSingle(),
        supabase.from("sale_items").select("product_name, quantity, unit_price").eq("sale_id", saleId).order("created_at"),
        supabase.from("bar_settings").select("bar_name").maybeSingle(),
      ]);
      return { sale, items: items ?? [], bar };
    },
  });

  useEffect(() => {
    if (!data?.sale || printed.current) return;
    printed.current = true;
    setTimeout(() => window.print(), 350);
  }, [data]);

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
  };
  const bar = data.bar as { bar_name: string | null } | null;
  const items = data.items as { product_name: string; quantity: number; unit_price: number }[];

  return (
    <>
      <style>{RECEIPT_PRINT_STYLES}{`
        .actions { max-width: 80mm; margin: 12px auto; display: flex; gap: 8px; }
        .actions button { flex:1; padding: 10px; border-radius: 8px; border: 1px solid #ccc; background:#fff; cursor:pointer; font-family: inherit; }
        @media print { .actions { display: none; } }
      `}</style>
      <div className="sheet">
        <div className="center big">{bar?.bar_name ?? "NightOps"}</div>
        <div className="center small muted">{new Date(sale.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</div>
        <hr />
        <div className="center huge">{formatOrderNo(sale.daily_number)}</div>
        <hr />
        {items.map((i, idx) => (
          <div className="row" key={idx}>
            <span>{i.quantity}× {i.product_name}</span>
            <span>{formatBRL(i.unit_price * i.quantity)}</span>
          </div>
        ))}
        <hr />
        <div className="row big"><span>TOTAL</span><span>{formatBRL(Number(sale.total))}</span></div>
        <div className="row small muted"><span>Pagamento</span><span>{sale.payment_method ?? "—"}</span></div>
        {sale.pickup_token && (
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
