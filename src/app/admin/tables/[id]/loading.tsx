import { AdminSkeleton } from "@/components/skeletons";

/** 테이블 상세 불러오는 동안 */
export default function Loading() {
  return <AdminSkeleton kind="detail" />;
}
