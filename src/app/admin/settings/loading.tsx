import { AdminSkeleton } from "@/components/skeletons";

/** 설정 불러오는 동안 */
export default function Loading() {
  return <AdminSkeleton kind="cards" />;
}
