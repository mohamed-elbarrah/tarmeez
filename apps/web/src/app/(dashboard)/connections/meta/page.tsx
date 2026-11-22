import { redirect } from "next/navigation";

export const metadata = { title: "Meta Ads Connection — Tarmeez" };

export default function MetaConnectionPage() {
  redirect("/connections");
}
