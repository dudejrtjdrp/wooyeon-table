import Link from "next/link";

export type SubTab = { href: string; label: string; count?: number; tone?: "danger"; hint?: string; key?: string };

/**
 * 한 메뉴 안의 화면을 나누는 위쪽 탭. 스크롤하지 않아도 무엇이 더 있는지 보이게 한다.
 * current: 지금 탭의 key, key가 없으면 href의 경로(쿼리 없이)
 */
export function SubTabs({ tabs, current, label }: { tabs: SubTab[]; current: string; label: string }) {
  return (
    <nav aria-label={label} className="mt-6 flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map((t) => {
        const on = (t.key ?? t.href.split("?")[0]) === current;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={on ? "page" : undefined}
            title={t.hint}
            className={`-mb-px inline-flex shrink-0 items-center gap-1.5 border-b-2 px-4 py-3 text-[15px] ${on ? "border-accent font-bold text-accent" : "border-transparent font-semibold text-muted hover:text-ink"}`}
          >
            {t.label}
            {t.count !== undefined && (
              <span aria-label={t.hint} className={`min-w-[22px] rounded-full px-1.5 text-center text-[12px] font-bold leading-[20px] tabular-nums ${t.tone === "danger" && t.count > 0 ? "bg-danger text-white" : on ? "bg-accent-soft text-accent" : "bg-field text-muted"}`}>
                {t.count}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
