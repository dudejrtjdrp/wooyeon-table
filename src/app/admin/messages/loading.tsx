import { AdminSkeleton } from "@/components/skeletons";

/** 자동 메시지 불러오는 동안 */
export default function Loading() {
  return <AdminSkeleton stats cols={6} />;
}
