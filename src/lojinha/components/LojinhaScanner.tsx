import { useEffect, useRef, useState } from "react";
import { usePermissions } from "@/hooks/usePermissions";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { Camera, KeyboardIcon, Printer, CheckCircle2, XCircle, Settings2 } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { orderLookupByToken, validateQr } from "@/lojinha/api";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { printUnitTickets, qrSvgString } from "@/lib/order-print";
import { useAuth } from "@/hooks/useAuth";
import { shouldPrintItem } from "@/lib/print-rules";
import { 
  getPrintConfig, 
  savePrintConfig, 
  generateThermalTicket, 
  printWithRawBT,
  concatUint8Arrays,
  PrintConfig 
} from "@/lib/thermal-print";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function LojinhaScanner() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { displayName } = usePermissions();
  const [scanning, setScanning] = useState(false);
  const [manual, setManual] = useState("");
  const [autoPrint, setAutoPrint] = useState(true);
  const [status, setStatus] = useState<{ type: 'success' | 'error' | 'idle', message: string }>({ type: 'idle', message: '' });
  const [printConfig, setPrintConfig] = useState<PrintConfig>(getPrintConfig());
  const ref = useRef<Html5Qrcode | null>(null);
  const lastTokenRef = useRef<string>("");

  const executePrint = async (opts: {
    bar_name: string | null;
    logo_url?: string | null;
    daily_number: number | null;
    waiter: string | null;
    tickets: any[];
    customer_name?: string | null;
    payment_method?: string | null;
    seller_type?: 'app' | 'staff';
  }) => {
    const printOpts = {
      ...opts,
      userId: user?.id,
      trigger: "scan" as const
    };
    if (printConfig.method === 'rawbt') {
      const tickets: Uint8Array[] = [];
      for (const [idx, t] of opts.tickets.entries()) {
        const shouldPrint = user?.id ? await shouldPrintItem(user.id, "scan", t.category_id || null, t.product_id) : true;
        if (!shouldPrint) continue;

        tickets.push(generateThermalTicket({
          bar_name: opts.bar_name,
          daily_number: opts.daily_number,
          product_name: t.product_name,
          description: t.description,
          waiter: opts.waiter,
          qr_token: t.qr_token,
          payment_method: opts.payment_method,
        }));
      }
      if (tickets.length > 0) {
        const fullBuffer = concatUint8Arrays(tickets);
        printWithRawBT(fullBuffer);
      }
    } else {
      await printUnitTickets(printOpts);
    }
  };

  async function handleToken(raw: string) {
    let token = raw.trim();
    if (!token) return;
    
    // Evita duplicidade se for o mesmo token processado recentemente
    if (token === lastTokenRef.current) return;
    lastTokenRef.current = token;
    
    if (token.includes("/")) token = token.split("/").pop() || token;
    if (token.includes("?")) token = token.split("?")[0];

    try {
      const lookup = await orderLookupByToken(token);
      
      if (lookup.ok) {
        // Se já foi entregue
        if (lookup.status === 'delivered') {
          const date = lookup.delivered_at ? new Date(lookup.delivered_at).toLocaleString('pt-BR') : '';
          const by = lookup.delivered_by_name || '';
          setStatus({ 
            type: 'error', 
            message: `Ticket já validado!\n${by ? `Por: ${by}` : ''}\n${date}` 
          });
          return;
        }

        if (autoPrint) {
          try {
            // Se for do tipo 'sale', validamos SEM imprimir (já foi impresso no PDV)
            if (lookup.source === 'sale') {
              setStatus({ type: 'success', message: 'Sucesso!\nValidado (Venda Local)' });
              // Efetiva a liberação no banco
              await supabase.rpc("order_release", { _source: 'sale', _id: lookup.id });
            } else {
              // Pedido Online (order) - Imprime pois o cliente só tem o QR no celular
              setStatus({ type: 'success', message: 'Sucesso!\nValidado (Imprimindo...)' });
              const { data: bar } = await supabase.from("bar_settings").select("bar_name, logo_url").maybeSingle();
              
              
              // Pedido Online (order)
              const { data: units } = await supabase
                .from("lojinha_order_units")
                .select("qr_token, product_name_snapshot, product_id, order_id, products(description, pickup_description)")
                .eq("order_id", lookup.id);
              
              if (units && units.length > 0) {
                const tickets = await Promise.all(units.map(async (u: any) => ({
                  product_name: u.product_name_snapshot,
                  description: u.products?.pickup_description || u.products?.description || null,
                  qr_token: u.qr_token,
                  qr_svg_string: await qrSvgString(u.qr_token),
                  product_id: u.product_id,
                  category_id: (u as any).category_id || null
                })));

                await executePrint({
                  bar_name: bar?.bar_name ?? null,
                  logo_url: bar?.logo_url ?? null,
                  daily_number: lookup.daily_number,
                  waiter: 'APP (Balcão)',
                  customer_name: lookup.customer_name,
                  tickets,
                  payment_method: lookup.payment_method,
                  seller_type: 'app'
                });
                
                await supabase.rpc("order_release", { _source: 'order', _id: lookup.id });
              }
            }
          } catch (printErr) {
            console.error("Erro no processamento:", printErr);
            toast.error("Erro ao imprimir ou validar");
          }
        } else {
          // Se autoPrint estiver desligado, abre a página de conferência
          await stop();
          navigate({ to: "/pedidos-liberar", search: { token } });
          return;
        }
      } else {
        // Fallback para unidades individuais (fluxo antigo)
        const res = await validateQr(token);
        if (res.ok) {
          setStatus({ type: 'success', message: 'Sucesso! Validado' });
          if (autoPrint) {
            const { data: bar } = await supabase.from("bar_settings").select("bar_name").maybeSingle();
            await executePrint({
              bar_name: bar?.bar_name ?? null,
              daily_number: null,
              waiter: null,
              tickets: [{
                product_name: res.product_name || "Produto",
                qr_token: token,
                qr_svg_string: await qrSvgString(token),
                product_id: (res as any).product_id,
                category_id: (res as any).category_id || null
              }],
            });
            await supabase.rpc("mark_units_printed", { _qr_tokens: [token] });
          }
        } else {
          let msg = "QR inválido";
          if (res.reason === "already_delivered") {
            const date = res.delivered_at ? new Date(res.delivered_at).toLocaleString('pt-BR') : '';
            msg = `Ticket já validado!\n${date}`;
          }
          setStatus({ type: 'error', message: msg });
        }
      }
    } catch (e) {
      setStatus({ type: 'error', message: e instanceof Error ? e.message : "Erro ao validar" });
    }

    // Limpa o status e permite nova leitura após 2.5s
    setTimeout(() => { 
      lastTokenRef.current = ""; 
      setStatus({ type: 'idle', message: '' });
    }, 2500);
  }

  async function start() {
    if (scanning) return;
    setScanning(true);
    try {
      // Pequeno delay para garantir que o elemento DOM está pronto
      await new Promise(r => setTimeout(r, 100));
      
      const inst = new Html5Qrcode("lojinha-qr-reader", {
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        verbose: false,
      });
      ref.current = inst;
      await inst.start(
        { facingMode: "environment" },
        { 
          fps: 20, 
          qrbox: (viewfinderWidth, viewfinderHeight) => {
            const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
            const size = Math.floor(minEdge * 0.9); // Aumentado para 90%
            return { width: size, height: size };
          },
          aspectRatio: 1.0 
        },
        (text) => handleToken(text),
        () => {}
      );
    } catch (e: any) {
      console.error("Erro ao abrir câmera:", e);
      toast.error("Não foi possível abrir a câmera. Verifique as permissões.");
      setScanning(false);
    }
  }

  async function stop() {
    try {
      if (ref.current && ref.current.isScanning) {
        await ref.current.stop();
        await ref.current.clear();
      }
    } catch (err) {
      console.warn("Erro ao parar câmera:", err);
    } finally {
      ref.current = null;
      setScanning(false);
    }
  }

  // Inicia a câmera automaticamente ao montar o componente
  useEffect(() => {
    start();
    return () => { void stop(); };
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between bg-muted/50 p-2 rounded-lg border gap-2">
        <div className="flex items-center gap-2">
          <Printer className="h-4 w-4 text-muted-foreground" />
          <Label htmlFor="auto-print" className="text-xs font-medium">Auto-Imprimir</Label>
          <Switch 
            id="auto-print" 
            checked={autoPrint} 
            onCheckedChange={setAutoPrint} 
            className="scale-75"
          />
        </div>

        <Dialog>
          <DialogTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <Settings2 className="h-4 w-4" />
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-[350px] rounded-xl">
            <DialogHeader>
              <DialogTitle>Configurações de Impressora</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Método de Impressão</Label>
                <Select 
                  value={printConfig.method} 
                  onValueChange={(val: 'system' | 'rawbt') => {
                    const next = { ...printConfig, method: val };
                    setPrintConfig(next);
                    savePrintConfig(next);
                    toast.success("Configuração salva");
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o método" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="system">Sistema (PDF/Navegador)</SelectItem>
                    <SelectItem value="rawbt">RawBT (Android Térmica)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground">
                  Use RawBT se tiver o app instalado no Android para impressão instantânea.
                </p>
              </div>

              <div className="space-y-2">
                <Label>Largura do Papel</Label>
                <Select 
                  value={printConfig.paperWidth} 
                  onValueChange={(val: '58mm' | '80mm') => {
                    const next = { ...printConfig, paperWidth: val };
                    setPrintConfig(next);
                    savePrintConfig(next);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a largura" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="58mm">58mm (Pequena)</SelectItem>
                    <SelectItem value="80mm">80mm (Grande)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative">
        <div className="space-y-3">
          <div 
            id="lojinha-qr-reader" 
            className={`rounded-lg overflow-hidden transition-all duration-300 border-2 border-primary/20 ${scanning ? 'bg-black aspect-square' : 'hidden'}`} 
          />
          {!scanning && (
            <Button onClick={start} className="w-full h-14 text-base">
              <Camera className="h-5 w-5 mr-2" /> Tentar abrir câmera novamente
            </Button>
          )}
          {scanning && (
            <Button variant="outline" onClick={stop} className="w-full">Parar câmera</Button>
          )}
        </div>

        {status.type !== 'idle' && (
          <div className={`absolute inset-0 flex flex-col items-center justify-center rounded-lg z-10 animate-in fade-in zoom-in duration-300 ${
            status.type === 'success' ? 'bg-success/90 text-success-foreground' : 'bg-destructive/90 text-destructive-foreground'
          }`}>
            {status.type === 'success' ? <CheckCircle2 className="h-20 w-20 mb-2" /> : <XCircle className="h-20 w-20 mb-2" />}
            <div className="text-xl font-bold px-4 text-center whitespace-pre-line leading-tight">{status.message}</div>
          </div>
        )}
      </div>

      <Card>
        <CardContent className="p-3">
          <label className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
            <KeyboardIcon className="h-3 w-3" /> Validar por código (se o QR não ler)
          </label>
          <div className="flex gap-2">
            <Input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="cole o token aqui" />
            <Button onClick={() => { handleToken(manual.trim()); setManual(""); }}>Validar</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
