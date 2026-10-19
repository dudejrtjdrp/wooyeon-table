import { AdminSkeleton } from "@/components/skeletons";

/** 신청자 목록 불러오는 동안 */
export default function Loading() {
  return <AdminSkeleton filters cols={8} />;
}
