// Build HTML for printable PDV receipt and combo prep slips.
import QRCode from "qrcode";
import { escapeHtml, formatOrderNo, openPrintWindow } from "./print-receipt";

export async function qrSvgString(value: string): Promise<string> {
  return QRCode.toString(value, { type: "svg", margin: 0, width: 200, errorCorrectionLevel: "M" });
}

export type ReceiptItem = {
  product_name: string;
  quantity: number;
  unit_price: number;
};

export type PrepSlip = {
  daily_number: number | null;
  bar_name: string | null;
  item_name: string;
  unit_index: number;
  unit_total: number;
  components: { name: string; qty: number }[];
  waiter: string | null;
  created_at: string;
};

const BRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function timeBR(d?: string | Date) {
  const dt = d ? new Date(d) : new Date();
  return dt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

export function printReceipt(opts: {
  daily_number: number | null;
  bar_name: string | null;
  items: ReceiptItem[];
  total: number;
  payment_method: string | null;
  qr_svg_string: string;
  pickup_token: string;
}): boolean {
  const itemsHtml = opts.items
    .map(
      (i) => `
        <div class="row">
          <span>${i.quantity}× ${escapeHtml(i.product_name)}</span>
          <span>${BRL(i.unit_price * i.quantity)}</span>
        </div>`,
    )
    .join("");

  const body = `
    <div class="sheet">
      <div class="center big">${escapeHtml(opts.bar_name ?? "NightOps")}</div>
      <div class="center small muted">${escapeHtml(timeBR())}</div>
      <hr />
      <div class="center huge">${escapeHtml(formatOrderNo(opts.daily_number))}</div>
      <hr />
      ${itemsHtml}
      <hr />
      <div class="row big"><span>TOTAL</span><span>${BRL(opts.total)}</span></div>
      <div class="row small muted"><span>Pagamento</span><span>${escapeHtml(opts.payment_method ?? "—")}</span></div>
      <hr />
      <div class="qr-wrap">${opts.qr_svg_string}</div>
      <div class="center small">Apresente este QR ao garçom<br/>para retirar seu pedido</div>
      <div class="center small muted" style="margin-top:6px;word-break:break-all">${escapeHtml(opts.pickup_token)}</div>
    </div>
  `;
  return openPrintWindow(`Cupom ${formatOrderNo(opts.daily_number)}`, body);
}

export function printPrepSlips(slips: PrepSlip[]): boolean {
  if (slips.length === 0) return true;
  const pages = slips
    .map((s) => {
      const comps = (s.components ?? [])
        .map(
          (c) => `<div class="row"><span>• ${escapeHtml(c.name)}</span><span>×${c.qty}</span></div>`,
        )
        .join("");
      return `
        <div class="sheet pagebreak">
          <div class="center small muted">${escapeHtml(s.bar_name ?? "PREPARO")}</div>
          <div class="center huge">${escapeHtml(formatOrderNo(s.daily_number))}</div>
          <hr />
          <div class="center big">${escapeHtml(s.item_name)}</div>
          ${s.unit_total > 1 ? `<div class="center small muted">Unidade ${s.unit_index} de ${s.unit_total}</div>` : ""}
          <hr />
          ${comps || '<div class="center small muted">Sem componentes cadastrados</div>'}
          <hr />
          <div class="row small muted"><span>${escapeHtml(s.waiter ?? "—")}</span><span>${escapeHtml(timeBR(s.created_at))}</span></div>
        </div>
      `;
    })
    .join("");
  return openPrintWindow(`Preparo ${formatOrderNo(slips[0].daily_number)}`, pages);
}
