import { AdminSkeleton } from "@/components/skeletons";

/** 테이블·단체방 불러오는 동안 */
export default function Loading() {
  return <AdminSkeleton cols={8} />;
}
