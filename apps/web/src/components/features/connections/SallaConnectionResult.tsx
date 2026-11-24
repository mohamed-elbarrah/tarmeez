"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  Store,
  XCircle,
} from "lucide-react";
import {
  connectionsApi,
  useGetSallaIntentStatusQuery,
} from "@/services/connectionsApi";
import { useAppDispatch } from "@/store/hooks";
import { Button } from "@/components/ui/button";
import { QueryError, QuerySkeleton } from "@/components/common/QueryState";
import { safeUuidRouteSegment } from "@/lib/safe-route-segment";
import { publishSallaConnectionTerminal } from "@/lib/salla-connection-events";
import type { SallaIntentStatus } from "@/types/merchant.types";

const MAX_POLLING_MS = 30_000;
const MAX_RECHECKS = 3;

export function SallaConnectionResult() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const dispatch = useAppDispatch();
  const rawIntentId = searchParams.get("intentId") ?? "";
  const intentId = safeUuidRouteSegment(rawIntentId);
  const callbackStatus = searchParams.get("status")?.toUpperCase();
  const callbackReason = searchParams.get("reason");
  const callbackFailed =
    callbackStatus === "FAILED" ||
    callbackStatus === "EXPIRED" ||
    callbackStatus === "CANCELLED";
  const [pollingActive, setPollingActive] = useState(true);
  const [expiredAt, setExpiredAt] = useState(false);
  const [confirmationTimedOut, setConfirmationTimedOut] = useState(false);
  const [recheckCount, setRecheckCount] = useState(0);
  const invalidatedIntentId = useRef<string | null>(null);
  const intentQuery = useGetSallaIntentStatusQuery(intentId ?? "", {
    skip: !intentId || callbackFailed,
    refetchOnMountOrArgChange: true,
  });
  const refetchIntent = intentQuery.refetch;
  const intent = intentQuery.data;
  const intentStatus = intent?.status;
  const expired = intent?.status === "EXPIRED" || expiredAt;
  const terminal =
    intentStatus === "COMPLETED" ||
    intentStatus === "FAILED" ||
    intentStatus === "EXPIRED" ||
    intentStatus === "CANCELLED" ||
    expired;

  useEffect(() => {
    if (!intentId || !callbackFailed || !isTerminalStatus(callbackStatus))
      return;
    publishSallaConnectionTerminal({ intentId, status: callbackStatus });
  }, [callbackFailed, callbackStatus, intentId]);

  useEffect(() => {
    if (!intentId || !isTerminalStatus(intentStatus) || callbackFailed) return;
    publishSallaConnectionTerminal({ intentId, status: intentStatus });
  }, [callbackFailed, intentId, intentStatus]);

  useEffect(() => {
    if (terminal) return;
    const timer = window.setTimeout(() => {
      setPollingActive(false);
      setConfirmationTimedOut(true);
    }, MAX_POLLING_MS);
    return () => window.clearTimeout(timer);
  }, [rawIntentId, terminal, recheckCount]);

  useEffect(() => {
    if (!intentId || !intent || terminal || !pollingActive) return;
    const timer = window.setTimeout(() => void refetchIntent(), 2000);
    return () => window.clearTimeout(timer);
  }, [intent, intentId, pollingActive, refetchIntent, terminal]);

  useEffect(() => {
    if (
      !intentId ||
      intentStatus !== "COMPLETED" ||
      invalidatedIntentId.current === intentId
    )
      return;
    invalidatedIntentId.current = intentId;
    dispatch(connectionsApi.util.invalidateTags(["Connection"]));
  }, [dispatch, intentId, intentStatus]);

  useEffect(() => {
    if (!intent || expiredAt) return;
    const remaining = new Date(intent.expiresAt).getTime() - Date.now();
    const timer = window.setTimeout(
      () => setExpiredAt(true),
      Math.max(0, remaining),
    );
    return () => window.clearTimeout(timer);
  }, [expiredAt, intent]);

  function goBack() {
    router.replace("/connections");
  }

  function retryConfirmation() {
    if (recheckCount >= MAX_RECHECKS) return;
    setRecheckCount((count) => count + 1);
    setConfirmationTimedOut(false);
    setPollingActive(true);
    void refetchIntent();
  }

  if (callbackStatus === "CANCELLED")
    return (
      <ResultState
        icon={<XCircle />}
        title="Salla connection cancelled"
        description="This connection request was cancelled. Start a new request from the connections page."
        action={goBack}
        actionLabel="Back to connections"
      />
    );
  if (callbackStatus === "EXPIRED")
    return (
      <ResultState
        icon={<Clock3 />}
        title="This connection request expired"
        description="The Salla authorization request is no longer active. Start a new connection from the connections page."
        action={goBack}
        actionLabel="Back to connections"
      />
    );
  if (callbackStatus === "FAILED")
    return (
      <ResultState
        icon={<AlertCircle />}
        title="Salla connection failed"
        description={callbackFailureDescription(callbackReason)}
        action={goBack}
        actionLabel="Back to connections"
      />
    );
  if (!intentId)
    return (
      <ResultState
        icon={<AlertCircle />}
        title="Connection details are missing"
        description="This Salla callback has an invalid connection request ID."
        action={goBack}
        actionLabel="Back to connections"
      />
    );
  if (intentQuery.isLoading || (!intent && !intentQuery.isError))
    return (
      <main className="mx-auto max-w-xl px-6 py-16">
        <QuerySkeleton rows={2} />
        <p className="mt-3 text-center text-xs text-muted-foreground">
          {callbackStatus === "FAILED"
            ? "Verifying the failed callback with Salla…"
            : "Verifying the Salla callback…"}
        </p>
      </main>
    );
  if (intentQuery.isError)
    return (
      <main className="mx-auto max-w-xl px-6 py-16">
        <QueryError
          title="Couldn’t verify the Salla connection"
          onRetry={() => void intentQuery.refetch()}
        />
        <Button variant="ghost" className="mt-4" onClick={goBack}>
          Back to connections
        </Button>
      </main>
    );
  if (intent?.status === "COMPLETED")
    return (
      <ResultState
        icon={<CheckCircle2 />}
        title="Salla is connected"
        description={
          callbackReason === "sync_failed"
            ? "Your store is connected, but the initial import needs attention. Open connections to retry the sync."
            : "Your store is connected. Tarmeez will begin importing its data shortly."
        }
        action={goBack}
        actionLabel="Back to connections"
        success
      />
    );
  if (expired)
    return (
      <ResultState
        icon={<Clock3 />}
        title="This connection request expired"
        description="The Salla authorization request is no longer active. Start a new connection from the connections page."
        action={goBack}
        actionLabel="Back to connections"
      />
    );
  if (intent?.status === "FAILED")
    return (
      <ResultState
        icon={<AlertCircle />}
        title="Salla connection failed"
        description="Salla could not authorize this connection. Start again from the connections page."
        action={goBack}
        actionLabel="Back to connections"
      />
    );
  if (intent?.status === "CANCELLED")
    return (
      <ResultState
        icon={<XCircle />}
        title="Salla connection cancelled"
        description="This connection request was cancelled. Start a new request from the connections page."
        action={goBack}
        actionLabel="Back to connections"
      />
    );
  if (confirmationTimedOut)
    return (
      <ResultState
        icon={<Clock3 />}
        title="Still confirming your Salla connection"
        description="Salla has not finished confirming this request yet. Check again or return to connections; we will not mark it as failed without confirmation."
        action={retryConfirmation}
        actionLabel={
          recheckCount < MAX_RECHECKS ? "Check again" : "Retry limit reached"
        }
        secondaryAction={goBack}
        secondaryActionLabel="Back to connections"
      />
    );
  return (
    <ResultState
      icon={<Store />}
      title="Finishing your Salla connection"
      description="We’re confirming the authorization with Salla. This page will update automatically."
    />
  );
}

