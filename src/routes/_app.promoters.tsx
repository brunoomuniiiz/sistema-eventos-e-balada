import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/promoters")({
  beforeLoad: () => { throw redirect({ to: "/configuracao" }); },
});
