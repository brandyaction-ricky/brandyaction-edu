// Standalone visual rehearsal. This route neither reads nor reserves a student's seat.
export const dynamic = 'force-static';

const html = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex,nofollow"><meta name="theme-color" content="#17252e">
<link rel="icon" href="data:,"><title>공부방으로 가는 길 · 문샷 캠퍼스</title>
<link rel="stylesheet" href="/campus/world/tour/study-walk.css">
<link rel="modulepreload" href="/campus/world/office/vendor/office.js">
<link rel="modulepreload" href="/campus/world/office/vendor/office3d.js">
</head><body>
<main aria-label="문샷 캠퍼스 공부방 산책">
<canvas id="walk-scene" tabindex="0" aria-label="달 풍경 입구에서 공부방으로 가는 길. 방향키 위아래로 이동하고 자리 앞에서 Enter를 눌러 앉으세요."></canvas>
<header><span class="wordmark">MOONSHOT</span><span class="divider"></span><span>캠퍼스</span>
<button id="restart" type="button" title="입구에서 다시 시작" aria-label="입구에서 다시 시작" hidden>↺</button></header>
<section class="card" aria-label="이동 안내">
<div class="position"><i></i><span id="place">달 풍경 입구</span><span class="track" aria-hidden="true"><span></span></span></div>
<h1 id="title">공부방으로 가는 길</h1>
<div class="actions"><p id="hint" role="status">달 풍경과 캐릭터를 준비하고 있어요.</p><button id="next" type="button" disabled>준비 중</button></div>
</section></main><script type="module" src="/campus/world/tour/study-walk.mjs"></script></body></html>`;

export function GET() {
  if (process.env.VERCEL_ENV === 'production' || (!process.env.VERCEL_ENV && process.env.NODE_ENV === 'production')) {
    return new Response(null, {status: 404});
  }
  return new Response(html, {headers: {'Content-Type': 'text/html; charset=utf-8', 'X-Robots-Tag': 'noindex, nofollow'}});
}
