export function formatBRL(value: number | null | undefined): string {
  const n = Number(value ?? 0);
  return n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export function calcEventNet(f: {
  revenue_drinks?: number | null;
  revenue_hookah_total?: number | null;
  hookah_share_percent?: number | null;
  revenue_door?: number | null;
  expenses?: number | null;
}): number {
  const drinks = Number(f.revenue_drinks ?? 0);
  const hookah = Number(f.revenue_hookah_total ?? 0) * (Number(f.hookah_share_percent ?? 40) / 100);
  const door = Number(f.revenue_door ?? 0);
  const expenses = Number(f.expenses ?? 0);
  return drinks + hookah + door - expenses;
}

export function calcEventGross(f: {
  revenue_drinks?: number | null;
  revenue_hookah_total?: number | null;
  hookah_share_percent?: number | null;
  revenue_door?: number | null;
}): number {
  const drinks = Number(f.revenue_drinks ?? 0);
  const hookah = Number(f.revenue_hookah_total ?? 0) * (Number(f.hookah_share_percent ?? 40) / 100);
  const door = Number(f.revenue_door ?? 0);
  return drinks + hookah + door;
}
