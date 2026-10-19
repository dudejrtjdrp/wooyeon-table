import { AdminSkeleton } from "@/components/skeletons";

/** 회원 불러오는 동안 */
export default function Loading() {
  return <AdminSkeleton filters cols={6} />;
}
