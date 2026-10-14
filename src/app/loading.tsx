import { Skeleton } from "@/components/ui";

export default function Loading() {
  return (
    <div className="mx-auto min-h-dvh max-w-md bg-paper px-5 pt-16" aria-busy="true" aria-label="불러오는 중">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="mt-6 h-44 w-full rounded-3xl" />
      <Skeleton className="mt-4 h-24 w-full rounded-3xl" />
      <Skeleton className="mt-4 h-24 w-full rounded-3xl" />
    </div>
  );
}
