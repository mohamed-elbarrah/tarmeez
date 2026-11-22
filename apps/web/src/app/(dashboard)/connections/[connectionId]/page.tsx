import type { Metadata } from "next";
import { ConnectionDetailPage } from "@/components/features/connections/ConnectionDetailPage";

export const metadata: Metadata = { title: "Store connection | Tarmeez" };

export default function ConnectionDetailRoute() { return <ConnectionDetailPage />; }
