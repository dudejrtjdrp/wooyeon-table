import { AdminSkeleton } from "@/components/skeletons";

/** 변경 이력 불러오는 동안 */
export default function Loading() {
  return <AdminSkeleton filters cols={5} />;
}
