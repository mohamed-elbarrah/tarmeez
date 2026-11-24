"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  Infinity as MetaMark,
  Search,
  X,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  accountNames,
  campaignReport,
  campaigns,
  metricText,
  metricValue,
  money,
  statuses,
  type Days,
} from "./previewData";

interface MetaCampaignPreviewProps {
  status?: string;
  campaign?: string;
  days: Days;
}

const statusStyles = {
  Active: "bg-emerald-500/10 text-emerald-800 dark:text-emerald-300",
  Paused: "bg-amber-500/10 text-amber-800 dark:text-amber-300",
  Closed: "bg-muted text-muted-foreground",
};

const filterClass =
  "min-h-10 w-full rounded-lg border bg-background px-2.5 text-sm focus-visible:outline-2 focus-visible:outline-ring";

export function MetaCampaignPreview({
  status,
  campaign,
  days,
}: MetaCampaignPreviewProps) {
  const [search, setSearch] = useState("");
  const [account, setAccount] = useState("");
  const [objective, setObjective] = useState("");
  const [statusFilter, setStatusFilter] = useState(
    statuses.find((item) => item.toLowerCase() === status) ?? "",
  );
  const [period, setPeriod] = useState(days);
  const [selectedId, setSelectedId] = useState(campaign);

  const rows = campaigns.filter(
    (item) =>
      (!statusFilter || item.status === statusFilter) &&
      (!account || item.account === account) &&
      (!objective || item.objective === objective) &&
      item.name.toLowerCase().includes(search.trim().toLowerCase()),
  );
  const selected = campaigns.find((item) => item.id === selectedId);
  const selectedReport = selected ? campaignReport(selected, period) : null;

  return (
    <div className="space-y-6">
      <header>
        <Link
          href={`/ads?days=${period}`}
          className="mb-4 inline-flex min-h-8 items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Marketing Overview
        </Link>
        <div className="flex items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-blue-500/10 text-blue-700 dark:text-blue-300">
            <MetaMark className="size-6" />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-3xl font-semibold tracking-tight">
                Meta Campaigns
              </h1>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                Sample data
              </span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Explore campaign performance across {accountNames.length} sample
              Meta accounts.
            </p>
          </div>
        </div>
      </header>

      {selected && selectedReport && (
        <section
          id="campaign-summary"
          className="scroll-mt-20 rounded-xl border bg-card p-4 sm:p-5"
          aria-labelledby="campaign-summary-heading"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-muted-foreground">
                Campaign snapshot · last {period} days
              </p>
              <h2
                id="campaign-summary-heading"
                className="mt-1 text-lg font-semibold"
              >
                {selected.name}
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {selected.account} · {selected.objective} · {selected.status}
              </p>
            </div>
            <button
              type="button"
              aria-label="Close campaign snapshot"
              onClick={() => setSelectedId(undefined)}
              className="grid size-10 shrink-0 place-items-center rounded-lg hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
            >
              <X className="size-4" />
            </button>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-3 border-t pt-4 sm:grid-cols-4">
            {(["spend", "purchases", "revenue", "roas"] as const).map(
              (metric) => (
                <div key={metric}>
                  <dt className="text-xs capitalize text-muted-foreground">
                    {metric === "roas" ? "ROAS" : metric}
                  </dt>
                  <dd className="mt-1 font-semibold tabular-nums">
                    {metricText(
                      metric,
                      metricValue(metric, selectedReport.current),
                    )}
                  </dd>
                  <dd className="text-xs tabular-nums text-muted-foreground">
                    Was{" "}
                    {metricText(
                      metric,
                      metricValue(metric, selectedReport.previous),
                    )}
                  </dd>
                </div>
              ),
            )}
          </dl>
        </section>
      )}

      <section
        className="overflow-hidden rounded-xl border bg-card"
        aria-labelledby="campaigns-heading"
      >
        <div className="flex items-center justify-between gap-3 px-4 pt-4 sm:px-5 sm:pt-5">
          <h2 id="campaigns-heading" className="text-lg font-semibold">
            Campaigns
          </h2>
          <p aria-live="polite" className="text-xs text-muted-foreground">
            {rows.length} of {campaigns.length} campaigns
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2.5 border-b p-4 sm:p-5 xl:grid-cols-[1.4fr_repeat(4,1fr)]">
          <label className="relative col-span-2 xl:col-span-1">
            <span className="sr-only">Search campaigns</span>
            <Search className="pointer-events-none absolute start-3 top-3 size-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search campaigns…"
              className={`${filterClass} ps-9`}
            />
          </label>
          <label>
            <span className="sr-only">Ad account</span>
            <select
              className={filterClass}
              value={account}
              onChange={(event) => setAccount(event.target.value)}
            >
              <option value="">All accounts</option>
              {accountNames.map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="sr-only">Campaign status</span>
            <select
              className={filterClass}
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(
                  statuses.find((item) => item === event.target.value) ?? "",
                )
              }
            >
              <option value="">All statuses</option>
              {statuses.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="sr-only">Campaign objective</span>
            <select
              className={filterClass}
              value={objective}
              onChange={(event) => setObjective(event.target.value)}
            >
              <option value="">All objectives</option>
              <option>Sales</option>
              <option>Traffic</option>
            </select>
          </label>
          <label>
            <span className="sr-only">Reporting period</span>
            <select
              className={filterClass}
              value={period}
              onChange={(event) =>
                setPeriod(event.target.value === "7" ? 7 : 30)
              }
            >
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
            </select>
          </label>
        </div>
        <Table>
          <TableHeader className="bg-muted/40">
            <TableRow>
              <TableHead className="ps-4 sm:ps-5">Campaign</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-end">Spend</TableHead>
              <TableHead className="hidden text-end md:table-cell">
                Purchases
              </TableHead>
              <TableHead className="hidden text-end md:table-cell">
                Reported revenue
              </TableHead>
              <TableHead className="pe-4 text-end sm:pe-5">ROAS</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((item) => {
              const { current } = campaignReport(item, period);
              return (
                <TableRow
                  key={item.id}
                  data-state={selectedId === item.id ? "selected" : undefined}
                >
                  <TableCell className="min-w-28 whitespace-normal ps-4 sm:ps-5">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 text-start font-semibold hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                      onClick={() => {
                        setSelectedId(item.id);
                        requestAnimationFrame(() =>
                          document
                            .getElementById("campaign-summary")
                            ?.scrollIntoView({ block: "start" }),
                        );
                      }}
                    >
                      {item.name}
                      <ArrowUpRight className="size-3 shrink-0" />
                    </button>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {item.account} · {item.objective}
                    </p>
                  </TableCell>
                  <TableCell>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusStyles[item.status]}`}
                    >
                      {item.status}
                    </span>
                  </TableCell>
                  <TableCell className="text-end text-xs tabular-nums sm:text-sm">
                    {money(current.spend)}
                  </TableCell>
                  <TableCell className="hidden text-end tabular-nums md:table-cell">
                    {current.purchases}
                  </TableCell>
                  <TableCell className="hidden text-end tabular-nums md:table-cell">
                    {money(current.revenue)}
                  </TableCell>
                  <TableCell className="pe-4 text-end font-semibold tabular-nums sm:pe-5">
                    {metricText("roas", metricValue("roas", current))}
                  </TableCell>
                </TableRow>
              );
            })}
            {!rows.length && (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="py-8 text-center text-muted-foreground"
                >
                  No campaigns match your filters.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </section>
      <div className="flex flex-wrap justify-between gap-3 text-xs text-muted-foreground">
        <p>Purchases, revenue, and ROAS show sample Meta-reported results.</p>
        <Link
          href="/ads/meta/live"
          className="font-medium text-primary hover:underline"
        >
          Open connected Meta accounts →
        </Link>
      </div>
    </div>
  );
}
