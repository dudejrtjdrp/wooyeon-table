import { AppSkeleton } from "@/components/skeletons";

/** 신청 상세 불러오는 동안 */
export default function Loading() {
  return <AppSkeleton kind="detail" />;
}
