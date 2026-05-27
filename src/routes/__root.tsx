import { Outlet, Link, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { ViewAsProvider } from "@/hooks/useViewAs";
import { BrandingProvider } from "@/hooks/useBranding";

import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md text-center glass rounded-2xl p-10">
        <h1 className="text-7xl font-bold text-gradient">404</h1>
        <h2 className="mt-4 text-xl font-semibold">Página não encontrada</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          A página que você procura não existe ou foi movida.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-gradient-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-transform hover:scale-105 glow-primary"
          >
            Ir ao Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "sistema de gestao de eventos e casa noturna" },
      { name: "description", content: "Plataforma para gerenciar vendas, equipes de promoter, funcionarios, lista e ingressos. facilidade durante a operação!" },
      { name: "author", content: "NightOps" },
      { property: "og:title", content: "sistema de gestao de eventos e casa noturna" },
      { property: "og:description", content: "Plataforma para gerenciar vendas, equipes de promoter, funcionarios, lista e ingressos. facilidade durante a operação!" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "sistema de gestao de eventos e casa noturna" },
      { name: "twitter:description", content: "Plataforma para gerenciar vendas, equipes de promoter, funcionarios, lista e ingressos. facilidade durante a operação!" },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/a882b650-c6a7-4617-aba6-430b037a4ffd/id-preview-f8a395c5--a7bea670-6163-41ba-aa57-6c998ab77578.lovable.app-1779905637601.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/a882b650-c6a7-4617-aba6-430b037a4ffd/id-preview-f8a395c5--a7bea670-6163-41ba-aa57-6c998ab77578.lovable.app-1779905637601.png" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className="dark">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } },
  }));

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrandingProvider>
          <ViewAsProvider>
            <TooltipProvider>
              <Outlet />
              <Toaster richColors position="top-right" />
            </TooltipProvider>
          </ViewAsProvider>
        </BrandingProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
