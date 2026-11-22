import Link from "next/link";
import { Layers3 } from "lucide-react";

export function Brand() {
  return (
    <Link href="/" className="inline-flex items-center gap-2.5 font-semibold tracking-tight" aria-label="Tarmeez home">
      <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground"><Layers3 className="size-5" aria-hidden="true" /></span>
      <span className="text-xl">tarmeez</span>
    </Link>
  );
}
