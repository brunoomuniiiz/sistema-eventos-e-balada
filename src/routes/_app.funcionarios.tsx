import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/funcionarios")({
  beforeLoad: () => { throw redirect({ to: "/configuracao" }); },
});
