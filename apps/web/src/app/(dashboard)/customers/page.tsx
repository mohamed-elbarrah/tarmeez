import type { Metadata } from "next";
import { CommerceDataPage } from "@/components/features/commerce/CommerceDataPage";
export const metadata: Metadata = { title: "Customers | Tarmeez" };
export default function CustomersRoute() { return <CommerceDataPage resource="customers" />; }
