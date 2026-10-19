import { AppSkeleton } from "@/components/skeletons";

/** 모집 중인 일정 불러오는 동안 */
export default function Loading() {
  return <AppSkeleton kind="list" />;
}
