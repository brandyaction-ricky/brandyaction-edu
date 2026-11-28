// The lobby sends destination intents to its same-origin campus host.
export const dynamic = 'force-static';

const html = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex,nofollow"><meta name="theme-color" content="#17252e">
<link rel="icon" href="data:,"><title>문샷 캠퍼스</title>
<link rel="modulepreload" href="/campus/world/tour/study-walk-set.mjs">
<link rel="modulepreload" href="/campus/world/tour/campus-interior-finish.mjs">
<link rel="modulepreload" href="/campus/world/tour/lobby-paths.mjs">
<link rel="preload" as="image" href="/campus/world/assets/lunar-concourse-floor.webp">
<link rel="preload" as="image" href="/campus/world/assets/study-lunar-horizon.webp">
<link rel="stylesheet"  href="/campus/world/tour/study-walk.css">
<link rel="modulepreload" href="/campus/world/office/vendor/office.js">
<link rel="modulepreload" href="/campus/world/office/vendor/office3d.js">
</head><body>
<main aria-label="달 풍경 캠퍼스">
<canvas id="walk-scene" tabindex="0" aria-label="이동할 공간을 고르세요. 걷는 동안 방향키로도 움직일 수 있어요."></canvas>
<header><span class="wordmark">MOONSHOT</span><span class="divider"></span><span>캠퍼스</span></header>
<section class="card" aria-label="캠퍼스 길 안내">
<div class="panel-head"><h1 id="title">문샷 캠퍼스</h1><button id="watch" type="button"><span aria-hidden="true">▶</span> 라이브 보기</button></div>
<fieldset id="destinations"><legend>이동할 공간</legend>
<button type="button" data-room="study"><strong>공부방</strong><small>수업과 복습</small></button>
<button type="button" data-room="office"><strong>내 AI 사무실</strong><small>AI 직원과 업무 관리</small></button></fieldset>
<div class="actions"><p id="hint" role="status">갈 곳을 누르면 파란 길을 따라 걸어요.</p><button id="next" type="button" hidden>따라 걷기</button></div>
<div class="track" hidden aria-hidden="true"><span></span></div>
</section></main><script>
{
  const picks = document.querySelectorAll('[data-room]');
  const hint = document.querySelector('#hint');
  const next = document.querySelector('#next');
  let failed = false;
  function select(button) {
    document.body.dataset.pendingRoom = button.dataset.room;
    for (const pick of picks) pick.setAttribute('aria-pressed', String(pick === button));
    hint.textContent = failed ? '공간으로 바로 들어갈 수 있어요.' : button.querySelector('strong').textContent + ' 입장을 준비하고 있어요.';
    next.hidden = false;
    next.textContent = '바로 입장';
  }
  for (const pick of picks) pick.onclick = () => select(pick);
  next.onclick = () => parent.postMessage({type:'moonshot-lobby-arrived', room:document.body.dataset.pendingRoom}, location.origin);
  document.querySelector('#watch').onclick = () => parent.postMessage({type:'moonshot-watch-stage'}, location.origin);
  import('/campus/world/tour/study-walk.mjs').catch(() => {
    failed = true;
    hint.textContent = '공간을 골라 바로 들어가세요.';
  });
}
</script></body></html>`;

export function GET() {
  if (process.env.VERCEL_ENV === 'production' || (!process.env.VERCEL_ENV && process.env.NODE_ENV === 'production')) {
    return new Response(null, {status: 404});
  }
  return new Response(html, {headers: {'Content-Type': 'text/html; charset=utf-8', 'X-Robots-Tag': 'noindex, nofollow'}});
}
