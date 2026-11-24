export type Days = 7 | 30;
export const statuses = ["Active", "Paused", "Closed"] as const;
type Status = (typeof statuses)[number];
export type Metric = "revenue" | "spend" | "purchases" | "roas";

interface Totals {
  spend: number;
  purchases: number;
  revenue: number;
}

interface SampleCampaign {
  id: string;
  name: string;
  account: string;
  status: Status;
  objective: "Sales" | "Traffic";
  current: Totals;
  previous: Totals;
}

function sample(
  id: string,
  name: string,
  account: string,
  status: Status,
  objective: SampleCampaign["objective"],
  current: [number, number, number],
  previous: [number, number, number],
): SampleCampaign {
  return {
    id,
    name,
    account,
    status,
    objective,
    current: fromTuple(current),
    previous: fromTuple(previous),
  };
}

function fromTuple([spend, purchases, revenue]: [
  number,
  number,
  number,
]): Totals {
  return { spend, purchases, revenue };
}

export const campaigns = [
  sample(
    "summer",
    "Summer Sale",
    "Tarmeez Store",
    "Active",
    "Sales",
    [2000, 68, 8400],
    [1650, 48, 6200],
  ),
  sample(
    "retargeting",
    "Cart Retargeting",
    "Tarmeez Store",
    "Active",
    "Sales",
    [1500, 27, 3000],
    [1200, 30, 3400],
  ),
  sample(
    "prospecting",
    "New Customer Prospecting",
    "Growth Studio",
    "Active",
    "Sales",
    [3400, 91, 11600],
    [2800, 82, 9800],
  ),
  sample(
    "catalog",
    "Catalog Remarketing",
    "Growth Studio",
    "Paused",
    "Sales",
    [1550, 40, 5400],
    [1550, 42, 4800],
  ),
  sample(
    "discovery",
    "Product Discovery",
    "Brand Studio",
    "Paused",
    "Traffic",
    [750, 0, 0],
    [750, 0, 0],
  ),
  sample(
    "spring",
    "Spring Promo",
    "Tarmeez Store",
    "Closed",
    "Sales",
    [800, 14, 1600],
    [950, 20, 1700],
  ),
];

const patterns = [
  0.73, 0.82, 0.79, 0.65, 0.91, 1.04, 0.98, 1.06, 0.92, 0.88, 1.26, 1.19, 1.32,
  1.13, 0.96, 1.05, 0.89, 0.97, 1.29, 1.16, 1.39, 1.15, 1.08, 1.23, 1.12, 1.38,
  1.28, 1.51, 1.32, 1.44,
];

function distribute(totals: Totals, previous: boolean): Totals[] {
  const weights = previous
    ? patterns.map(
        (_, index) => 0.65 + patterns[(index + 9) % patterns.length] * 0.35,
      )
    : patterns;
  const totalWeight = weights.reduce((sum, value) => sum + value, 0);
  let cumulative = 0;
  return weights.map((weight) => {
    const start = cumulative / totalWeight;
    cumulative += weight;
    return {
      spend:
        Math.round((totals.spend * cumulative) / totalWeight) -
        Math.round(totals.spend * start),
      revenue:
        Math.round((totals.revenue * cumulative) / totalWeight) -
        Math.round(totals.revenue * start),
      purchases:
        Math.round((totals.purchases * cumulative) / totalWeight) -
        Math.round(totals.purchases * start),
    };
  });
}

function sumTotals(rows: Totals[]): Totals {
  return rows.reduce(
    (a, b) => ({
      spend: a.spend + b.spend,
      purchases: a.purchases + b.purchases,
      revenue: a.revenue + b.revenue,
    }),
    { spend: 0, purchases: 0, revenue: 0 },
  );
}

function daily(campaign: SampleCampaign) {
  return [
    ...distribute(campaign.previous, true),
    ...distribute(campaign.current, false),
  ];
}

export function campaignReport(campaign: SampleCampaign, days: Days) {
  const data = daily(campaign);
  return {
    current: sumTotals(data.slice(-days)),
    previous: sumTotals(data.slice(-2 * days, -days)),
  };
}

export function overviewReport(days: Days) {
  const dailyByCampaign = campaigns.map(daily);
  const timeline = dailyByCampaign[0].map((_, index) =>
    sumTotals(dailyByCampaign.map((rows) => rows[index])),
  );
  const current = timeline.slice(-days);
  const previous = timeline.slice(-2 * days, -days);
  return {
    current: sumTotals(current),
    previous: sumTotals(previous),
    timeline: { current, previous },
  };
}

export const accountNames = [
  ...new Set(campaigns.map(({ account }) => account)),
];
export const metricLabels = {
  revenue: "Reported revenue",
  spend: "Total ad spend",
  purchases: "Reported purchases",
  roas: "ROAS",
};
export const money = (value: number) => `SAR ${value.toLocaleString("en-US")}`;
export const metricValue = (metric: Metric, totals: Totals) =>
  metric === "roas"
    ? totals.spend
      ? totals.revenue / totals.spend
      : 0
    : totals[metric];
export const metricText = (metric: Metric, value: number) =>
  metric === "roas"
    ? `${value.toFixed(1)}×`
    : metric === "purchases"
      ? value.toLocaleString("en-US")
      : money(value);
export const percentChange = (value: number, previous: number) =>
  previous ? Math.round((value / previous - 1) * 100) : null;
