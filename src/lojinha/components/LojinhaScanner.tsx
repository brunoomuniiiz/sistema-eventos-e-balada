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
    if (!token || token === lastTokenRef.current) return;
    lastTokenRef.current = token;
    
    if (token.includes("/")) token = token.split("/").pop() || token;
    if (token.includes("?")) token = token.split("?")[0];

    try {
      // Tenta pedido novo (sale ou order via pickup_token)
      const lookup = await orderLookupByToken(token);
      
      if (lookup.ok) {
        if (autoPrint) {
          setStatus({ type: 'success', message: 'Pedido Validado!' });
          // Lógica de auto-impressão
          try {
            const { data: units } = await supabase
              .from("lojinha_order_units")
              .select("qr_token, product_name_snapshot, product_id, order_id")
              .eq("order_id", lookup.id);
            
            const { data: order } = await supabase
              .from("lojinha_orders")
              .select("daily_number, seller_name")
              .eq("id", lookup.id)
              .maybeSingle();

            const { data: bar } = await supabase.from("bar_settings").select("bar_name").maybeSingle();

            if (units && units.length > 0) {
              const tickets = await Promise.all(units.map(async (u) => ({
                product_name: u.product_name_snapshot,
                qr_token: u.qr_token,
                qr_svg_string: await qrSvgString(u.qr_token),
              })));

              printUnitTickets({
                bar_name: bar?.bar_name ?? null,
                daily_number: order?.daily_number ?? null,
                waiter: order?.seller_name ?? null,
                tickets,
              });
              
              await supabase.rpc("mark_units_printed", { _qr_tokens: units.map(u => u.qr_token) });
            }
          } catch (printErr) {
            console.error("Erro na auto-impressão:", printErr);
            toast.error("Erro ao imprimir automaticamente");
          }
        } else {
          await stop();
          navigate({ to: "/pedidos-liberar", search: { token } });
          return;
        }
      } else {
        // Fallback: token de unidade da lojinha (fluxo antigo)
        const res = await validateQr(token);
        if (res.ok) {
          setStatus({ type: 'success', message: res.product_name || 'Validado!' });
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
          setStatus({ type: 'error', message: res.reason === "already_delivered" ? "QR já utilizado" : "QR inválido" });
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
      const inst = new Html5Qrcode("lojinha-qr-reader", {
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        verbose: false,
      });
      ref.current = inst;
      await inst.start(
        { facingMode: "environment" },
        { fps: 15, qrbox: { width: 280, height: 280 }, aspectRatio: 1.0 },
        (text) => handleToken(text),
        () => {}
      );
    } catch (e: any) {
      console.error(e);
      toast.error("Não foi possível abrir a câmera");
      setScanning(false);
    }
  }

  async function stop() {
    try {
      if (ref.current) {
        await ref.current.stop();
        await ref.current.clear();
        ref.current = null;
      }
    } catch {}
    setScanning(false);
  }

  useEffect(() => () => { void stop(); }, []);

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
        {!scanning ? (
          <Button onClick={start} className="w-full h-14 text-base">
            <Camera className="h-5 w-5 mr-2" /> Abrir câmera para validar QR
          </Button>
        ) : (
          <div className="space-y-3">
            <div id="lojinha-qr-reader" className="rounded-lg overflow-hidden bg-black aspect-square" />
            <Button variant="outline" onClick={stop} className="w-full">Parar câmera</Button>
          </div>
        )}

        {status.type !== 'idle' && (
          <div className={`absolute inset-0 flex flex-col items-center justify-center rounded-lg z-10 animate-in fade-in zoom-in duration-300 ${
            status.type === 'success' ? 'bg-success/90 text-success-foreground' : 'bg-destructive/90 text-destructive-foreground'
          }`}>
            {status.type === 'success' ? <CheckCircle2 className="h-20 w-20 mb-2" /> : <XCircle className="h-20 w-20 mb-2" />}
            <div className="text-xl font-bold px-4 text-center">{status.message}</div>
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
