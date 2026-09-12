import Link from 'next/link';
export default function NotFound() {
  return <div className="edu-front"><main className="form-page"><section className="completion"><h1>페이지를 찾을 수 없습니다.</h1><p className="lead">주소를 확인하거나 홈에서 다시 시작해 주세요.</p><Link className="btn primary mt24" href="/">홈으로</Link></section></main></div>;
}
