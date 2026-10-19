import { AdminSkeleton } from "@/components/skeletons";

/** 운영 대시보드 불러오는 동안 */
export default function Loading() {
  return <AdminSkeleton kind="cards" stats />;
}
