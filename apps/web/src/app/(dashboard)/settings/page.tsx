import type { Metadata } from "next";
import { SettingsPage } from "@/components/features/settings/SettingsPage";
export const metadata: Metadata = { title: "Settings | Tarmeez" };
export default function SettingsRoute() { return <SettingsPage />; }
