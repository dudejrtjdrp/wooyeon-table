// 문자 발송. SOLAPI 키가 있으면 실제로 보내고, 없으면 시연 모드로 화면에 번호를 보여준다.
// 솔라피는 개인도 가입할 수 있고, 본인 번호를 발신번호로 등록하면 바로 쓸 수 있다.
import { createHmac, randomBytes } from "crypto";

export const smsEnabled = () => Boolean(process.env.SOLAPI_API_KEY && process.env.SOLAPI_API_SECRET && process.env.SOLAPI_SENDER);

export async function sendSms(to: string, text: string): Promise<void> {
  const key = process.env.SOLAPI_API_KEY!;
  const date = new Date().toISOString();
  const salt = randomBytes(16).toString("hex");
  const signature = createHmac("sha256", process.env.SOLAPI_API_SECRET!).update(date + salt).digest("hex");
  const r = await fetch("https://api.solapi.com/messages/v4/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `HMAC-SHA256 apiKey=${key}, date=${date}, salt=${salt}, signature=${signature}`,
    },
    body: JSON.stringify({ message: { to, from: process.env.SOLAPI_SENDER, text } }),
  });
  if (!r.ok) throw new Error(`SMS ${r.status}: ${(await r.text()).slice(0, 200)}`);
}
