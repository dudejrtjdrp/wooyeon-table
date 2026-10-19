import { AdminSkeleton } from "@/components/skeletons";

/** 운영 지표 불러오는 동안 */
export default function Loading() {
  return <AdminSkeleton kind="cards" stats />;
}
