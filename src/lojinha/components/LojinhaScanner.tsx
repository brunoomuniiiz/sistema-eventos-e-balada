import { useEffect, useRef, useState } from "react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { Camera, KeyboardIcon } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { orderLookupByToken } from "@/lojinha/api";
import { validateQr } from "@/lojinha/api";
import { toast } from "sonner";

export function LojinhaScanner() {
  const navigate = useNavigate();
  const [scanning, setScanning] = useState(false);
  const [manual, setManual] = useState("");
  const ref = useRef<Html5Qrcode | null>(null);
  const lastTokenRef = useRef<string>("");

  async function handleToken(raw: string) {
    let token = raw.trim();
    if (!token || token === lastTokenRef.current) return;
    lastTokenRef.current = token;
    // Aceita URL completa: pega último segmento
    if (token.includes("/")) token = token.split("/").pop() || token;
    if (token.includes("?")) token = token.split("?")[0];

    try {
      // Tenta pedido novo (sale ou order via pickup_token)
      const lookup = await orderLookupByToken(token);
      if (lookup.ok) {
        await stop();
        navigate({ to: "/pedidos-liberar", search: { token } });
        return;
      }
      // Fallback: token de unidade da lojinha (fluxo antigo)
      const res = await validateQr(token);
      if (res.ok) toast.success(`Entregue: ${res.product_name}`);
      else if (res.reason === "already_delivered") toast.error("QR já utilizado");
      else toast.error("QR inválido");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao validar");
    }
    setTimeout(() => { lastTokenRef.current = ""; }, 2500);
  }

  async function start() {
    if (scanning) return;
    setScanning(true);
    try {
      const inst = new Html5Qrcode("lojinha-qr-reader");
      ref.current = inst;
      await inst.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 240, height: 240 } },
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
    <div className="space-y-3">
      {!scanning ? (
        <Button onClick={start} className="w-full h-14 text-base">
          <Camera className="h-5 w-5 mr-2" /> Abrir câmera para validar QR
        </Button>
      ) : (
        <Button variant="outline" onClick={stop} className="w-full">Parar câmera</Button>
      )}

      <div id="lojinha-qr-reader" className="rounded-lg overflow-hidden bg-black" />

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
