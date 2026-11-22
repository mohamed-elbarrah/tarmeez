import type { Metadata } from "next";
import { CommerceDataPage } from "@/components/features/commerce/CommerceDataPage";
export const metadata: Metadata = { title: "Products | Tarmeez" };
export default function ProductsRoute() { return <CommerceDataPage resource="products" />; }
