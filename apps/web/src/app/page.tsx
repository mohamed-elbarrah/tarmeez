import Link from "next/link";
import { ArrowRight, BarChart3, Boxes, ShoppingBag } from "lucide-react";
import { Brand } from "@/components/common/Brand";
import { Button } from "@/components/ui/button";

const highlights = [
  { icon: ShoppingBag, title: "Your store, connected", text: "Bring your Salla store data into one clear workspace." },
  { icon: BarChart3, title: "A clearer picture", text: "See the signals behind your products, customers, and orders." },
  { icon: Boxes, title: "Everything in context", text: "Spend less time switching tools and more time moving forward." },
];

export default function HomePage() {
  return (
    <main className="min-h-screen overflow-hidden bg-background">
      <header className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-6 sm:px-10">
        <Brand />
        <nav aria-label="Account" className="flex items-center gap-3">
          <Link href="/login" className="hidden text-sm font-medium text-muted-foreground transition-colors hover:text-foreground sm:inline-flex">Sign in</Link>
          <Button asChild className="h-10 rounded-lg px-4"><Link href="/register">Create account <ArrowRight className="ml-2 size-4" /></Link></Button>
        </nav>
      </header>
      <section className="relative mx-auto grid max-w-7xl items-center gap-14 px-6 pb-20 pt-12 sm:px-10 sm:pb-28 sm:pt-20 lg:grid-cols-[1.05fr_.95fr]">
        <div aria-hidden="true" className="pointer-events-none absolute -left-56 top-4 size-[30rem] rounded-full bg-primary/5 blur-3xl" />
        <div className="relative">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground"><span className="size-2 rounded-full bg-primary" /> Commerce intelligence for growing stores</div>
          <h1 className="max-w-2xl text-5xl font-semibold leading-[1.08] tracking-[-0.045em] sm:text-6xl lg:text-7xl">Your commerce data, <span className="text-primary">finally in focus.</span></h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-muted-foreground">Understand what is happening across your store with one calm, connected view of your products, customers, and orders.</p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg" className="h-12 rounded-lg px-6 text-sm"><Link href="/register">Get started <ArrowRight className="ml-2 size-4" /></Link></Button>
            <Button asChild variant="outline" size="lg" className="h-12 rounded-lg px-6 text-sm"><Link href="/login">Sign in to your account</Link></Button>
          </div>
          <p className="mt-5 text-xs text-muted-foreground">No credit card required · Connect your store when you’re ready</p>
        </div>
        <div className="relative mx-auto w-full max-w-xl">
          <div className="absolute -inset-5 rounded-[2rem] bg-gradient-to-br from-primary/10 via-transparent to-teal-200/30 blur-xl" />
          <div className="relative rounded-2xl border bg-card p-5 shadow-xl shadow-foreground/[0.06] sm:p-7">
            <div className="flex items-center justify-between border-b pb-5"><div><p className="text-sm font-semibold">Store snapshot</p><p className="mt-1 text-xs text-muted-foreground">A connected view of your business</p></div><span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700"><span className="size-1.5 rounded-full bg-emerald-500"/>Connected</span></div>
            <div className="grid grid-cols-2 gap-3 py-5"><div className="rounded-xl bg-muted/70 p-4"><p className="text-xs text-muted-foreground">Orders</p><p className="mt-2 text-2xl font-semibold tracking-tight">Your data</p><p className="mt-1 text-xs text-muted-foreground">Synced from your store</p></div><div className="rounded-xl bg-muted/70 p-4"><p className="text-xs text-muted-foreground">Products</p><p className="mt-2 text-2xl font-semibold tracking-tight">In one place</p><p className="mt-1 text-xs text-muted-foreground">Easy to explore</p></div></div>
            <div className="rounded-xl border p-4"><div className="flex items-center justify-between"><p className="text-xs font-medium">Commerce at a glance</p><span className="text-xs text-muted-foreground">Live workspace</span></div><div className="mt-5 flex h-24 items-end gap-2" aria-label="Decorative analytics preview">{["h-[35%]", "h-[52%]", "h-[44%]", "h-[70%]", "h-[57%]", "h-[84%]", "h-[63%]", "h-[95%]", "h-[74%]", "h-full", "h-[78%]", "h-[88%]"].map((height, index) => <div key={index} className={`flex-1 rounded-t-sm bg-primary/20 ${height}`}><div className="h-2/3 rounded-t-sm bg-primary/70" /></div>)}</div><div className="mt-3 flex justify-between text-[10px] text-muted-foreground"><span>PRODUCTS</span><span>ORDERS</span><span>CUSTOMERS</span></div></div>
          </div>
        </div>
      </section>
      <section className="border-t bg-muted/30"><div className="mx-auto grid max-w-7xl gap-8 px-6 py-14 sm:px-10 md:grid-cols-3 md:py-16">{highlights.map(({ icon: Icon, title, text }) => <div key={title} className="flex gap-4"><span className="grid size-10 shrink-0 place-items-center rounded-xl border bg-background text-primary"><Icon className="size-5" aria-hidden="true" /></span><div><h2 className="text-sm font-semibold">{title}</h2><p className="mt-2 max-w-xs text-sm leading-6 text-muted-foreground">{text}</p></div></div>)}</div></section>
      <footer className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6 text-xs text-muted-foreground sm:px-10"><span>© {new Date().getFullYear()} Tarmeez</span><span>Commerce, in focus.</span></footer>
    </main>
  );
}
