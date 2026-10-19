import { AdminSkeleton } from "@/components/skeletons";

/** 예외 처리함 불러오는 동안 */
export default function Loading() {
  return <AdminSkeleton kind="cards" />;
}
