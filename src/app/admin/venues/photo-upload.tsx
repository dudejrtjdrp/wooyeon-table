"use client";

import { startTransition, useActionState, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
// admin-ui.tsx는 서버 전용 모듈을 함께 불러와서, 클라이언트에서는 같은 클래스만 따로 둔다
const btn = "inline-flex h-11 items-center justify-center gap-1.5 rounded-xl px-4 text-[14px] font-semibold transition active:scale-[.98]";
const btnPrimary = `${btn} bg-accent text-white shadow-cta`;
const btnLight = `${btn} border border-accent/40 bg-card text-accent hover:bg-accent-soft/50`;
import type { ImportResult } from "./actions";

/** 사진을 긴 변 1280px JPEG로 줄인다 (서버 요청 크기 제한과 화면 속도 때문에) */
async function shrink(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1280 / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const blob: Blob = await new Promise((ok) => canvas.toBlob((b) => ok(b!), "image/jpeg", 0.82));
  return new File([blob], file.name.replace(/\.[a-z0-9]+$/i, "") + ".jpg", { type: "image/jpeg" });
}

/** 식당 한 곳 사진 바꾸기: 파일을 고르면 바로 올라간다 */
export function VenuePhotoButton({ venueId, has, action }: { venueId: string; has: boolean; action: (f: FormData) => Promise<{ ok: boolean; message: string }> }) {
  const input = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        aria-label="식당 사진 고르기"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          start(async () => {
            const fd = new FormData();
            fd.set("venue_id", venueId);
            fd.set("photo", await shrink(f));
            const r = await action(fd);
            setMsg(r.message);
            if (r.ok) router.refresh();
            e.target.value = "";
          });
        }}
      />
      <button type="button" disabled={pending} onClick={() => input.current?.click()} className={`${btnLight} h-9 px-3 text-[13px]`}>
        {pending ? "올리는 중" : has ? "사진 바꾸기" : "사진 올리기"}
      </button>
      {msg && <span className="text-[12px] text-muted" role="status">{msg}</span>}
    </span>
  );
}

/** 사진 여러 장 한 번에: 파일 이름 = 식당 이름. 요청 크기 제한 때문에 한 장씩 차례로 보낸다 */
export function BulkPhotos({ action }: { action: (f: FormData) => Promise<{ ok: boolean; message: string }> }) {
  const [log, setLog] = useState<{ ok: boolean; message: string }[]>([]);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div>
      <label className={`${btnLight} cursor-pointer`}>
        {pending ? `올리는 중 (${log.length})` : "사진 여러 장 올리기"}
        <input
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          disabled={pending}
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            if (!files.length) return;
            setLog([]);
            start(async () => {
              for (const f of files) {
                const fd = new FormData();
                fd.set("name", f.name);
                fd.set("photo", await shrink(f));
                const r = await action(fd);
                setLog((cur) => [...cur, r]);
              }
              router.refresh();
              e.target.value = "";
            });
          }}
        />
      </label>
      {log.length > 0 && (
        <p className="mt-2 text-[13px] text-muted" role="status">
          {log.filter((x) => x.ok).length}장 올림
          {log.some((x) => !x.ok) && <> · 못 올린 사진: {log.filter((x) => !x.ok).map((x) => x.message).join(" / ")}</>}
        </p>
      )}
    </div>
  );
}

/** 엑셀 올리기: 먼저 무엇이 바뀌는지 미리 보여 주고, '이대로 넣기'를 눌러야 반영한다 */
export function ExcelImport({ action }: { action: (prev: ImportResult | null, f: FormData) => Promise<ImportResult> }) {
  const [res, run, pending] = useActionState(action, null);
  const [fileName, setFileName] = useState<string | null>(null);
  // 확인한 파일과 지금 고른 파일이 다르면 이전 확인 결과와 '이대로 넣기'를 숨긴다
  const [fileKey, setFileKey] = useState("");
  const [sentKey, setSentKey] = useState("");
  return (
    // 미리보기 뒤에도 고른 파일이 남아 있어야 '이대로 넣기'가 같은 파일을 보낸다: 폼 액션의 자동 초기화를 쓰지 않고 직접 보낸다
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
        setSentKey(fileKey);
        startTransition(() => run(fd));
      }}
      className="flex flex-col gap-2"
    >
      <div className="flex flex-wrap items-center gap-2">
        <label className={`${btnLight} cursor-pointer`}>
          엑셀 파일 고르기
          <input name="file" type="file" accept=".xlsx" required className="sr-only" onChange={(e) => {
            const f = e.target.files?.[0];
            setFileName(f?.name ?? null);
            setFileKey(f ? `${f.name}|${f.size}|${f.lastModified}` : "");
          }} />
        </label>
        <span className="min-w-0 truncate text-[13px] text-muted">{fileName ?? "고른 파일 없음"}</span>
      </div>
      <button name="mode" value="preview" disabled={pending || !fileName} className={`${btnPrimary} self-start disabled:opacity-50`}>{pending ? "확인하는 중" : "바뀔 내용 확인"}</button>
      {res && sentKey === fileKey && (
        <div role="status" className={`rounded-xl px-4 py-3 text-[14px] ${res.ok ? "bg-accent-soft text-accent-text" : "bg-danger/10 text-danger"}`}>
          <p className="font-semibold">{res.message}</p>
          {res.changes.length > 0 && (
            <ul className="mt-1.5 max-h-48 space-y-0.5 overflow-y-auto text-[13px]">
              {res.changes.map((c, i) => <li key={`${i}|${c.name}`}>{c.how} · {c.name}{c.how === "고침" ? ` — ${c.fields.length ? c.fields.join(", ") : "바뀐 칸 없음"}` : ""}</li>)}
            </ul>
          )}
          {res.skipped.length > 0 && (
            <ul className="mt-1.5 space-y-0.5 text-[13px] text-danger">
              {res.skipped.map((x, i) => <li key={i}>{x.line ? `${x.line}번째 줄: ` : ""}{x.why}</li>)}
            </ul>
          )}
          {res.preview && res.ok && (
            <button name="mode" value="apply" disabled={pending} className={`${btnPrimary} mt-3`}>{pending ? "넣는 중" : "이대로 넣기"}</button>
          )}
        </div>
      )}
    </form>
  );
}
