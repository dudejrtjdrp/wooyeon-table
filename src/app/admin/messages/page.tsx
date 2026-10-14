import { Badge, PageHeader, Panel, Stat, btnPrimary, ctl, td, th } from "@/components/admin-ui";
import { requireAdmin } from "@/lib/auth";
import { fmtDateTime } from "@/lib/format";
import { db } from "@/lib/supabase";
import { TEMPLATES, loadTemplates, render } from "@/lib/templates";
import { saveTemplate } from "./actions";

export const dynamic = "force-dynamic";

const SAMPLE = { date: "10월 23일 (금)", time: "오후 7:30", region: "성수", reservation: "우연한식탁 2032", reason: "고른 일정에 4명이 모이지 않았어요.", alternatives: "옮길 수 있는 일정: 10월 다섯째 주 저녁(10월 30일·10월 31일, 성수·강남). " };

export default async function Messages() {
  await requireAdmin();
  const tpl = await loadTemplates();
  const [{ data: log }, { data: counts }] = await Promise.all([
    db().from("notifications").select("id,template,title,status,attempts,last_error,scheduled_at,sent_at,users(name)").order("scheduled_at", { ascending: false }).limit(60),
    db().from("notifications").select("template,status"),
  ]);
  const by = (st: string) => (counts ?? []).filter((c) => c.status === st).length;
  const rows = (log ?? []) as unknown as { id: string; template: string; title: string; status: string; attempts: number; last_error: string | null; scheduled_at: string; sent_at: string | null; users: { name: string } }[];

  return (
    <div>
      <PageHeader title="자동 메시지" desc="자동으로 나가는 안내 문구를 고치고, 언제 누구에게 나갔는지 확인해요. 실패하면 세 번까지 다시 보내고, 그래도 안 되면 예외 처리함에 올라와요." />
      <div className="mt-6 grid grid-cols-3 gap-3">
        <Stat label="보냄" value={by("sent")} tone="leaf" />
        <Stat label="예약됨" value={by("pending")} />
        <Stat label="실패" value={by("failed")} tone={by("failed") ? "danger" : undefined} />
      </div>

      <h2 className="mb-3 mt-8 text-[17px] font-bold">문구 템플릿</h2>
      <div className="grid gap-4 lg:grid-cols-2">
        {Object.entries(TEMPLATES).map(([key, d]) => {
          const o = tpl[key] ?? {};
          const preview = render(key as keyof typeof TEMPLATES, SAMPLE, tpl);
          return (
            <Panel key={key} title={d.label} action={<span className="text-[12px] text-muted">{d.channel}</span>}>
              <p className="text-[13px] text-muted">보내는 때: {d.when}</p>
              <form action={saveTemplate} className="mt-3 space-y-2">
                <input type="hidden" name="key" value={key} />
                {d.title !== "" && <input name="title" defaultValue={o.title ?? ""} placeholder={d.title} className={`${ctl} w-full`} />}
                <textarea name="body" defaultValue={o.body ?? ""} placeholder={d.body} rows={3} className="w-full rounded-xl border border-line bg-card px-3 py-2 text-[14px] outline-none focus:border-accent" />
                {d.vars.length > 0 && <p className="text-[12px] text-muted">넣을 수 있는 값: {d.vars.map((v) => `{${v}}`).join(" ")}</p>}
                <div className="rounded-xl bg-paper px-3 py-2 text-[13px]">
                  <p className="text-[11px] text-muted">미리보기 (비워 두면 기본 문구)</p>
                  {preview.title && <p className="font-semibold">{preview.title}</p>}
                  <p className="whitespace-pre-line">{preview.body}</p>
                </div>
                <button className={btnPrimary}>저장</button>
              </form>
            </Panel>
          );
        })}
      </div>

      <h2 className="mb-3 mt-8 text-[17px] font-bold">발송 이력</h2>
      <div className="overflow-x-auto rounded-2xl bg-card">
        <table className="w-full min-w-[820px] text-[14px]">
          <thead className="border-b border-line"><tr>{["예약·발송 시각", "받는 사람", "종류", "제목", "상태", "재시도"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-line">
            {rows.map((n) => (
              <tr key={n.id}>
                <td className={`${td} text-muted`}>{fmtDateTime(n.sent_at ?? n.scheduled_at)}</td>
                <td className={td}>{n.users?.name}</td>
                <td className={td}>{(TEMPLATES as Record<string, { label: string }>)[n.template]?.label ?? n.template}</td>
                <td className={td}>{n.title}</td>
                <td className={td}><Badge v={n.status === "sent" ? ["보냄", "leaf"] : n.status === "pending" ? ["예약", "muted"] : ["실패", "danger"]} /></td>
                <td className={`${td} text-muted`}>{n.attempts ? `${n.attempts}회${n.last_error ? `, ${n.last_error.slice(0, 30)}` : ""}` : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
