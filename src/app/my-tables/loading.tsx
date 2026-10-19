import { AppSkeleton } from "@/components/skeletons";

/** 단체방 목록 불러오는 동안 */
export default function Loading() {
  return <AppSkeleton kind="list" />;
}
