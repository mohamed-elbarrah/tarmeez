import { Badge } from "@/components/ui/badge";
import type { ConnectionStatus, SyncStatus } from "@/types/merchant.types";

interface StatusBadgeProps { status: ConnectionStatus | SyncStatus | string }

const labels: Record<string, string> = {
  CONNECTED: "Connected", REAUTH_REQUIRED: "Action needed", DISCONNECTED: "Disconnected",
  QUEUED: "Queued", RUNNING: "In progress", SUCCEEDED: "Completed", PARTIAL: "Partial", FAILED: "Failed",
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const variant = status === "CONNECTED" || status === "SUCCEEDED" ? "secondary" : status === "FAILED" || status === "REAUTH_REQUIRED" ? "destructive" : "outline";
  const dot = status === "CONNECTED" || status === "SUCCEEDED" ? "bg-emerald-500" : status === "FAILED" || status === "REAUTH_REQUIRED" ? "bg-destructive" : status === "RUNNING" || status === "QUEUED" ? "bg-amber-500" : "bg-muted-foreground";
  return <Badge variant={variant} className="gap-1.5 rounded-full border-transparent px-2.5 py-1 font-medium"><span className={`size-1.5 rounded-full ${dot}`} aria-hidden="true" />{labels[status] ?? status}</Badge>;
}
