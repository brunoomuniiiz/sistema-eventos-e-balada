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

/**
 * Concatena múltiplos Uint8Arrays em um único buffer.
 */
export function concatUint8Arrays(arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((acc, arr) => acc + arr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

export function printWithRawBT(data: string | Uint8Array) {
  // Protocolo RawBT para Android via Intent
  try {
    let base64 = "";
    
    // Conversão eficiente de binário para base64 que evita estouro de pilha
    if (typeof data === 'string') {
      const encoder = new TextEncoder();
      const bytes = encoder.encode(data);
      base64 = btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join(''));
    } else {
      // Chunking para evitar erro de limite de argumentos em strings gigantes
      const CHUNK_SIZE = 0x8000;
      let binary = "";
      for (let i = 0; i < data.length; i += CHUNK_SIZE) {
        binary += String.fromCharCode.apply(null, Array.from(data.subarray(i, i + CHUNK_SIZE)));
      }
      base64 = btoa(binary);
    }
    
    /**
     * O RawBT suporta vários formatos de intent.
     * O formato "intent:base64,DATA#Intent;scheme=rawbt;..." é frequentemente o mais estável
     * para dados binários puros (application/octet-stream).
     */
    const url = `intent:base64,${base64}#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;end;`;
    
    console.log(`Enviando ${base64.length} caracteres base64 para RawBT`);
    window.location.href = url;
  } catch (err) {
    console.error("Erro ao enviar para RawBT:", err);
  }
}

/**
 * Gera um buffer ESC/POS binário para o ticket.
 */
export function generateThermalTicket(opts: {
  bar_name: string | null;
  daily_number: number | null;
  product_name: string;
  description?: string | null;
  waiter: string | null;
  qr_token?: string | null;
  is_test?: boolean;
  payment_method?: string | null;
}): Uint8Array {
  const chunks: Uint8Array[] = [];
  const encoder = new TextEncoder();
  
  const add = (bytes: number[] | string) => {
    if (typeof bytes === 'string') {
      chunks.push(encoder.encode(bytes));
    } else {
      chunks.push(new Uint8Array(bytes));
    }
  };

  // 1. Inicializar impressora
  add([0x1B, 0x40]);

  // 2. Cabeçalho (Centralizado)
  add([0x1B, 0x61, 0x01]); // Alinhamento centro
  if (opts.is_test) add("*** TESTE DE IMPRESSAO ***\n");
  
  // NOME DO BAR
  add(opts.bar_name?.toUpperCase() ?? "HAPPY BEER");
  add("\n");
  
  // Data e Horário (Tamanho menor se possível, ou apenas normal)
  add([0x1B, 0x21, 0x01]); // Fonte B (menor)
  add(timeBR() + "\n");
  add([0x1B, 0x21, 0x00]); // Fonte A (normal)
  
  add("--------------------------------\n");

  // 3. Identificação do Pedido
  add([0x1B, 0x61, 0x00]); // Alinhamento esquerda
  add(`PEDIDO ${formatOrderNo(opts.daily_number)}\n`);

  // 4. Produto em Destaque (GRANDE)
  // GS ! 0x11 = Dobro de largura e altura
  add([0x1D, 0x21, 0x11]); 
  add(opts.product_name.toUpperCase() + "\n");
  add([0x1D, 0x21, 0x00]); // Volta ao normal

  // 5. Descrição (MENOR)
  if (opts.description) {
    add([0x1B, 0x21, 0x01]); // Fonte B
    add(opts.description + "\n");
    add([0x1B, 0x21, 0x00]); // Volta ao normal
  }

  add("--------------------------------\n");

  // 6. QR Code Nativo ESC/POS
  if (opts.qr_token) {
    const store = opts.qr_token;
    const len = store.length + 3;
    const pL = len % 256;
    const pH = Math.floor(len / 256);

    add([0x1B, 0x61, 0x01]); // Centro
    // Set QR code size
    add([0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x43, 0x06]);
    // Set error correction level
    add([0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x45, 0x31]);
    // Store data in symbol storage area
    add([0x1D, 0x28, 0x6B, pL, pH, 0x31, 0x50, 0x30]);
    add(store);
    // Print symbol
    add([0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x51, 0x30]);
    
    add("\n");
    // Token em negrito e completo (sem truncamento)
    add([0x1B, 0x45, 0x01]); // Bold ON
    add(`TOKEN: ${opts.qr_token}\n`);
    add([0x1B, 0x45, 0x00]); // Bold OFF
    add("\n");
  }

  // 7. Informações Extras (MENOR)
  add([0x1B, 0x61, 0x00]); // Esquerda
  add([0x1B, 0x21, 0x01]); // Fonte B
  
  // Nome do vendedor (prioriza apelido/displayName)
  const waiterName = opts.waiter || "SISTEMA";
  const firstName = waiterName.includes('@') 
    ? (waiterName.split('@')[0].charAt(0).toUpperCase() + waiterName.split('@')[0].slice(1).toLowerCase())
    : waiterName;
  add(`VENDEDOR: ${firstName}\n`);
  
  if (opts.payment_method) {
    add(`PAGAMENTO: ${opts.payment_method.toUpperCase()}\n`);
  }
  
  add(`HORA: ${timeBR().split(' ')[1].slice(0, 5)}\n`);
  add([0x1B, 0x21, 0x00]); // Volta ao normal

  // 8. Mensagem de Encerramento (Centralizado)
  add([0x1B, 0x61, 0x01]);
  add("Obrigado por escolher a gente!\n");
  
  // Avanço de papel
  add("\n\n\n\n\n");
  add([0x1D, 0x56, 0x41, 0x00]); // Cut command (opcional, algumas impressoras ignoram)

  return concatUint8Arrays(chunks);
}
