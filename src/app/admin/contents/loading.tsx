import { AdminSkeleton } from "@/components/skeletons";

/** 대화 콘텐츠 불러오는 동안 */
export default function Loading() {
  return <AdminSkeleton kind="cards" />;
}
