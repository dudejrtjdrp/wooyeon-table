import { AdminSkeleton } from "@/components/skeletons";

/** 회차 관리 불러오는 동안 */
export default function Loading() {
  return <AdminSkeleton cols={6} />;
}
