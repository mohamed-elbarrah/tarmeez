import type { Metadata } from "next";
import { ConnectionsPage } from "@/components/features/connections/ConnectionsPage";

export const metadata: Metadata = { title: "Connections | Tarmeez" };

export default function ConnectionsRoute() { return <ConnectionsPage />; }
