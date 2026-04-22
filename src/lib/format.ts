export function formatBRL(value: number | null | undefined): string {
  const n = Number(value ?? 0);
  return n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export function formatPercent(value: number | null | undefined, digits = 1): string {
  const n = Number(value ?? 0);
  return `${n.toFixed(digits).replace(".", ",")}%`;
}

type FinancialLike = {
  revenue_drinks?: number | null;
  revenue_hookah_total?: number | null;
  hookah_share_percent?: number | null;
  revenue_door?: number | null;
  expenses?: number | null;
  bar_cmv?: number | null;
};

export function calcHookahShare(f: FinancialLike): number {
  return Number(f.revenue_hookah_total ?? 0) * (Number(f.hookah_share_percent ?? 40) / 100);
}

export function calcEventGross(f: FinancialLike): number {
  const drinks = Number(f.revenue_drinks ?? 0);
  const door = Number(f.revenue_door ?? 0);
  return drinks + calcHookahShare(f) + door;
}

/**
 * Lucro líquido = Bruto - CMV bar - Despesas legadas - Custos detalhados (passados separadamente)
 * O parâmetro `extraCosts` representa a soma de event_costs daquele evento.
 */
export function calcEventNet(f: FinancialLike, extraCosts = 0): number {
  return calcEventGross(f) - Number(f.bar_cmv ?? 0) - Number(f.expenses ?? 0) - extraCosts;
}

/**
 * Margem do bar = (faturamento bar - CMV) / faturamento bar
 * Retorna 0 se não houve faturamento.
 */
export function calcBarMargin(f: FinancialLike): { profit: number; percent: number } {
  const drinks = Number(f.revenue_drinks ?? 0);
  const cmv = Number(f.bar_cmv ?? 0);
  const profit = drinks - cmv;
  const percent = drinks > 0 ? (profit / drinks) * 100 : 0;
  return { profit, percent };
}
