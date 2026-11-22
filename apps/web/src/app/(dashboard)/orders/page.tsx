import type { Metadata } from "next";
import { CommerceDataPage } from "@/components/features/commerce/CommerceDataPage";
export const metadata: Metadata = { title: "Orders | Tarmeez" };
export default function OrdersRoute() { return <CommerceDataPage resource="orders" />; }
