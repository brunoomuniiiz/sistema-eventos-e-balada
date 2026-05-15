import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/bar-settings")({
  beforeLoad: () => { throw redirect({ to: "/configuracao" }); },
});
