import type { ReactNode } from "react";
import { Screen } from "./ui";

export function DocPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <Screen title={title} back="/me">
      <article className="mt-2 rounded-3xl bg-card p-5 text-[14px] leading-[1.75] text-ink [&_h2]:mb-2 [&_h2]:mt-7 [&_h2]:text-[16px] [&_h2]:font-bold first:[&_h2]:mt-0 [&_li]:ml-4 [&_li]:list-disc [&_p]:mb-2 [&_ul]:mb-2">
        {children}
        <p className="mt-8 text-[12px] text-muted">시행일 {updated}</p>
      </article>
    </Screen>
  );
}
