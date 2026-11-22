import type { Metadata } from "next";
import { TeamPage } from "@/components/features/team/TeamPage";
export const metadata: Metadata = { title: "Team | Tarmeez" };
export default function TeamRoute() { return <TeamPage />; }
