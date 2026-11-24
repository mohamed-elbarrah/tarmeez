"use client";

import { useState } from "react";
import { ExternalLink, LoaderCircle, Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useStartMetaConnectionMutation } from "@/services/adsApi";
import { getApiErrorMessage } from "@/lib/api-error";

interface ConnectMetaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ConnectMetaDialog({
  open,
  onOpenChange,
}: ConnectMetaDialogProps) {
  const [start, state] = useStartMetaConnectionMutation();
  const [popupBlocked, setPopupBlocked] = useState(false);

  async function connect() {
    const popup = window.open("about:blank", "meta-ads-connection");
    try {
      const result = await start().unwrap();
      if (popup && !popup.closed)
        popup.location.replace(result.authorizationUrl);
      else setPopupBlocked(true);
    } catch {
      popup?.close();
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-5 sm:max-w-lg">
        <DialogHeader>
          <div className="mb-1 grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
            <Megaphone className="size-5" />
          </div>
          <DialogTitle>Connect Meta Ads</DialogTitle>
          <DialogDescription>
            Authorize Tarmeez with Meta, then choose the ad accounts you want to
            monitor. You can connect more than one account.
          </DialogDescription>
        </DialogHeader>
        {state.error && (
          <p
            role="alert"
            className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
          >
            {getApiErrorMessage(state.error)}
          </p>
        )}
        {popupBlocked && (
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
            Your browser blocked the Meta window. Start again and allow pop-ups
            for Tarmeez.
          </p>
        )}
        <DialogFooter>
          <Button
            type="button"
            className="min-h-11 rounded-lg"
            disabled={state.isLoading}
            onClick={() => void connect()}
          >
            {state.isLoading ? (
              <>
                <LoaderCircle className="mr-2 size-4 animate-spin" />
                Starting…
              </>
            ) : (
              <>
                <ExternalLink className="mr-2 size-4" />
                Continue to Meta
              </>
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
      </DialogContent>
    </Dialog>
  );
}
