import { AppSkeleton } from "@/components/skeletons";

/** 내 정보 불러오는 동안 */
export default function Loading() {
  return <AppSkeleton kind="list" />;
}
