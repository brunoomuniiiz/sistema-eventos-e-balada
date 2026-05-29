import { escapeHtml, formatOrderNo } from "./print-receipt";

export type PrintConfig = {
  method: 'system' | 'rawbt';
  paperWidth: '58mm' | '80mm';
};

export const DEFAULT_PRINT_CONFIG: PrintConfig = {
  method: 'system',
  paperWidth: '58mm', // Padrão para mini impressoras Bluetooth
};

export function getPrintConfig(): PrintConfig {
  if (typeof window === 'undefined') return DEFAULT_PRINT_CONFIG;
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
  // Protocolo RawBT para Android via Intent
  // O formato Intent é mais robusto para abrir o app RawBT e passar os dados
  try {
    const base64 = btoa(unescape(encodeURIComponent(text)));
    // Usamos o esquema de Intent do Android para garantir que o app RawBT processe o base64
    const url = `intent:base64,${base64}#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;end;`;
    window.location.href = url;
  } catch (err) {
    console.error("Erro ao enviar para RawBT:", err);
    // Fallback para o esquema antigo se algo falhar na construção
    try {
      const base64 = btoa(unescape(encodeURIComponent(text)));
      window.location.href = `rawbt:base64:${base64}`;
    } catch (e) {
      console.error("Erro no fallback do RawBT:", e);
    }
  }
}

export function generateThermalTicket(opts: {
  bar_name: string | null;
  logo_url?: string | null;
  daily_number: number | null;
  product_name: string;
  description?: string | null;
  customer_name?: string | null;
  unit_index?: number;
  unit_total?: number;
  waiter: string | null;
  qr_token?: string | null;
  is_test?: boolean;
  payment_method?: string | null;
  seller_type?: 'app' | 'staff';
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
  if (opts.is_test) {
    out += center("*** TESTE DE IMPRESSAO ***") + "\n";
  }
  
  // Logotipo se disponível
  if (opts.logo_url) {
    out += `[C][IMAGE]${opts.logo_url}[/IMAGE]\n`;
  }
  
  out += center(opts.bar_name?.toUpperCase() ?? "SISTEMA") + "\n";
  out += center(timeBR()) + "\n";
  if (opts.customer_name) {
    out += center(opts.customer_name.toUpperCase()) + "\n";
  }
  out += hr + "\n\n";
  out += center("PEDIDO " + formatOrderNo(opts.daily_number)) + "\n\n";
  out += hr + "\n";
  out += center(opts.product_name.toUpperCase()) + "\n";
  if (opts.description) {
    out += center(opts.description) + "\n";
  }
  if (opts.unit_total && opts.unit_total > 1) {
    out += center(`Unidade ${opts.unit_index} de ${opts.unit_total}`) + "\n";
  }
  out += hr + "\n";
  
  if (opts.payment_method) {
    out += `PAGAMENTO: ${opts.payment_method.toUpperCase()}\n`;
  }
  
  const sellerLabel = opts.seller_type === 'app' ? "VENDA: APP" : `VENDEDOR: ${opts.waiter?.toUpperCase() ?? "---"}`;
  out += `${sellerLabel}\n`;
  out += hr + "\n";

  if (opts.qr_token) {
    // [QR] no RawBT aceita configurações, mas o formato básico [QR]conteudo[/QR] funciona
    // Adicionamos [C] para centralizar o QR code
    out += "\n[C][QR]" + opts.qr_token + "[/QR]\n\n";
  }
  
  out += center(opts.is_test ? "CONEXAO OK" : "VALIDADO COM SUCESSO") + "\n";
  out += hr + "\n";
  out += center(timeBR().split(' ')[1].slice(0, 8)) + "\n";
  out += "\n\n\n\n\n"; // Espaço para corte extra

  return out;
}
