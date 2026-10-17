// 식당 위치를 지도 앱으로 바로 연다 (성효님 지시 2026-10-17: 장소를 누르면 카카오맵·네이버 지도가 바로 열리게).
// - 안드로이드: intent 주소. 앱이 있으면 앱이 열리고, 없으면 브라우저가 알아서 웹 지도로 간다(오류 창·타이머 없음).
// - 아이폰·컴퓨터: 웹 지도를 새 탭으로. 앱이 있으면 지도 서비스가 앱으로 넘겨 주고, 식탁 화면은 그대로 남는다.
// 검색어는 '식당 이름 + 주소'(괄호 안 설명은 뺀다). 운영자가 식당에 지도 주소를 넣어 뒀으면 그 서비스는 그 주소를 쓴다.

export type MapLink = { web: string; android: string };
export type MapLinks = { naver: MapLink; kakao: MapLink };

export function mapQuery(name: string, address: string): string {
  return `${name} ${address.replace(/\(.*?\)/g, "").trim()}`.replace(/\s+/g, " ").trim();
}

const intent = (path: string, scheme: string, pkg: string, fallback: string) =>
  `intent://${path}#Intent;scheme=${scheme};package=${pkg};S.browser_fallback_url=${encodeURIComponent(fallback)};end`;

export function mapLinks(name: string, address: string, mapUrl?: string | null): MapLinks {
  const q = encodeURIComponent(mapQuery(name, address));
  const custom = mapUrl && /^https:\/\//.test(mapUrl) ? mapUrl : null;
  const naverWeb = custom && /naver/.test(custom) ? custom : `https://map.naver.com/p/search/${q}`;
  const kakaoWeb = custom && /kakao/.test(custom) ? custom : `https://map.kakao.com/link/search/${q}`;
  return {
    naver: { web: naverWeb, android: intent(`search?query=${q}&appname=wooyeon-table`, "nmap", "com.nhn.android.nmap", naverWeb) },
    kakao: { web: kakaoWeb, android: intent(`search?q=${q}`, "kakaomap", "net.daum.android.map", kakaoWeb) },
  };
}
