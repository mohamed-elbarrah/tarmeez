import type { SallaIntentStatus } from "@/types/merchant.types";

const CHANNEL_NAME = "tarmeez-salla-connection";
const STORAGE_KEY = "tarmeez:salla-connection-terminal";

export interface SallaConnectionTerminalEvent {
  intentId: string;
  status: Extract<
    SallaIntentStatus,
    "COMPLETED" | "FAILED" | "EXPIRED" | "CANCELLED"
  >;
}

export function publishSallaConnectionTerminal(
  event: SallaConnectionTerminalEvent,
) {
  if (typeof window === "undefined") return;
  const payload = JSON.stringify(event);
  try {
    if ("BroadcastChannel" in window) {
      const channel = new BroadcastChannel(CHANNEL_NAME);
      channel.postMessage(event);
      channel.close();
    }
  } catch {
    // localStorage below is the fallback for browsers without working channels.
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, payload);
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Private browsing can deny storage; polling remains the reliable fallback.
  }
}

export function subscribeToSallaConnectionTerminal(
  onEvent: (event: SallaConnectionTerminalEvent) => void,
) {
  if (typeof window === "undefined") return () => undefined;
  const handleMessage = (event: MessageEvent<SallaConnectionTerminalEvent>) => {
    if (isTerminalEvent(event.data)) onEvent(event.data);
  };
  const handleStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY || !event.newValue) return;
    try {
      const value: unknown = JSON.parse(event.newValue);
      if (isTerminalEvent(value)) onEvent(value);
    } catch {
      // Ignore malformed storage events from other application versions.
    }
  };
  let channel: BroadcastChannel | null = null;
  try {
    if ("BroadcastChannel" in window) {
      channel = new BroadcastChannel(CHANNEL_NAME);
      channel.addEventListener("message", handleMessage);
    }
  } catch {
    channel = null;
  }
  window.addEventListener("storage", handleStorage);
  return () => {
    channel?.removeEventListener("message", handleMessage);
    channel?.close();
    window.removeEventListener("storage", handleStorage);
  };
}

function isTerminalEvent(
  value: unknown,
): value is SallaConnectionTerminalEvent {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.intentId === "string" &&
    ["COMPLETED", "FAILED", "EXPIRED", "CANCELLED"].includes(
      String(candidate.status),
    )
  );
}
