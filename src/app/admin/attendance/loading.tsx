import { AdminSkeleton } from "@/components/skeletons";

/** 참석 관리 불러오는 동안 */
export default function Loading() {
  return <AdminSkeleton kind="cards" stats />;
}
