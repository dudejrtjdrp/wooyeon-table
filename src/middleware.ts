import { NextResponse, type NextRequest } from "next/server";

/**
 * 서버 컴포넌트는 지금 주소를 알 수 없어서, 요청 헤더에 경로를 실어 보낸다.
 * requireMe/requireProfile이 로그인·프로필 화면으로 보낼 때 이 값을 next로 붙여
 * 가입·로그인을 마친 뒤 처음 열려던 화면(예: 공유받은 /apply/…)으로 돌아오게 한다.
 * 바깥에서 같은 이름의 헤더를 보내도 여기서 덮어쓴다.
 */
export function middleware(req: NextRequest) {
  const headers = new Headers(req.headers);
  headers.set("x-pathname", req.nextUrl.pathname + req.nextUrl.search);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/((?!_next/|api/|admin|sw\\.js|manifest\\.webmanifest|favicon\\.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico|js|css|txt|xml)$).*)"],
};