function callbackFailureDescription(reason: string | null) {
  if (reason === "workspace_owner_required")
    return "This connection request no longer belongs to an active workspace owner. Start again from the connections page.";
  if (reason === "state_invalid")
    return "This connection request is no longer valid. Start again from the connections page.";
  if (reason === "ownership_conflict")
    return "This Salla store is already connected to another workspace. Start again with a different store.";
  if (reason === "not_configured")
    return "Salla is temporarily unavailable. Try again later or contact your administrator.";
  return "Salla could not authorize this connection. Start again from the connections page.";
}

function isTerminalStatus(
  status: string | undefined,
): status is Extract<
  SallaIntentStatus,
  "COMPLETED" | "FAILED" | "EXPIRED" | "CANCELLED"
> {
  return (
    status === "COMPLETED" ||
    status === "FAILED" ||
    status === "EXPIRED" ||
    status === "CANCELLED"
  );
}

function ResultState({
  icon,
  title,
  description,
  action,
  actionLabel,
  secondaryAction,
  secondaryActionLabel,
  success = false,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: () => void;
  actionLabel?: string;
  secondaryAction?: () => void;
  secondaryActionLabel?: string;
  success?: boolean;
}) {
  return (
    <main className="mx-auto flex min-h-[50vh] max-w-xl items-center justify-center px-6">
      <section className="w-full rounded-2xl border bg-card p-8 text-center shadow-sm">
        <span
          className={`mx-auto grid size-12 place-items-center rounded-full ${success ? "bg-emerald-500/10 text-emerald-600" : "bg-primary/10 text-primary"}`}
        >
          {icon}
        </span>
        <h1 className="mt-5 text-lg font-semibold">{title}</h1>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
          {description}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {action && actionLabel && (
            <Button
              className="min-h-11 rounded-lg"
              onClick={action}
              disabled={actionLabel === "Retry limit reached"}
            >
              {actionLabel}
            </Button>
          )}
          {secondaryAction && secondaryActionLabel && (
            <Button
              variant="ghost"
              className="min-h-11 rounded-lg"
              onClick={secondaryAction}
            >
              {secondaryActionLabel}
            </Button>
          )}
        </div>
      </section>
    </main>
  );
}
