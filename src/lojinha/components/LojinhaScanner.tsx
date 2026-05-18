import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Camera, CheckCircle2, XCircle, KeyboardIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { validateQr } from "@/lojinha/api";
import { toast } from "sonner";

type Result = { ok: boolean; reason?: string; product_name?: string; customer_name?: string; delivered_at?: string };

export function LojinhaScanner() {
  const [scanning, setScanning] = useState(false);
  const [last, setLast] = useState<Result | null>(null);
  const [manual, setManual] = useState("");
  const ref = useRef<Html5Qrcode | null>(null);
  const lastTokenRef = useRef<string>("");

  async function handleToken(token: string) {
    if (!token || token === lastTokenRef.current) return;
    lastTokenRef.current = token;
    try {
      const res = await validateQr(token);
      setLast(res);
      if (res.ok) toast.success(`Entregue: ${res.product_name}`);
      else if (res.reason === "already_delivered") toast.error("QR já utilizado");
      else toast.error("QR inválido");
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao validar");
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

      {last && (
        <Card className={last.ok ? "border-success/40 bg-success/5" : "border-destructive/40 bg-destructive/5"}>
          <CardContent className="p-4 flex items-center gap-3">
            {last.ok ? <CheckCircle2 className="h-8 w-8 text-success" /> : <XCircle className="h-8 w-8 text-destructive" />}
            <div className="flex-1">
              {last.ok ? (
                <>
                  <div className="font-bold text-success">Entregue!</div>
                  <div className="text-sm">{last.product_name} · {last.customer_name}</div>
                </>
              ) : last.reason === "already_delivered" ? (
                <>
                  <div className="font-bold text-destructive">QR já utilizado</div>
                  <div className="text-xs text-muted-foreground">{last.product_name} · {last.customer_name}</div>
                </>
              ) : (
                <div className="font-bold text-destructive">QR inválido</div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
