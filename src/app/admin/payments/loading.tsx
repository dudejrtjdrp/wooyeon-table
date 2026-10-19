import { AdminSkeleton } from "@/components/skeletons";

/** 결제·환불 불러오는 동안 */
export default function Loading() {
  return <AdminSkeleton stats filters cols={8} />;
}
