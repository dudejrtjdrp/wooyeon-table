import { AppSkeleton } from "@/components/skeletons";

/** 홈 불러오는 동안 */
export default function Loading() {
  return <AppSkeleton kind="home" />;
}
