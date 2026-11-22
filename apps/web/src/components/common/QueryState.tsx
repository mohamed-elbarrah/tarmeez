import { AlertCircle, Inbox, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

interface QueryErrorProps { title?: string; onRetry: () => void }
interface EmptyStateProps { title: string; description: string; action?: React.ReactNode }

export function QuerySkeleton({ rows = 4 }: { rows?: number }) {
  return <div role="status" aria-label="Loading" className="space-y-3">{Array.from({ length: rows }, (_, index) => <Skeleton key={index} className="h-14 w-full rounded-lg" />)}</div>;
}

export function QueryError({ title = "We couldn’t load this information", onRetry }: QueryErrorProps) {
  return <div role="alert" className="flex flex-col items-start gap-3 rounded-xl border border-destructive/20 bg-destructive/[0.03] p-5 sm:flex-row sm:items-center sm:justify-between"><div className="flex gap-3"><AlertCircle className="mt-0.5 size-5 shrink-0 text-destructive" /><div><p className="text-sm font-medium">{title}</p><p className="mt-1 text-sm text-muted-foreground">Check your connection and try again.</p></div></div><Button variant="outline" size="sm" onClick={onRetry}><RefreshCw className="mr-2 size-3.5" />Retry</Button></div>;
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return <div className="flex min-h-64 flex-col items-center justify-center rounded-xl border border-dashed bg-card/50 px-6 py-12 text-center"><span className="mb-4 grid size-11 place-items-center rounded-full bg-muted text-muted-foreground"><Inbox className="size-5" /></span><h2 className="text-sm font-semibold">{title}</h2><p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">{description}</p>{action && <div className="mt-5">{action}</div>}</div>;
}
