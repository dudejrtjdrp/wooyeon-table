import ExcelJS from "exceljs";
import { COLUMNS } from "./venue-sheet";

const MAX_ROWS = 500;

/** 식당 엑셀 양식(빈 양식 또는 지금 식당이 채워진 것). 목록 칸은 드롭다운으로 고르게 한다 */
export async function buildVenueWorkbook(rows: Record<string, string | number>[], sample = false) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "우연한 식탁";
  const ws = wb.addWorksheet("식당", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = COLUMNS.map((c) => ({ header: c.required ? `${c.label}` : c.label, key: c.label, width: c.width }));
  const head = ws.getRow(1);
  head.height = 24;
  head.eachCell((cell, i) => {
    const col = COLUMNS[i - 1];
    cell.font = { bold: true, color: { argb: col.required ? "FFFFFFFF" : "FF221C17" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: col.required ? "FFB23D17" : "FFEDE6DC" } };
    cell.alignment = { vertical: "middle" };
    cell.note = `${col.required ? "[필수] " : ""}${col.help}`;
  });

  const data = rows.length ? rows : sample ? [Object.fromEntries(COLUMNS.map((c) => [c.label, SAMPLE[c.label] ?? ""]))] : [];
  for (const r of data) ws.addRow(r);

  // 드롭다운: 목록이 긴 동네 묶음은 숨긴 시트를 참조한다
  const lists = wb.addWorksheet("목록", { state: "veryHidden" });
  COLUMNS.forEach((c, i) => {
    if (!c.list) return;
    const letter = ws.getColumn(i + 1).letter;
    c.list.forEach((v, j) => { lists.getCell(j + 1, i + 1).value = v; });
    const ref = `목록!$${letter}$1:$${letter}$${c.list.length}`;
    for (let r = 2; r <= MAX_ROWS; r++) {
      ws.getCell(`${letter}${r}`).dataValidation = { type: "list", allowBlank: true, formulae: [ref], showErrorMessage: true, errorTitle: c.label, error: `${c.label}은 목록에서 골라 주세요` };
    }
  });

  const guide = wb.addWorksheet("작성 방법");
  guide.columns = [{ header: "칸", key: "a", width: 18 }, { header: "필수", key: "b", width: 8 }, { header: "설명", key: "c", width: 90 }];
  guide.getRow(1).font = { bold: true };
  for (const c of COLUMNS) guide.addRow({ a: c.label, b: c.required ? "필수" : "", c: c.help });
  guide.addRow({});
  guide.addRow({ a: "올리는 방법", c: "어드민 > 식당 관리 > 엑셀로 올리기. 같은 동네에 같은 이름이 있으면 그 식당을 고치고, 없으면 새로 만들어요. 문제 있는 줄은 건너뛰고 몇 번째 줄이 왜 안 됐는지 알려 드려요." });
  guide.addRow({ a: "사진", c: "사진 파일은 식당 관리 화면에서 식당마다 올리거나, 여러 장을 한 번에 올릴 수 있어요. 한 번에 올릴 때는 파일 이름을 식당 이름으로(같은 이름이 여러 동네에 있으면 '동네 묶음_식당 이름') 해 주세요." });

  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** 올린 엑셀의 '식당' 시트를 제목 → 값 객체 목록으로. 빈 줄은 건너뛴다. 줄 번호(엑셀 기준)를 같이 준다 */
export async function readVenueWorkbook(buf: ArrayBuffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const ws = wb.getWorksheet("식당") ?? wb.worksheets[0];
  if (!ws) return { rows: [] as { line: number; raw: Record<string, unknown> }[], missing: COLUMNS.filter((c) => c.required).map((c) => c.label) };
  const header: string[] = [];
  ws.getRow(1).eachCell({ includeEmpty: true }, (cell, i) => { header[i] = String(cell.value ?? "").trim(); });
  const missing = COLUMNS.filter((c) => c.required && !header.includes(c.label)).map((c) => c.label);
  const rows: { line: number; raw: Record<string, unknown> }[] = [];
  ws.eachRow({ includeEmpty: false }, (row, n) => {
    if (n === 1) return;
    const raw: Record<string, unknown> = {};
    row.eachCell({ includeEmpty: false }, (cell, i) => { if (header[i]) raw[header[i]] = cell.value; });
    if (Object.values(raw).some((v) => String(v ?? "").trim())) rows.push({ line: n, raw });
  });
  return { rows, missing };
}

const SAMPLE: Record<string, string | number> = {
  "식당 이름": "예시) 잠실 호숫가 식탁",
  "동네 묶음": "잠실·송파",
  "업종": "한식 주점",
  "주소": "서울 송파구 백제고분로 000",
  "1인 가격대": "2만 원대",
  "리뷰 평점": 4.5,
  "리뷰 수": 256,
  "예약 채널": "네이버 예약",
  "예약 페이지 주소": "",
  "전화번호": "",
  "지도 링크": "",
  "테이블당 좌석": 6,
  "사용": "예",
};
