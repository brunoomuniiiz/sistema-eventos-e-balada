import { useEffect, useRef, useState } from "react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { Camera, KeyboardIcon, Printer, CheckCircle2, XCircle } from "lucide-react";
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

export function LojinhaScanner() {
  const navigate = useNavigate();
  const [scanning, setScanning] = useState(false);
  const [manual, setManual] = useState("");
  const [autoPrint, setAutoPrint] = useState(true);
  const [status, setStatus] = useState<{ type: 'success' | 'error' | 'idle', message: string }>({ type: 'idle', message: '' });
  const ref = useRef<Html5Qrcode | null>(null);
  const lastTokenRef = useRef<string>("");

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
          setStatus({ type: 'success', message: 'Sucesso! Validado' });
          
          try {
            // Se for do tipo 'sale', precisamos imprimir e marcar como entregue
            if (lookup.source === 'sale') {
              const { data: bar } = await supabase.from("bar_settings").select("bar_name").maybeSingle();
              
              // Gera os tickets baseados nos itens da venda
              const tickets: any[] = [];
              for (const item of lookup.items) {
                // Se for combo, deveria expandir? Por enquanto 1 ticket por item
                for (let i = 0; i < item.quantity; i++) {
                  tickets.push({
                    product_name: item.product_name,
                    qr_token: token, // Usa o token principal para o QR da ficha
                    qr_svg_string: await qrSvgString(token),
                  });
                }
              }

              printUnitTickets({
                bar_name: bar?.bar_name ?? null,
                daily_number: lookup.daily_number,
                waiter: lookup.customer_name || 'Balcão',
                tickets,
              });

              // Efetiva a liberação no banco
              await supabase.rpc("order_release", { _source: 'sale', _id: lookup.id });
            } else {
              // Pedido Online (order)
              const { data: units } = await supabase
                .from("lojinha_order_units")
                .select("qr_token, product_name_snapshot, product_id, order_id")
                .eq("order_id", lookup.id);
              
              const { data: bar } = await supabase.from("bar_settings").select("bar_name").maybeSingle();

              if (units && units.length > 0) {
                const tickets = await Promise.all(units.map(async (u) => ({
                  product_name: u.product_name_snapshot,
                  qr_token: u.qr_token,
                  qr_svg_string: await qrSvgString(u.qr_token),
                })));

                printUnitTickets({
                  bar_name: bar?.bar_name ?? null,
                  daily_number: lookup.daily_number,
                  waiter: lookup.customer_name || 'Cliente',
                  tickets,
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
            printUnitTickets({
              bar_name: bar?.bar_name ?? null,
              daily_number: null,
              waiter: null,
              tickets: [{
                product_name: res.product_name || "Produto",
                qr_token: token,
                qr_svg_string: await qrSvgString(token),
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
            const size = Math.floor(minEdge * 0.8);
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
      <div className="flex items-center justify-between bg-muted/50 p-3 rounded-lg border">
        <div className="flex items-center gap-2">
          <Printer className="h-4 w-4 text-muted-foreground" />
          <Label htmlFor="auto-print" className="text-sm font-medium">Impressão Automática</Label>
        </div>
        <Switch 
          id="auto-print" 
          checked={autoPrint} 
          onCheckedChange={setAutoPrint} 
        />
      </div>

      <div className="relative">
        <div className="space-y-3">
          <div 
            id="lojinha-qr-reader" 
            className={`rounded-lg overflow-hidden transition-all duration-300 ${scanning ? 'bg-black aspect-square' : 'h-0 opacity-0'}`} 
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
