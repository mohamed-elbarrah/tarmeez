"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  CirclePause,
  LoaderCircle,
  Play,
  ShieldAlert,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/common/PageHeader";
import { QueryError, QuerySkeleton } from "@/components/common/QueryState";
import { StatusBadge } from "@/components/common/StatusBadge";
import {
  useGetAdCampaignQuery,
  useGetAdStatusActionQuery,
  useUpdateAdCampaignStatusMutation,
} from "@/services/adsApi";
import { useGetMerchantProfileQuery } from "@/services/merchantApi";
import { getApiErrorMessage } from "@/lib/api-error";
import type { AdStatusActionState } from "@/types/ads.types";

interface CampaignDetailPageProps {
  campaignId: string;
}

export function CampaignDetailPage({ campaignId }: CampaignDetailPageProps) {
  const profile = useGetMerchantProfileQuery();
  const campaign = useGetAdCampaignQuery(campaignId);
  const [update, updateState] = useUpdateAdCampaignStatusMutation();
  const [confirmStatus, setConfirmStatus] = useState<
    "ACTIVE" | "PAUSED" | null
  >(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const action = useGetAdStatusActionQuery(
    { campaignId, actionId: actionId ?? "" },
    { skip: !actionId, pollingInterval: actionId ? 1500 : 0 },
  );
  const currentStatus = campaign.data?.configuredStatus ?? "UNKNOWN";
  const canManage = Boolean(
    profile.data?.role === "OWNER" &&
    profile.data.user.id === campaign.data?.account.ownerUserId &&
    campaign.data?.accountConnectionId,
  );
  const actionTerminal =
    action.data &&
    ["CONFIRMED", "REJECTED", "NOT_CONFIRMED"].includes(action.data.state);

  useEffect(() => {
    if (!actionTerminal) return;
    if (action.data?.state === "CONFIRMED") void campaign.refetch();
  }, [action.data?.state, actionTerminal, campaign]);

  if (campaign.isLoading || profile.isLoading)
    return (
      <div className="space-y-6">
        <QuerySkeleton rows={5} />
      </div>
    );
  if (campaign.isError || !campaign.data)
    return (
      <div className="space-y-6">
        <QueryError
          title="Couldn’t load this campaign"
          onRetry={() => void campaign.refetch()}
        />
        <Button asChild variant="ghost">
          <Link href="/ads">
            <ArrowLeft className="mr-2 size-4" />
            Back to ads
          </Link>
        </Button>
      </div>
    );

  const nextStatus = currentStatus === "PAUSED" ? "ACTIVE" : "PAUSED";
  async function submitStatus() {
    if (!confirmStatus || !campaign.data) return;
    try {
      const result = await update({
        campaignId,
        status: confirmStatus,
        expectedStatus: currentStatus,
        idempotencyKey: crypto.randomUUID(),
      }).unwrap();
      setConfirmStatus(null);
      setActionId(result.actionId);
    } catch {
      /* Mutation error is rendered in the action panel. */
    }
  }

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Meta Ads"
        title={campaign.data.name}
        description={`${campaign.data.account.name} · ${campaign.data.objective ?? "Objective unavailable"}`}
        action={
          <Button asChild variant="outline" className="min-h-11 rounded-lg">
            <Link href={`/ads?accountId=${campaign.data.accountConnectionId}`}>
              <ArrowLeft className="mr-2 size-4" />
              Back to campaigns
            </Link>
          </Button>
        }
      />
      <section className="grid gap-4 md:grid-cols-3">
        <InfoCard
          label="Configured status"
          value={<StatusBadge status={currentStatus} />}
        />
        <InfoCard
          label="Effective delivery"
          value={
            <Badge variant="outline" className="rounded-full">
              {campaign.data.effectiveStatus ?? "Unknown"}
            </Badge>
          }
        />
        <InfoCard
          label="Account"
          value={
            <span className="truncate text-sm font-semibold">
              {campaign.data.account.name}
            </span>
          }
        />
      </section>
      <section className="rounded-2xl border bg-card p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold">Campaign controls</h2>
            <p className="mt-1 max-w-xl text-sm leading-6 text-muted-foreground">
              Changing the configured status is sent to Meta and verified before
              Tarmeez reports success. Effective delivery can still be affected
              by Meta review, budget, or account issues.
            </p>
          </div>
          {canManage && (
            <Button
              className="min-h-11 shrink-0 rounded-lg"
              disabled={!!actionId || updateState.isLoading}
              onClick={() => setConfirmStatus(nextStatus)}
            >
              {nextStatus === "PAUSED" ? (
                <>
                  <CirclePause className="mr-2 size-4" />
                  Pause campaign
                </>
              ) : (
                <>
                  <Play className="mr-2 size-4" />
                  Resume campaign
                </>
              )}
            </Button>
          )}
        </div>
        {!canManage && (
          <p className="mt-4 flex items-center gap-2 rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
            <ShieldAlert className="size-4" />
            Only the owner who connected this account can change campaign
            status.
          </p>
        )}
        {updateState.error && (
          <p role="alert" className="mt-4 text-sm text-destructive">
            {getApiErrorMessage(updateState.error)}
          </p>
        )}
        {actionId && (
          <ActionProgress
            state={action.data?.state}
            error={action.data?.failureCode}
          />
        )}
      </section>
      <section className="rounded-2xl border bg-card p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Daily Meta performance</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Recent reporting data returned by Meta. Values may be revised by
              Meta.
            </p>
          </div>
          <Badge variant="outline" className="rounded-full">
            {campaign.data.account.currency ?? "Currency unavailable"}
          </Badge>
        </div>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[650px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="pb-3 font-medium">Date</th>
                <th className="pb-3 text-right font-medium">Spend</th>
                <th className="pb-3 text-right font-medium">Impressions</th>
                <th className="pb-3 text-right font-medium">Clicks</th>
                <th className="pb-3 text-right font-medium">Purchases</th>
              </tr>
            </thead>
            <tbody>
              {campaign.data.dailyMetrics.map((metric) => (
                <tr key={metric.id} className="border-b last:border-0">
                  <td className="py-3">{formatDate(metric.reportDate)}</td>
                  <td className="py-3 text-right">
                    {formatMoney(
                      metric.spend,
                      metric.currency ?? campaign.data?.account.currency,
                    )}
                  </td>
                  <td className="py-3 text-right">
                    {formatCount(metric.impressions)}
                  </td>
                  <td className="py-3 text-right">
                    {formatCount(metric.clicks)}
                  </td>
                  <td className="py-3 text-right">
                    {formatCount(metric.reportedPurchases)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!campaign.data.dailyMetrics.length && (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No daily metrics have been imported yet.
            </p>
          )}
        </div>
      </section>
      <AlertDialog
        open={!!confirmStatus}
        onOpenChange={(open) => !open && setConfirmStatus(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmStatus === "PAUSED"
                ? "Pause this campaign?"
                : "Resume this campaign?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmStatus === "PAUSED"
                ? "Meta will stop delivery for this campaign and its active children."
                : "Meta may resume delivery and spending after this campaign is activated."}{" "}
              Tarmeez will verify the final status before showing success.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={updateState.isLoading}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button
                onClick={(event) => {
                  event.preventDefault();
                  void submitStatus();
                }}
                disabled={updateState.isLoading}
              >
                {updateState.isLoading
                  ? "Sending…"
                  : confirmStatus === "PAUSED"
                    ? "Pause campaign"
                    : "Resume campaign"}
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-2xl border bg-card p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="mt-3">{value}</div>
    </div>
  );
}
function ActionProgress({
  state,
  error,
}: {
  state?: AdStatusActionState;
  error?: string | null;
}) {
  const message =
    state === "CONFIRMED"
      ? "Meta confirmed the campaign status."
      : state === "NOT_CONFIRMED"
        ? "Meta did not confirm the requested status. Refresh and try again."
        : state === "REJECTED"
          ? "Meta rejected the status change."
          : "Waiting for Meta to confirm the change…";
  return (
    <p
      role="status"
      className={`mt-4 flex items-center gap-2 rounded-lg border p-3 text-sm ${state === "CONFIRMED" ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-700" : "bg-muted/30 text-muted-foreground"}`}
    >
      {state === "CONFIRMED" ? (
        <CheckCircle2 className="size-4" />
      ) : (
        <LoaderCircle className="size-4 animate-spin" />
      )}
      {message}
      {error ? ` (${error})` : ""}
    </p>
  );
}
function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
    new Date(value),
  );
}
function formatCount(value: string | null | undefined) {
  return value ? new Intl.NumberFormat().format(Number(value)) : "—";
}
function formatMoney(
  value: string | null | undefined,
  currency: string | null | undefined,
) {
  if (!value) return "—";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency ?? "USD",
      maximumFractionDigits: 2,
    }).format(Number(value));
  } catch {
    return `${value} ${currency ?? ""}`;
  }
}
