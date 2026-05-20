## Diagnóstico do QR não ler

Olhando o código, a causa mais provável da câmera não enxergar o QR é **tamanho**: o QR de cada unidade é renderizado em apenas **104px** (`size={104}` em `loja.$slug_.pedido.$orderId.tsx` linha 130), enquanto o scanner usa uma `qrbox` de 240x240. Em telas pequenas e com brilho/zoom variando, 104px fica abaixo do limiar de reconhecimento do `html5-qrcode`. O token em si (36 caracteres hex) é válido — quando colado no campo "Validar por código" funciona via `validateQr` → `lojinha_validate_qr`.

Não há bug de validade do token; é problema de leitura óptica.

## Mudanças

### 1) Tela do cliente — `src/routes/loja.$slug_.pedido.$orderId.tsx`
Dentro do `units.map` (linhas 124-144):
- Aumentar `<QRCodeSVG size={104} />` para `size={180}` (mais legível para câmera).
- Abaixo do nome do produto, mostrar o `qr_token` em fonte mono pequena com `break-all` + botão "Copiar código" (toast "Código copiado") seguindo o mesmo padrão de `handleCopyPix` (linha 210).
- Texto auxiliar: "Câmera não leu? Copie o código e peça ao garçom para colar."

### 2) Scanner do garçom — `src/lojinha/components/LojinhaScanner.tsx`
- Aumentar `qrbox` de 240 para 280 e adicionar `aspectRatio: 1.0` para forçar enquadramento quadrado.
- Adicionar `formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE]` na config para acelerar o decoder focando só em QR.
- Adicionar dica visual abaixo do botão: "Se não ler, peça ao cliente o código e cole no campo abaixo."

Nenhuma mudança de backend; o caminho manual já existe e funciona.

## Arquivos afetados
- `src/routes/loja.$slug_.pedido.$orderId.tsx`
- `src/lojinha/components/LojinhaScanner.tsx`