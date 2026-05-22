import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/admin-caixas")({
  beforeLoad: () => {
    throw redirect({ to: "/vendas", search: { tab: "caixas" } });
  },
});
