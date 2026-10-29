import { useEffect, useState } from 'react';
import { ProductDetailHtml } from '../../../app/ui/final/product-detail-html';
import ErrorPage from '../../../app/error';

export function StabilizationCopyFixture() {
  const [source, setSource] = useState('');
  const kind = new URLSearchParams(location.search).get('kind') === 'moonshot' ? 'moonshot' : 'free-live';
  useEffect(() => { let active = true; void fetch('/copy-candidate/' + kind).then(r => r.text()).then(value => { if (active) setSource(value); }); return () => { active = false; }; }, [kind]);
  return <main><p style={{padding:16,margin:0,background:'#fff2d5'}}>검수용 교체 문안 · 운영 미반영 · 신청 버튼은 합성 화면으로 이동합니다.</p>{source ? <ProductDetailHtml html="" documentSource={source} ctaUrl="/safe-custom"/> : <p role="status">문안을 불러오고 있습니다.</p>}</main>;
}

export function RecoveryFixture() {
  const [recovered, setRecovered] = useState(false);
  return recovered ? <h1>화면을 다시 불러왔습니다.</h1> : <ErrorPage error={new Error('synthetic failure')} retry={() => setRecovered(true)}/>;
}
