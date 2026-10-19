import { AdminSkeleton } from "@/components/skeletons";

/** 수요 불러오는 동안 */
export default function Loading() {
  return <AdminSkeleton cols={5} />;
}
