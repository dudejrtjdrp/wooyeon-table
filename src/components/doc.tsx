import type { ReactNode } from "react";
import { Screen } from "./ui";

export function DocPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <Screen title={title} back="/me">
      <h1 className="mt-4 text-[30px] font-bold tracking-[-0.03em] text-ink">{title}</h1>
      <p className="mt-2 text-[15px] text-muted">시행일 · {updated}</p>
      <article className="shadow-card mt-7 rounded-[22px] bg-card p-6 text-[15px] leading-[1.8] text-ink2 [&_h2]:mb-2 [&_h2]:mt-8 [&_h2]:text-[18px] [&_h2]:font-bold [&_h2]:text-ink first:[&_h2]:mt-0 [&_li]:ml-4 [&_li]:list-disc [&_p]:mb-2 [&_ul]:mb-2">
        {children}
      </article>
    </Screen>
  );
}
