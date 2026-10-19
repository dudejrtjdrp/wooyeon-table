import { AppSkeleton } from "@/components/skeletons";

/** 테이블 불러오는 동안 */
export default function Loading() {
  return <AppSkeleton kind="detail" />;
}
