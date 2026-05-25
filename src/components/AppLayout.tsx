import { Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { LayoutDashboard, Calendar, DollarSign, LogOut, Sparkles, ShoppingCart, Settings, Boxes, DoorOpen, Activity, User, Wallet, CalendarHeart } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions, type Permission } from "@/hooks/usePermissions";
import { Button } from "@/components/ui/button";
import { ViewAsProvider } from "@/hooks/useViewAs";
import { ViewAsBar } from "@/components/ViewAsBar";

type NavItem = {
  to: string;
  label: string;
  short?: string;
  icon: typeof LayoutDashboard;
  perm?: Permission;
  ownerOnly?: boolean;
  anyPerm?: Permission[];
  customGate?: "ao_vivo";
  promoterOnly?: boolean;
};

const navItems: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", short: "Dash.", icon: LayoutDashboard, anyPerm: ["financeiro"] },
  { to: "/eventos", label: "Eventos", short: "Eve.", icon: Calendar, perm: "eventos" },
  { to: "/ao-vivo", label: "Ao vivo", short: "Live", icon: Activity, customGate: "ao_vivo" },
  { to: "/vendas", label: "Vendas", short: "Vend.", icon: ShoppingCart, anyPerm: ["vendas", "lojinha"] },
  { to: "/produtos", label: "Produtos", short: "Prod.", icon: Boxes, perm: "estoque" },
  { to: "/portaria", label: "Portaria", short: "Port.", icon: DoorOpen, perm: "portaria" },
  { to: "/financeiro", label: "Financeiro", short: "Fin.", icon: DollarSign, perm: "financeiro" },
  { to: "/configuracao", label: "Configuração", short: "Conf.", icon: Settings, anyPerm: ["funcionarios", "promoters"] },
  // Área do promoter
  { to: "/meu-extrato", label: "Extrato", short: "Extr.", icon: Wallet, promoterOnly: true },
  { to: "/meus-eventos", label: "Eventos", short: "Eve.", icon: CalendarHeart, promoterOnly: true },
  { to: "/configuracao", label: "Configuração", short: "Conf.", icon: Settings, promoterOnly: true },
];

export function AppLayout() {
  return (
    <ViewAsProvider>
      <AppLayoutInner />
    </ViewAsProvider>
  );
}

function AppLayoutInner() {
  const { user, signOut } = useAuth();
  const { can, isOwner, canAoVivo, rolePreset } = usePermissions();
  const location = useLocation();
  const navigate = useNavigate();

  const isPromoterMode = rolePreset === "promoter" && !isOwner;

  const visibleItems = navItems.filter((i) => {
    if (isPromoterMode) return !!i.promoterOnly;
    if (i.promoterOnly) return false;
    if (i.customGate === "ao_vivo") return canAoVivo;
    if (i.ownerOnly) return isOwner;
    if (i.anyPerm) return isOwner || i.anyPerm.some((p) => can(p));
    if (!i.perm) return true;
    return can(i.perm);
  });

  const handleSignOut = async () => {
    await signOut();
    navigate({ to: "/auth" });
  };

  return (
    <div className="min-h-screen flex">
      {/* Sidebar desktop — recolhida por padrão, expande no hover */}
      <aside className="group hidden md:flex flex-col bg-sidebar border-r border-sidebar-border fixed h-screen z-40 transition-[width] duration-200 ease-out w-16 hover:w-64">
        <div className="flex items-center gap-2 px-3 py-4 mb-2 overflow-hidden">
          <div className="h-9 w-9 rounded-xl bg-gradient-primary grid place-items-center glow-primary shrink-0">
            <Sparkles className="h-5 w-5 text-primary-foreground" />
          </div>
          <div className="opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
            <div className="font-display font-bold text-lg leading-none">NightOps</div>
            <div className="text-xs text-muted-foreground">Gestão de eventos</div>
          </div>
        </div>

        <nav className="flex flex-col gap-1 flex-1 overflow-y-auto px-2">
          {visibleItems.map((item) => {
            const active = location.pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                title={item.label}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all overflow-hidden ${
                  active
                    ? "bg-sidebar-accent text-sidebar-primary shadow-[inset_2px_0_0_var(--color-primary)]"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
                }`}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                <span className="opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-sidebar-border pt-3 pb-3 px-2 space-y-1">
          <div className="px-3 text-xs text-muted-foreground truncate opacity-0 group-hover:opacity-100 transition-opacity">{user?.email}</div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSignOut}
            className="w-full justify-start gap-3 overflow-hidden px-3"
            title="Sair"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            <span className="opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">Sair</span>
          </Button>
        </div>
      </aside>

      <main className="flex-1 md:ml-16 pb-[calc(env(safe-area-inset-bottom)+5.5rem)] md:pb-8">
        <header className="md:hidden sticky top-0 z-30 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85 border-b border-border px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-gradient-primary grid place-items-center">
              <Sparkles className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-display font-bold">NightOps</span>
          </div>
          <Button variant="ghost" size="icon" onClick={handleSignOut}>
            <LogOut className="h-4 w-4" />
          </Button>
        </header>

        <div className="px-4 md:px-8 py-6 md:py-8 max-w-7xl mx-auto">
          <Outlet />
        </div>
      </main>

      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/90 border-t border-border shadow-[0_-4px_20px_-8px_rgba(0,0,0,0.5)] overflow-x-auto pb-[env(safe-area-inset-bottom)]">
        <div className="flex min-w-full">
          {visibleItems.map((item) => {
            const active = location.pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex-1 min-w-[56px] flex flex-col items-center gap-1 py-2.5 px-1 text-[10px] font-medium transition-colors ${
                  active ? "text-primary" : "text-muted-foreground"
                }`}
              >
                <item.icon className={`h-5 w-5 ${active ? "drop-shadow-[0_0_8px_var(--color-primary)]" : ""}`} />
                <span className="truncate max-w-full leading-tight">{item.short ?? item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      <ViewAsBar />
    </div>
  );
}
