import { AdminSkeleton } from "@/components/skeletons";

/** 피드백·안전 불러오는 동안 */
export default function Loading() {
  return <AdminSkeleton kind="cards" stats />;
}
