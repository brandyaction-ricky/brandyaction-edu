"use client";

export default function PageError({ reset }: { reset: () => void }) {
  return <main className="wrap"><div className="empty"><h3>페이지를 불러오지 못했습니다.</h3><p>연결 상태를 확인한 뒤 다시 시도해 주세요.</p><button className="btn primary" onClick={reset}>다시 시도</button></div></main>;
}
