import { Skeleton } from "./ui";

// 화면을 불러오는 동안 보이는 뼈대(loading.tsx에서 쓴다). 실제 화면과 같은 자리에 같은 모양의 회색 블록을 둔다

function Busy({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={className} aria-busy="true" data-skeleton>
      <p role="status" className="sr-only">불러오는 중이에요</p>
      {children}
    </div>
  );
}

/** 어드민 화면 머리: 제목·설명·'여기서 하는 일' 띠 */
function AdminHead() {
  return (
    <>
      <Skeleton className="h-9 w-48 rounded-xl" />
      <Skeleton className="mt-2.5 h-4 w-full max-w-md rounded-lg" />
      <Skeleton className="mt-4 h-10 w-full rounded-2xl" />
    </>
  );
}

function FilterCard() {
  return (
    <div className="shadow-card mt-6 grid gap-3 rounded-[20px] bg-card p-5 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i}>
          <Skeleton className="h-3.5 w-14 rounded-md" />
          <Skeleton className="mt-2 h-11 w-full rounded-xl" />
        </div>
      ))}
    </div>
  );
}

function TableCard({ cols = 6, rows = 8 }: { cols?: number; rows?: number }) {
  return (
    <div className="shadow-card mt-6 overflow-hidden rounded-[20px] bg-card px-2 pb-2">
      <div className="flex gap-4 rounded-xl bg-[#f4f7fc] px-4 py-3.5">
        {Array.from({ length: cols }, (_, i) => <Skeleton key={i} className="h-3.5 flex-1 rounded-md" />)}
      </div>
      <div className="divide-y divide-line">
        {Array.from({ length: rows }, (_, r) => (
          <div key={r} className="flex items-center gap-4 px-4 py-4">
            {Array.from({ length: cols }, (_, i) => <Skeleton key={i} className={`flex-1 rounded-md ${i === 0 ? "h-5" : "h-4"} ${i === cols - 1 ? "max-w-20" : ""}`} />)}
          </div>
        ))}
      </div>
    </div>
  );
}

function StatRow({ n = 4 }: { n?: number }) {
  return (
    <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="shadow-card rounded-[20px] bg-card p-5">
          <Skeleton className="h-3.5 w-16 rounded-md" />
          <Skeleton className="mt-3 h-8 w-20 rounded-lg" />
        </div>
      ))}
    </div>
  );
}

function PanelCard({ lines = 4 }: { lines?: number }) {
  return (
    <div className="shadow-card rounded-[20px] bg-card p-6">
      <Skeleton className="h-5 w-32 rounded-lg" />
      <div className="mt-5 space-y-3">
        {Array.from({ length: lines }, (_, i) => <Skeleton key={i} className={`h-4 rounded-md ${i % 3 === 2 ? "w-2/3" : "w-full"}`} />)}
      </div>
    </div>
  );
}

/**
 * 어드민 화면 뼈대.
 * table: 조건 칸 + 표 / cards: 숫자 줄 + 카드 두 줄 / detail: 왼쪽 넓은 카드 + 오른쪽 좁은 카드
 */
export function AdminSkeleton({ kind = "table", filters = false, cols, stats = false }: { kind?: "table" | "cards" | "detail"; filters?: boolean; cols?: number; stats?: boolean }) {
  return (
    <Busy>
      <AdminHead />
      {stats && <StatRow />}
      {filters && <FilterCard />}
      {kind === "table" && <TableCard cols={cols} />}
      {kind === "cards" && (
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }, (_, i) => <PanelCard key={i} />)}
        </div>
      )}
      {kind === "detail" && (
        <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_360px]">
          <div className="space-y-4"><PanelCard lines={6} /><PanelCard /></div>
          <div className="space-y-4"><PanelCard lines={5} /><PanelCard lines={3} /></div>
        </div>
      )}
    </Busy>
  );
}

/**
 * 참가자 화면 뼈대(미색 바탕, 가운데 좁은 칸).
 * home: 큰 상태 카드 + 목록 / list: 제목 + 줄 목록 / detail: 진한 머리 카드 + 정보 카드
 */
export function AppSkeleton({ kind = "list" }: { kind?: "home" | "list" | "detail" }) {
  return (
    <Busy className="mx-auto min-h-dvh max-w-md bg-paper px-5 pt-14">
      <Skeleton className="h-8 w-40 rounded-xl" />
      <Skeleton className="mt-2.5 h-4 w-56 rounded-lg" />
      {kind === "home" && (
        <>
          <Skeleton className="mt-6 h-48 w-full rounded-[24px]" />
          <Skeleton className="mt-4 h-[64px] w-full rounded-[18px]" />
          <div className="mt-6 flex gap-2.5">
            <Skeleton className="h-36 w-40 shrink-0 rounded-[20px]" />
            <Skeleton className="h-36 w-40 shrink-0 rounded-[20px]" />
          </div>
        </>
      )}
      {kind === "detail" && (
        <>
          <Skeleton className="mt-6 h-44 w-full rounded-[24px]" />
          <div className="mt-4 space-y-3 rounded-[20px] bg-card p-5">
            {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-4 w-full rounded-md" />)}
          </div>
          <Skeleton className="mt-4 h-[52px] w-full rounded-[14px]" />
        </>
      )}
      {kind === "list" && (
        <div className="mt-6 divide-y divide-line2 overflow-hidden rounded-[20px] bg-card">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="flex min-h-[64px] items-center gap-3 px-5 py-3">
              <div className="min-w-0 flex-1">
                <Skeleton className="h-4 w-3/5 rounded-md" />
                <Skeleton className="mt-2 h-3 w-2/5 rounded-md" />
              </div>
              <Skeleton className="h-7 w-14 rounded-[14px]" />
            </div>
          ))}
        </div>
      )}
    </Busy>
  );
}
