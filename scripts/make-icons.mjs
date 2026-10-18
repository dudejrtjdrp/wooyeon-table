// 앱 아이콘 만들기: 리본으로 이어진 ㅇㅇ 마크(src/components/logo.tsx의 RIBBON)를 주홍 바탕에 놓는다.
// 실행: node scripts/make-icons.mjs  → public/ 아래 아이콘과 src/app/favicon.ico 를 다시 만든다.
import { readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const RIBBON = readFileSync("src/components/logo.tsx", "utf8").match(/RIBBON =\s*"([^"]+)"/)[1];
const ACCENT = "#b23d17", PAPER = "#fffdf9";
// 마크가 차지하는 영역(선 굵기 포함): x 20~217, y -26~78 → 가운데 (118.5, 26)
const MARK = { cx: 118.5, cy: 26, w: 197 };

function svg({ size, markW, stroke = 13, bg = ACCENT, fg = PAPER, radius = 0 }) {
  const k = markW / MARK.w;
  const tx = size / 2 - MARK.cx * k, ty = size / 2 - MARK.cy * k;
  const back = bg ? `<rect width="${size}" height="${size}" rx="${radius}" fill="${bg}"/>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${back}
<g transform="translate(${tx} ${ty}) scale(${k})" fill="none" stroke="${fg}" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round"><path d="${RIBBON}"/></g></svg>`;
}
const out = (file, s) => sharp(Buffer.from(s)).png().toFile(file);

await out("public/icon-512.png", svg({ size: 512, markW: 330, radius: 112 }));
await out("public/icon-192.png", svg({ size: 192, markW: 124, radius: 42, stroke: 14 }));
await out("public/icon-maskable-512.png", svg({ size: 512, markW: 270 })); // 안전 영역(가운데 80%) 안
await out("public/apple-touch-icon.png", svg({ size: 180, markW: 120, stroke: 14 })); // iOS가 모서리를 깎는다
await out("public/favicon-32.png", svg({ size: 32, markW: 28, stroke: 20, radius: 7 }));
await out("public/badge-96.png", svg({ size: 96, markW: 84, stroke: 16, bg: "", fg: "#ffffff" })); // 알림 배지는 흰 단색

// favicon.ico (32px PNG를 그대로 담은 ICO)
const png = readFileSync("public/favicon-32.png");
const head = Buffer.alloc(22);
head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(1, 4);
head.writeUInt8(32, 6); head.writeUInt8(32, 7); head.writeUInt16LE(1, 10); head.writeUInt16LE(32, 12);
head.writeUInt32LE(png.length, 14); head.writeUInt32LE(22, 18);
writeFileSync("src/app/favicon.ico", Buffer.concat([head, png]));
console.log("아이콘을 다시 만들었어요");
