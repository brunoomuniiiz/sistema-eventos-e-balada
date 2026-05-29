// Helpers for opening a print-friendly window with thermal-receipt styling.

export const RECEIPT_PRINT_STYLES = `
  @page { 
    size: 58mm auto; 
    margin: 0; 
  }
  * { 
    box-sizing: border-box; 
    -webkit-print-color-adjust: exact;
  }
  html, body {
    margin: 0;
    padding: 0;
    background: #fff;
    color: #000;
    font-family: "Courier New", Courier, monospace;
    font-size: 11px;
    line-height: 1.2;
    width: 58mm;
  }
  .sheet { 
    padding: 2mm; 
    width: 58mm; 
    overflow: hidden;
  }
  .center { text-align: center; }
  .right { text-align: right; }
  .bold { font-weight: bold; }
  .big { font-size: 16px; font-weight: bold; }
  .huge { font-size: 24px; font-weight: bold; }
  .row { display: flex; justify-content: space-between; gap: 2px; }
  hr { border: none; border-top: 1px dashed #000; margin: 4px 0; }
  .qr-wrap { display: flex; justify-content: center; padding: 4px 0; }
  .qr-wrap svg { width: 140px !important; height: 140px !important; }
  .pagebreak { page-break-after: always; break-after: page; }
  .pagebreak:last-child { page-break-after: auto; break-after: auto; }
  
  @media screen {
    body { background: #f3f4f6; padding: 20px; width: 100%; }
    .sheet {
      background: #fff;
      box-shadow: 0 4px 20px rgba(0,0,0,.15);
      margin: 0 auto 12px;
      width: 58mm;
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
