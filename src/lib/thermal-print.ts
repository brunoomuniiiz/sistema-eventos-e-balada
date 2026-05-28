import { escapeHtml, formatOrderNo } from "./print-receipt";

export type PrintConfig = {
  method: 'system' | 'rawbt';
  paperWidth: '58mm' | '80mm';
};

export const DEFAULT_PRINT_CONFIG: PrintConfig = {
  method: 'system',
  paperWidth: '80mm',
};

export function getPrintConfig(): PrintConfig {
  const saved = localStorage.getItem('lojinha_print_config');
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch (e) {
      return DEFAULT_PRINT_CONFIG;
    }
  }
  return DEFAULT_PRINT_CONFIG;
}

export function savePrintConfig(config: PrintConfig) {
  localStorage.setItem('lojinha_print_config', JSON.stringify(config));
}

function timeBR(d?: string | Date) {
  const dt = d ? new Date(d) : new Date();
  return dt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

export function printWithRawBT(text: string) {
  // Protocolo RawBT para Android
  // Ver: https://rawbt.ru/help/protocol.html
  const base64 = btoa(unescape(encodeURIComponent(text)));
  const url = `rawbt:base64:${base64}`;
  window.location.href = url;
}

export function generateThermalTicket(opts: {
  bar_name: string | null;
  daily_number: number | null;
  product_name: string;
  unit_index?: number;
  unit_total?: number;
  waiter: string | null;
}): string {
  const config = getPrintConfig();
  const is58 = config.paperWidth === '58mm';
  const width = is58 ? 32 : 48; // Aprox caracteres por linha
  
  const center = (text: string) => {
    const pad = Math.max(0, Math.floor((width - text.length) / 2));
    return " ".repeat(pad) + text;
  };

  const hr = "-".repeat(width);

  let out = "";
  out += center(opts.bar_name?.toUpperCase() ?? "SISTEMA") + "\n";
  out += center(timeBR()) + "\n";
  out += hr + "\n\n";
  out += center("PEDIDO " + formatOrderNo(opts.daily_number)) + "\n\n";
  out += hr + "\n";
  out += center(opts.product_name.toUpperCase()) + "\n";
  if (opts.unit_total && opts.unit_total > 1) {
    out += center(`Unidade ${opts.unit_index} de ${opts.unit_total}`) + "\n";
  }
  out += hr + "\n";
  out += center("VALIDADO COM SUCESSO") + "\n";
  out += hr + "\n";
  out += (opts.waiter ?? "---") + " ".repeat(Math.max(1, width - (opts.waiter?.length ?? 0) - 10)) + timeBR().split(' ')[1] + "\n";
  out += "\n\n\n\n"; // Espaço para corte

  return out;
}
