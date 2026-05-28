// Helpers for opening a print-friendly window with thermal-receipt styling.

export const RECEIPT_PRINT_STYLES = `
  @page { size: 80mm auto; margin: 0; }
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    background: #fff;
    color: #000;
    font-family: ui-monospace, "Courier New", monospace;
    font-size: 12px;
    line-height: 1.35;
    width: 80mm;
  }
  .sheet { padding: 6mm 4mm; width: 80mm; }
  .center { text-align: center; }
  .right { text-align: right; }
  .big { font-size: 22px; font-weight: 800; letter-spacing: 1px; }
  .huge { font-size: 32px; font-weight: 900; letter-spacing: 2px; }
  .small { font-size: 10px; }
  .muted { color: #444; }
  .row { display: flex; justify-content: space-between; gap: 6px; }
  hr { border: none; border-top: 1px dashed #000; margin: 6px 0; }
  .qr-wrap { display: flex; justify-content: center; padding: 4px 0; }
  .pagebreak { page-break-after: always; break-after: page; }
  .pagebreak:last-child { page-break-after: auto; break-after: auto; }
  @media screen {
    body { background: #f3f4f6; padding: 20px; }
    .sheet {
      background: #fff;
      box-shadow: 0 4px 20px rgba(0,0,0,.15);
      margin: 0 auto 12px;
    }
  }
`;

export function openPrintWindow(title: string, bodyHtml: string) {
  const w = window.open("", "_blank", "width=420,height=720");
  if (!w) {
    return false;
  }
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${RECEIPT_PRINT_STYLES}</style></head><body>${bodyHtml}<script>window.addEventListener('load',function(){setTimeout(function(){window.print();},100);});window.addEventListener('afterprint',function(){window.close();});</script></body></html>`);
  w.document.close();
  return true;
}

export function escapeHtml(s: string | number | null | undefined): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c] as string));
}

export function formatOrderNo(n: number | null | undefined): string {
  if (n == null) return "#—";
  return "#" + String(n).padStart(3, "0");
}
