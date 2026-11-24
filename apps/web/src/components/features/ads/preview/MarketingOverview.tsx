import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  CircleAlert,
  Infinity as MetaMark,
  Megaphone,
  TrendingUp,
} from "lucide-react";
import { PerformanceChart } from "./PerformanceChart";
import {
  accountNames,
  campaignReport,
  campaigns,
  metricLabels,
  metricText,
  metricValue,
  money,
  overviewReport,
  percentChange,
  statuses,
  type Days,
  type Metric,
} from "./previewData";

interface MarketingOverviewProps {
  days: Days;
}

const metrics: Metric[] = ["spend", "purchases", "revenue", "roas"];
const statusColors = {
  Active: "bg-emerald-500",
  Paused: "bg-amber-500",
  Closed: "bg-muted-foreground",
};

export function MarketingOverview({ days }: MarketingOverviewProps) {
  const { current, previous, timeline } = overviewReport(days);
  const metaHref = `/ads/meta?days=${days}`;
  const sales = campaigns
    .filter((campaign) => campaign.objective === "Sales")
    .map((campaign) => ({ ...campaign, ...campaignReport(campaign, days) }));
  const best = sales.reduce((a, b) =>
    metricValue("roas", a.current) >= metricValue("roas", b.current) ? a : b,
  );
  const watch = sales.find(
    (item) =>
      (percentChange(item.current.spend, item.previous.spend) ?? 0) > 0 &&
      (percentChange(item.current.purchases, item.previous.purchases) ?? 0) < 0,
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs font-semibold text-muted-foreground">
            <Megaphone className="size-4 text-primary" /> Advertising{" "}
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">
              Sample data
            </span>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Marketing Overview
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            See what you spent, what came back, and what needs attention.
          </p>
        </div>
        <nav
          aria-label="Reporting period"
          className="flex gap-1 rounded-lg border bg-card p-1"
        >
          {([7, 30] as const).map((period) => (
            <Link
              key={period}
              href={`/ads?days=${period}`}
              aria-current={days === period ? "true" : undefined}
              className="rounded-md px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground aria-current:bg-muted aria-current:text-foreground"
            >
              Last {period} days
            </Link>
          ))}
        </nav>
      </header>

      <section
        aria-label="Marketing results"
        className="overflow-hidden rounded-xl border bg-border"
      >
        <div className="flex flex-wrap items-center justify-between gap-1 bg-card px-4 py-3 text-xs text-muted-foreground sm:px-6">
          <span>All connected platforms · Meta only</span>
          <span>Compared with the previous {days} days</span>
        </div>
        <dl className="grid grid-cols-2 gap-px border-y lg:grid-cols-4">
          {metrics.map((metric) => {
            const value = metricValue(metric, current);
            const baseline = metricValue(metric, previous);
            const delta = percentChange(value, baseline);
            return (
              <div key={metric} className="bg-card px-4 py-4 sm:px-6">
                <dt className="text-xs font-medium text-muted-foreground sm:text-sm">
                  {metricLabels[metric]}
                </dt>
                <dd className="mt-1 text-xl font-semibold tracking-tight tabular-nums sm:text-2xl">
                  {metricText(metric, value)}
                </dd>
                <dd className="mt-1 text-xs tabular-nums text-muted-foreground">
                  {metric === "roas"
                    ? `Was ${metricText(metric, baseline)}`
                    : delta === null
                      ? "No comparison"
                      : `${delta > 0 ? "+" : ""}${delta}% vs. previous period`}
                </dd>
              </div>
            );
          })}
        </dl>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 bg-card px-4 py-3 text-sm sm:px-6">
          <h2 className="text-xs font-semibold text-muted-foreground">
            Campaigns now
          </h2>
          {statuses.map((status) => (
            <Link
              key={status}
              href={`${metaHref}&status=${status.toLowerCase()}`}
              className="group inline-flex min-h-8 items-center gap-1.5 text-xs hover:text-primary"
            >
              <span className={`size-2 rounded-full ${statusColors[status]}`} />
              <strong className="tabular-nums">
                {
                  campaigns.filter((campaign) => campaign.status === status)
                    .length
                }
              </strong>
              {status}
              <ArrowRight className="size-3 text-muted-foreground group-hover:text-primary" />
            </Link>
          ))}
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,2.25fr)_minmax(15rem,1fr)]">
        <PerformanceChart timeline={timeline} />
        <section
          className="rounded-xl border bg-card p-4 sm:p-6"
          aria-labelledby="findings-heading"
        >
          <h2
            id="findings-heading"
            className="text-lg font-semibold tracking-tight"
          >
            What stands out
          </h2>
          <div className="mt-5 flex gap-3">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
              <TrendingUp className="size-4" />
            </span>
            <div>
              <p className="text-xs font-medium text-muted-foreground">
                What’s working
              </p>
              <p className="mt-1 text-sm font-semibold">{best.name}</p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                Highest ROAS among sales campaigns:{" "}
                {metricText("roas", metricValue("roas", best.current))}.
              </p>
              <Link
                className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                href={`${metaHref}&campaign=${best.id}#campaign-summary`}
              >
                View campaign <ArrowUpRight className="size-3" />
              </Link>
            </div>
          </div>
          <div className="mt-5 flex gap-3 border-t pt-5">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-amber-500/10 text-amber-800 dark:text-amber-300">
              <CircleAlert className="size-4" />
            </span>
            <div>
              <p className="text-xs font-medium text-muted-foreground">
                Needs attention
              </p>
              {watch ? (
                <>
                  <p className="mt-1 text-sm font-semibold">{watch.name}</p>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    Spend rose{" "}
                    {percentChange(watch.current.spend, watch.previous.spend)}%,
                    while reported purchases fell{" "}
                    {Math.abs(
                      percentChange(
                        watch.current.purchases,
                        watch.previous.purchases,
                      ) ?? 0,
                    )}
                    %.
                  </p>
                  <Link
                    className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                    href={`${metaHref}&campaign=${watch.id}#campaign-summary`}
                  >
                    View campaign <ArrowUpRight className="size-3" />
                  </Link>
                </>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">
                  No sales campaigns spent more and reported fewer purchases
                  this period.
                </p>
              )}
            </div>
          </div>
        </section>
      </div>

      <section
        className="rounded-xl border bg-card p-4 sm:p-6"
        aria-labelledby="platforms-heading"
      >
        <h2
          id="platforms-heading"
          className="text-lg font-semibold tracking-tight"
        >
          Ad platforms
        </h2>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t pt-4">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-lg bg-blue-500/10 text-blue-700 dark:text-blue-300">
              <MetaMark className="size-5" />
            </span>
            <div>
              <p className="text-sm font-semibold">Meta</p>
              <p className="text-xs text-muted-foreground">
                {accountNames.length} sample accounts
              </p>
            </div>
          </div>
          <p className="text-sm tabular-nums">
            <strong>{money(current.spend)}</strong>{" "}
            <span className="text-muted-foreground">
              spent · {metricText("roas", metricValue("roas", current))} ROAS
            </span>
          </p>
          <Link
            href={metaHref}
            className="inline-flex min-h-10 items-center gap-2 rounded-lg border px-3 text-sm font-medium hover:bg-muted"
          >
            View campaigns <ArrowRight className="size-4" />
          </Link>
        </div>
      </section>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Purchases and revenue are reported by Meta in this preview. ROAS is
        reported revenue divided by ad spend.
      </p>
    </div>
  );
}
