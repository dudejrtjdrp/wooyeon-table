import Link from "next/link";
import { PageHeader, Panel } from "@/components/admin-ui";
import { requireAdminWrite } from "@/lib/auth";
import { VenueForm } from "../venue-form";

/** 식당 한 곳 추가 */
export default async function NewVenue() {
  await requireAdminWrite("/admin/venues");
  return (
    <div className="max-w-3xl">
      <PageHeader title="식당 추가" desc="한 곳씩 넣어요. 여러 곳은 식당 관리의 엑셀로 한 번에 넣을 수 있어요." actions={<Link href="/admin/venues" className="text-[14px] font-semibold text-accent underline underline-offset-4">식당 목록으로</Link>} />
      <Panel><VenueForm /></Panel>
    </div>
  );
}
