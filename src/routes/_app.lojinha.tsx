import { createFileRoute, redirect } from "@tanstack/react-router";

// Lojinha unificada dentro de Vendas — redireciona para /vendas
export const Route = createFileRoute("/_app/lojinha")({
  beforeLoad: () => {
    throw redirect({ to: "/vendas" });
  },
});
