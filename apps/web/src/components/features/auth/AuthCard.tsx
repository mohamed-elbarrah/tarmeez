import Link from "next/link";
import type { ReactNode } from "react";
import { Brand } from "@/components/common/Brand";

interface AuthCardProps {
  title: string;
  description: string;
  children: ReactNode;
  footer: ReactNode;
}

export function AuthCard({ title, description, children, footer }: AuthCardProps) {
  return (
    <main className="grid min-h-screen lg:grid-cols-[1fr_1fr]">
      <section className="flex flex-col px-6 py-6 sm:px-10 lg:px-14">
        <Brand />
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-12">
          <div className="mb-8">
            <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
          </div>
          {children}
          <div className="mt-8 text-center text-sm text-muted-foreground">{footer}</div>
        </div>
        <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} Tarmeez</p>
      </section>
      <aside className="relative hidden overflow-hidden bg-[#0d3434] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div aria-hidden="true" className="absolute -right-28 -top-32 size-[34rem] rounded-full border border-white/10" />
        <div aria-hidden="true" className="absolute -right-8 -top-12 size-[24rem] rounded-full border border-white/10" />
        <div className="relative z-10 self-end text-xs font-medium tracking-[0.2em] text-white/60">COMMERCE, IN FOCUS</div>
        <div className="relative z-10 max-w-lg pb-10">
          <div className="mb-6 h-1 w-12 rounded-full bg-teal-300" />
          <p className="text-4xl font-medium leading-tight tracking-tight">See your store clearly. Make your next move confidently.</p>
          <p className="mt-5 max-w-md text-base leading-7 text-white/65">Bring your commerce data together and turn the everyday numbers into a clearer picture of your business.</p>
        </div>
        <div className="relative z-10 flex items-center justify-between text-xs text-white/50"><span>Built for ambitious merchants</span><Link className="hover:text-white" href="/">tarmeez.com</Link></div>
      </aside>
    </main>
  );
}
