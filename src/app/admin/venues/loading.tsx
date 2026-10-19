import { AdminSkeleton } from "@/components/skeletons";

/** 식당 재고 불러오는 동안 */
export default function Loading() {
  return <AdminSkeleton cols={6} />;
}
