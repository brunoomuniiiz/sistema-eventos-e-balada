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
  try {
    // Usamos TextEncoder para garantir UTF-8 correto antes do Base64
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const base64 = btoa(String.fromCharCode(...data));
    
    // O prefixo data:text/plain;base64 informa ao RawBT que deve processar o texto e suas tags
    const url = `intent:data:text/plain;base64,${base64}#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;end;`;
    
    console.log("Enviando para RawBT:", text);
    window.location.href = url;
  } catch (err) {
    console.error("Erro ao enviar para RawBT:", err);
    // Fallback simples se o Intent falhar
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
  
  // O RawBT processa tags de alinhamento por linha: [L], [C], [R]
  const hr = "-".repeat(is58 ? 32 : 48);

  let out = "";
  if (opts.is_test) {
    out += "[C]*** TESTE DE IMPRESSAO ***\n";
  }
  
  // Logotipo removido temporariamente a pedido do usuário
  /*
  if (opts.logo_url) {
    out += `[IMAGE]${opts.logo_url}[/IMAGE]\n`;
  }
  */
  
  out += `[C]${opts.bar_name?.toUpperCase() ?? "SISTEMA"}\n`;
  out += `[C]${timeBR()}\n`;
  if (opts.customer_name) {
    out += `[C]${opts.customer_name.toUpperCase()}\n`;
  }
  out += "[L]" + hr + "\n";
  out += `[C]PEDIDO ${formatOrderNo(opts.daily_number)}\n`;
  out += "[L]" + hr + "\n";
  out += `[C]${opts.product_name.toUpperCase()}\n`;
  if (opts.description) {
    out += `[C]${opts.description}\n`;
  }
  if (opts.unit_total && opts.unit_total > 1) {
    out += `[C]Unidade ${opts.unit_index} de ${opts.unit_total}\n`;
  }
  out += "[L]" + hr + "\n";
  
  if (opts.payment_method) {
    out += `[L]PAGAMENTO: ${opts.payment_method.toUpperCase()}\n`;
  }
  
  const sellerLabel = opts.seller_type === 'app' ? "VENDA: APP" : `VENDEDOR: ${opts.waiter?.toUpperCase() ?? "---"}`;
  out += `[L]${sellerLabel}\n`;
  out += "[L]" + hr + "\n";

  if (opts.qr_token) {
    out += "\n";
    out += `[QR]${opts.qr_token}[/QR]\n`;
    out += `[C]TOKEN: ${opts.qr_token.toUpperCase()}\n`;
    out += "\n";
  }
  
  out += `[C]${opts.is_test ? "CONEXAO OK" : "VALIDADO COM SUCESSO"}\n`;
  out += "[L]" + hr + "\n";
  out += `[C]${timeBR().split(' ')[1].slice(0, 8)}\n`;
  out += "\n\n\n\n\n"; // Espaço para corte extra

  return out;
}
