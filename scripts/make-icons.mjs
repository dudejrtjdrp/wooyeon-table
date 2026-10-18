// 앱 아이콘 만들기: 첫 장면 로고(고운바탕)의 리본 ㅇㅇ(src/components/logo-data.ts)을 주홍 바탕에 놓는다.
// 실행: node scripts/make-icons.mjs  → public/ 아래 아이콘과 src/app/favicon.ico 를 다시 만든다.
import { readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const data = readFileSync("src/components/logo-data.ts", "utf8").match(/batang: (\{.*\}),/)[1];
const { ribbon: RIBBON, sw: SW } = JSON.parse(data);
const ACCENT = "#b23d17", PAPER = "#fffdf9";
// 마크가 차지하는 영역(선 굵기 포함)을 실제로 그려서 잰다
async function measure() {
  const big = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000" viewBox="-100 -100 400 400"><path d="${RIBBON}" fill="none" stroke="#000" stroke-width="${SW}" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const { info } = await sharp(Buffer.from(big)).flatten({ background: "#fff" }).trim().toBuffer({ resolveWithObject: true });
  const k = 400 / 1000; // 화면 px → 도안 단위
  const x0 = -100 - info.trimOffsetLeft * k, y0 = -100 - info.trimOffsetTop * k; // trimOffset은 음수
  const w = info.width * k, h = info.height * k;
  return { cx: x0 + w / 2, cy: y0 + h / 2, w, sw: SW };
}
const MARK = await measure();

function svg({ size, markW, stroke = MARK.sw, bg = ACCENT, fg = PAPER, radius = 0 }) {
  const k = markW / MARK.w;
  const tx = size / 2 - MARK.cx * k, ty = size / 2 - MARK.cy * k;
  const back = bg ? `<rect width="${size}" height="${size}" rx="${radius}" fill="${bg}"/>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${back}
<g transform="translate(${tx} ${ty}) scale(${k})" fill="none" stroke="${fg}" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round"><path d="${RIBBON}"/></g></svg>`;
}
const out = (file, s) => sharp(Buffer.from(s)).png().toFile(file);

await out("public/icon-512.png", svg({ size: 512, markW: 330, radius: 112, stroke: MARK.sw * 0.8 }));
await out("public/icon-192.png", svg({ size: 192, markW: 124, radius: 42, stroke: MARK.sw * 1.1 }));
await out("public/icon-maskable-512.png", svg({ size: 512, markW: 270, stroke: MARK.sw * 0.85 })); // 안전 영역(가운데 80%) 안
await out("public/apple-touch-icon.png", svg({ size: 180, markW: 120, stroke: MARK.sw * 1.1 })); // iOS가 모서리를 깎는다
await out("public/favicon-32.png", svg({ size: 32, markW: 28, stroke: MARK.sw * 1.5, radius: 7 }));
await out("public/badge-96.png", svg({ size: 96, markW: 84, stroke: MARK.sw * 1.25, bg: "", fg: "#ffffff" })); // 알림 배지는 흰 단색

// favicon.ico (32px PNG를 그대로 담은 ICO)
const png = readFileSync("public/favicon-32.png");
const head = Buffer.alloc(22);
head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(1, 4);
head.writeUInt8(32, 6); head.writeUInt8(32, 7); head.writeUInt16LE(1, 10); head.writeUInt16LE(32, 12);
head.writeUInt32LE(png.length, 14); head.writeUInt32LE(22, 18);
writeFileSync("src/app/favicon.ico", Buffer.concat([head, png]));
console.log("아이콘을 다시 만들었어요");
