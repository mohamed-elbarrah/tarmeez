"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Activity, Boxes, LayoutDashboard, LogOut, Menu, Settings2, ShoppingBag, Users } from "lucide-react";
import { Brand } from "@/components/common/Brand";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useGetMeQuery, useLogoutMutation } from "@/services/authApi";
import { useGetMerchantProfileQuery } from "@/services/merchantApi";

interface DashboardShellProps { children: ReactNode }

const navigation = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/connections", label: "Connections", icon: Activity },
  { href: "/products", label: "Products", icon: Boxes },
  { href: "/orders", label: "Orders", icon: ShoppingBag },
  { href: "/customers", label: "Customers", icon: Users },
  { href: "/team", label: "Team", icon: Users },
  { href: "/settings", label: "Settings", icon: Settings2 },
];

export function DashboardShell({ children }: DashboardShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: principal, isLoading, isError } = useGetMeQuery();
  const { data: profile } = useGetMerchantProfileQuery(undefined, { skip: principal?.role !== "MERCHANT" });
  const [logout, { isLoading: isLoggingOut }] = useLogoutMutation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    if (principal?.role === "ADMIN") router.replace("/welcome");
  }, [principal, router]);

  useEffect(() => {
    if (isError) router.replace("/login");
  }, [isError, router]);

  async function signOut() {
    try { await logout().unwrap(); } catch { /* Local credentials clear even when the API is unreachable. */ }
    router.replace("/login");
  }

  const pageTitle = navigation.find((item) => item.href === pathname || (item.href !== "/dashboard" && pathname.startsWith(`${item.href}/`)))?.label ?? "Workspace";

  if (isLoading || !principal || principal.role !== "MERCHANT") {
    return <div className="grid min-h-screen place-items-center bg-muted/30"><div role="status" className="w-full max-w-sm space-y-3 px-6"><div className="h-8 w-32 animate-pulse rounded bg-muted"/><div className="h-4 w-full animate-pulse rounded bg-muted"/><p className="sr-only">Loading your workspace</p></div></div>;
  }

  const links = <nav aria-label="Main navigation" className="space-y-1">{navigation.map(({ href, label, icon: Icon }) => {
    const active = href === "/dashboard" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
    return <Link key={href} href={href} onClick={() => setMobileNavOpen(false)} aria-current={active ? "page" : undefined} className={`flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors ${active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}><Icon className="size-[18px]" aria-hidden="true" />{label}</Link>;
  })}</nav>;

  return <div className="min-h-screen bg-muted/30">
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r bg-background px-4 py-5 lg:flex">
      <div className="px-2"><Brand /></div>
      <div className="mt-9 rounded-xl border bg-muted/40 px-3 py-3"><p className="truncate text-sm font-semibold">{profile?.merchant.name ?? "Your workspace"}</p><p className="mt-1 text-xs text-muted-foreground">Merchant workspace</p></div>
      <div className="mt-7 px-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Workspace</div>
      <div className="mt-2">{links}</div>
      <div className="mt-auto border-t pt-4"><div className="mb-3 truncate px-2 text-xs text-muted-foreground">{profile?.user.email}</div><Button variant="ghost" className="w-full justify-start text-muted-foreground" onClick={signOut} disabled={isLoggingOut}><LogOut className="mr-2 size-4" />{isLoggingOut ? "Signing out…" : "Sign out"}</Button></div>
    </aside>
    <div className="lg:pl-64">
      <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b bg-background/95 px-4 backdrop-blur sm:px-7">
        <div className="flex items-center gap-3"><Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}><SheetTrigger asChild><Button variant="outline" size="icon" aria-label="Open navigation" className="lg:hidden"><Menu /></Button></SheetTrigger><SheetContent side="left" className="w-[280px] p-4"><SheetHeader className="px-1"><SheetTitle><Brand /></SheetTitle></SheetHeader><div className="mt-6">{links}</div></SheetContent></Sheet><span className="text-sm font-semibold">{pageTitle}</span></div>
        <div className="flex items-center gap-3"><span className="hidden text-sm text-muted-foreground sm:block">{profile?.user.name}</span><span className="grid size-8 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary" aria-label={`${profile?.user.name ?? "Merchant"} account`}>{profile?.user.name?.slice(0, 1).toUpperCase() ?? "M"}</span></div>
      </header>
      <main className="mx-auto w-full max-w-[1440px] px-4 py-7 sm:px-7 sm:py-9">{children}</main>
    </div>
  </div>;
}
