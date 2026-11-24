"use client";

import { startTransition, useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  ExternalLink,
  LoaderCircle,
  RefreshCw,
  Store,
  XCircle,
} from "lucide-react";
import { useAppDispatch } from "@/store/hooks";
import {
  connectionsApi,
  useCancelSallaIntentMutation,
  useGetSallaIntentStatusQuery,
  useStartSallaConnectionMutation,
} from "@/services/connectionsApi";
import { getApiErrorMessage } from "@/lib/api-error";
import { subscribeToSallaConnectionTerminal } from "@/lib/salla-connection-events";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { SallaIntentStatus } from "@/types/merchant.types";

const MAX_WAITING_MS = 60_000;
const POLLING_INTERVAL_MS = 2_000;
const TERMINAL_STATUSES: SallaIntentStatus[] = [
  "COMPLETED",
  "FAILED",
  "EXPIRED",
  "CANCELLED",
];
const SALLA_WINDOW_NAME = "salla-connection";

interface ConnectSallaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface RequestState {
  intentId: string;
  authorizationUrl: string;
  expiresAt: string;
}

export function ConnectSallaDialog({
  open,
  onOpenChange,
}: ConnectSallaDialogProps) {
  const dispatch = useAppDispatch();
  const [start, startState] = useStartSallaConnectionMutation();
  const [cancel, cancelState] = useCancelSallaIntentMutation();
  const [request, setRequest] = useState<RequestState | null>(null);
  const [polling, setPolling] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [popupBlocked, setPopupBlocked] = useState(false);
  const [cancelError, setCancelError] = useState<unknown>(null);
  const intentQuery = useGetSallaIntentStatusQuery(request?.intentId ?? "", {
    skip: !request,
    pollingInterval: polling && !timedOut ? POLLING_INTERVAL_MS : 0,
    refetchOnMountOrArgChange: true,
  });
  const { refetch: refetchIntent } = intentQuery;
  const intentStatus = intentQuery.data?.status;
  const terminal = !!intentStatus && TERMINAL_STATUSES.includes(intentStatus);
  const active = !!request && polling && !terminal && !timedOut;

  useEffect(() => {
    if (terminal) startTransition(() => setPolling(false));
  }, [terminal]);

  useEffect(() => {
    if (!request || !polling || terminal) return;
    const timer = window.setTimeout(() => setTimedOut(true), MAX_WAITING_MS);
    return () => window.clearTimeout(timer);
  }, [polling, request, terminal]);

  useEffect(() => {
    if (!request || !terminal || intentStatus !== "COMPLETED") return;
    dispatch(connectionsApi.util.invalidateTags(["Connection"]));
  }, [dispatch, intentStatus, request, terminal]);

  useEffect(
    () =>
      subscribeToSallaConnectionTerminal((event) => {
        if (event.intentId === request?.intentId) void refetchIntent();
      }),
    [refetchIntent, request?.intentId],
  );

  async function handleConnect() {
    const popup = openSallaWindow("about:blank");
    setPopupBlocked(!popup || popup.closed);
    setCancelError(null);
    setTimedOut(false);
    try {
      const result = await start().unwrap();
      setRequest(result);
      setPolling(true);
      if (popup && !popup.closed) {
        popup.location.replace(result.authorizationUrl);
      } else {
        setPopupBlocked(true);
      }
    } catch {
      if (popup && !popup.closed) popup.close();
    }
  }

  async function handleCancel(close = false) {
    if (!request) return;
    setCancelError(null);
    try {
      await cancel(request.intentId).unwrap();
      reset();
      if (close) onOpenChange(false);
    } catch (error) {
      setCancelError(error);
    }
  }

  function reset() {
    setRequest(null);
    setPolling(false);
    setTimedOut(false);
    setPopupBlocked(false);
    setCancelError(null);
  }

  function handleDialogChange(nextOpen: boolean) {
    if (!nextOpen && request && active) {
      void handleCancel(true);
      return;
    }
    if (!nextOpen) reset();
    onOpenChange(nextOpen);
  }

  function openSalla() {
    if (!request) return;
    const popup = openSallaWindow(request.authorizationUrl);
    setPopupBlocked(!popup || popup.closed);
  }

  const error = startState.error ?? cancelError;

  return (
    <Dialog open={open} onOpenChange={handleDialogChange}>
      <DialogContent className="gap-5 sm:max-w-lg">
        {!request ? (
          <>
            <DialogHeader>
              <div className="mb-1 grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
                <Store className="size-5" />
              </div>
              <DialogTitle>Connect a Salla store</DialogTitle>
              <DialogDescription>
                Authorize Tarmeez with Salla to securely import your store data.
                This tab stays open while Salla confirms access.
              </DialogDescription>
            </DialogHeader>
            {startState.error && <ErrorMessage error={startState.error} />}
            <DialogFooter>
              <Button
                type="button"
                disabled={startState.isLoading}
                onClick={() => void handleConnect()}
                className="min-h-11 rounded-lg"
              >
                {startState.isLoading ? (
                  <>
                    <LoaderCircle className="mr-2 size-4 animate-spin motion-reduce:animate-none" />
                    Starting…
                  </>
                ) : (
                  "Connect Salla"
                )}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="min-h-11 rounded-lg"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <div className="relative mb-1 grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary">
                <span className="absolute inset-0 rounded-2xl border border-primary/20 motion-safe:animate-ping motion-reduce:animate-none" />
                <Store className="relative size-6" />
              </div>
              <DialogTitle>
                {titleForStatus(intentStatus, timedOut)}
              </DialogTitle>
              <DialogDescription>
                {descriptionForStatus(intentStatus, timedOut)}
              </DialogDescription>
            </DialogHeader>
            <div
              className="grid gap-3 rounded-xl border bg-muted/25 p-4"
              role="status"
              aria-live="polite"
            >
              {[
                ["Open Salla", "Open the authorization page in the new tab."],
                ["Approve access", "Review the requested store permissions."],
                [
                  "Confirm connection",
                  "Return here while Tarmeez verifies the result.",
                ],
              ].map(([title, description], index) => (
                <div className="flex items-start gap-3" key={title}>
                  <span
                    className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold ${stepClass(index, intentStatus, timedOut)}`}
                  >
                    {stepIcon(index, intentStatus, timedOut)}
                  </span>
                  <div>
                    <p className="text-sm font-medium">{title}</p>
                    <p className="text-xs leading-5 text-muted-foreground">
                      {description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            {popupBlocked && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
                <p className="font-medium">
                  Salla could not open automatically.
                </p>
                <a
                  className="mt-2 inline-flex min-h-11 items-center gap-2 font-medium text-primary underline-offset-4 hover:underline"
                  href={request.authorizationUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open Salla in a new tab <ExternalLink className="size-4" />
                </a>
              </div>
            )}
            {error && <ErrorMessage error={error} />}
            <DialogFooter className="sm:justify-between">
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 rounded-lg"
                  onClick={openSalla}
                  disabled={terminal || timedOut}
                >
                  <ExternalLink className="mr-2 size-4" />
                  Open Salla again
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="min-h-11 rounded-lg"
                  onClick={() => void handleCancel()}
                  disabled={cancelState.isLoading || terminal}
                >
                  {cancelState.isLoading ? "Cancelling…" : "Cancel request"}
                </Button>
              </div>
              {terminal && (
                <Button
                  type="button"
                  className="min-h-11 rounded-lg"
                  onClick={() => {
                    reset();
                    if (intentStatus === "COMPLETED") onOpenChange(false);
                  }}
                >
                  {intentStatus === "COMPLETED" ? "Close" : "Try again"}
                </Button>
              )}
              {timedOut && !terminal && (
                <Button
                  type="button"
                  className="min-h-11 rounded-lg"
                  onClick={() => {
                    setTimedOut(false);
                    setPolling(true);
                    void refetchIntent();
                  }}
                >
                  <RefreshCw className="mr-2 size-4" />
                  Check again
                </Button>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function openSallaWindow(url: string): Window | null {
  const popup = window.open(url, SALLA_WINDOW_NAME);
  if (popup) popup.opener = null;
  return popup;
}

function titleForStatus(
  status: SallaIntentStatus | undefined,
  timedOut: boolean,
) {
  if (status === "COMPLETED") return "Salla is connected";
  if (status === "FAILED") return "Salla could not connect";
  if (status === "EXPIRED") return "This request expired";
  if (status === "CANCELLED") return "Connection request cancelled";
  if (timedOut) return "Still waiting for Salla";
  return "Finish connecting Salla";
}

function descriptionForStatus(
  status: SallaIntentStatus | undefined,
  timedOut: boolean,
) {
  if (status === "COMPLETED")
    return "Your store is connected. Tarmeez will begin importing its data shortly.";
  if (status === "FAILED")
    return "Salla did not approve this request. Start again or try a different store.";
  if (status === "EXPIRED")
    return "This authorization link is no longer active. Start a new request.";
  if (status === "CANCELLED")
    return "The request was cancelled. You can start a new connection whenever you are ready.";
  if (timedOut)
    return "We have not received confirmation yet. Check again or cancel this request to start over.";
  return "Keep this tab open. We will confirm the connection automatically after you approve access in Salla.";
}

function stepClass(
  index: number,
  status: SallaIntentStatus | undefined,
  timedOut: boolean,
) {
  if (status === "COMPLETED" || (index === 0 && !!status))
    return "bg-emerald-500/15 text-emerald-600";
  if (
    status === "FAILED" ||
    status === "EXPIRED" ||
    status === "CANCELLED" ||
    timedOut
  )
    return "bg-amber-500/15 text-amber-600";
  return index === 0
    ? "bg-primary text-primary-foreground"
    : "bg-muted text-muted-foreground";
}

function stepIcon(
  index: number,
  status: SallaIntentStatus | undefined,
  timedOut: boolean,
) {
  if (status === "COMPLETED" || (index === 0 && !!status))
    return <CheckCircle2 className="size-4" />;
  if (status === "FAILED")
    return index === 2 ? <XCircle className="size-4" /> : index + 1;
  if (status === "EXPIRED" || status === "CANCELLED" || timedOut)
    return index === 2 ? <Clock3 className="size-4" /> : index + 1;
  return index + 1;
}

function ErrorMessage({ error }: { error: unknown }) {
  return (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0" />
      {getApiErrorMessage(error)}
    </p>
  );
}
