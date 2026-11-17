// Public sources only. No payment credentials or customer details leave EDU.
const notice = 'https://consumer.tosspayments.com/notice/free-installment';
const feed = 'https://faq-editor-api.toss.im/api/v1/workspaces/40/faq/?with_deleted=false&category_id=355&page_size=5&order_by=-is_pinned,-created_time';
const issuer = /^(삼성|롯데|신한|KB국민|현대|하나|NH농협|농협|비씨|우리|광주|전북)$/;
export const asksInstallments = (q: string) => /할부|무[이의]자/.test(q);
type Cell = { x: number; y: number; s: string };
type Terms = { from: string; to: string; full: {card:string; lo:number; hi:number}[]; partial: {card:string; lo:number; hi:number; pays:string}[] };

export function parseTerms(cells: Cell[], today: string): Terms {
  const unique = (items: Cell[]) => { if (items.length !== 1) throw Error('unexpected layout'); return items[0]; };
  const compact = (s: string) => s.replace(/\s/g,'');
  const period = unique(cells.filter(c => /^\d{4}\.\s*\d{1,2}\.\s*\d{1,2}\s*~/.test(c.s)));
  const dates = period.s.match(/\d+/g);
  if (dates?.length !== 6) throw Error('unverified dates');
  const day = (i: number) => [dates[i],dates[i+1].padStart(2,'0'),dates[i+2].padStart(2,'0')].join('-');
  const from = day(0), to = day(3);
  if (from > today || to < today || !cells.some(c=>compact(c.s).includes('온라인PG/결제금액5만원이상적용'))) throw Error('unverified offer');
  const middle = unique(cells.filter(c=>compact(c.s)==='카드사부분무이자할부')).y;
  const bottom = unique(cells.filter(c=>compact(c.s)==='유의사항')).y;
  const tenor = /^(\d+)(?:~(\d+))?개월$/;
  const fullCells = cells.filter(c=>c.y > middle && c.y < period.y && tenor.test(c.s));
  const full: Terms['full'] = [];
  for (const term of fullCells) {
    const card = unique(cells.filter(c=>issuer.test(c.s) && c.x<term.x && Math.abs(c.y-term.y)<1.5));
    const [,a,b] = term.s.match(tenor)!;
    full.push({card:card.s,lo:+a,hi:+(b??a)});
  }
  const section = cells.filter(c=>c.y < middle && c.y > bottom);
  const rows = section.filter(c=>tenor.test(c.s)).sort((a,b)=>b.y-a.y);
  const groups: Cell[][] = [];
  for (const row of rows) {
    const ends = (c: Cell) => Number(c.s.match(tenor)![2] ?? c.s.match(tenor)![1]);
    const prev = groups.at(-1)?.at(-1);
    if (!prev || ends(prev)>=ends(row)) groups.push([]);
    groups.at(-1)!.push(row);
  }
  const labels = section.filter(c=>issuer.test(c.s));
  if (!fullCells.length || !labels.length || groups.length !== labels.length) throw Error('incomplete payment table');
  const partial: Terms['partial'] = [];
  for (const group of groups) {
    const card = unique(labels.filter(c=>c.x<group[0].x && c.y<=group[0].y+2 && c.y>=group.at(-1)!.y-2));
    for (const row of group) {
      const [,a,b] = row.s.match(tenor)!;
      const cols = section.filter(c=>c.x>row.x && Math.abs(c.y-row.y)<1.5 && /^\d+(?:~\d+)?회차$/.test(c.s)).sort((l,r)=>l.x-r.x);
      if (cols.length!==2 || !/^1(?:~\d+)?회차$/.test(cols[0].s)) throw Error('unknown installment split');
      partial.push({card:card.s,lo:+a,hi:+(b??a),pays:cols[0].s});
    }
  }
  return {from,to,full,partial};
}

async function bytes(url:string,max:number) {
  const r=await fetch(url,{cache:'no-store',redirect:'error',credentials:'omit',signal:AbortSignal.timeout(6000)});
  if (!r.ok || !r.body || Number(r.headers.get('content-length'))>max) throw Error('notice unavailable');
  const reader=r.body.getReader(); const chunks:Uint8Array[]=[]; let n=0;
  try { for (;;) {const {done,value}=await reader.read(); if(done)break; n+=value.byteLength; if(n>max){await reader.cancel();throw Error('notice too large')} chunks.push(value)} }
  finally {reader.releaseLock()}
  return new Uint8Array(Buffer.concat(chunks));
}
let memo: {day:string; until:number; terms: Promise<Terms>}|undefined;
async function retrieve(today:string) {
  const list = JSON.parse(new TextDecoder().decode(await bytes(feed,160_000)));
  const key = today.slice(0,4)+'년 '+Number(today.slice(5,7))+'월';
  const article = list.success?.results?.find((o:{title:string})=>o.title.includes(key) && /무이자/.test(o.title));
  const href = article?.description?.match(/href="(https:\/\/static\.toss\.im\/faq\/live\/[^"?#]+\.pdf)"/i)?.[1];
  if(!href) throw Error('current PDF missing');
  const data=await bytes(href,3_000_000);
  const {getDocumentProxy}=await import('unpdf');
  const doc=await getDocumentProxy(data);
  try {
    if(doc.numPages!==1) throw Error('unknown table format');
    const items=(await (await doc.getPage(1)).getTextContent()).items;
    return parseTerms(items.flatMap(i=>'str' in i && i.str.trim()?[{x:i.transform[4],y:i.transform[5],s:i.str.trim()}]:[]),today);
  } finally { await doc.cleanup(); }
}

export async function installmentFact(question:string,now=new Date()) {
  const today=new Date(now.getTime()+9*3600_000).toISOString().slice(0,10);
  const fact={topic:'카드 결제 12개월 할부 무이자 부분 무이자 이번 달 카드사', title:'토스페이먼츠 이번 달 무이자 할부 안내',url:notice};
  try {
    if (!memo || memo.day!==today || memo.until<=Date.now()) memo={day:today,until:Date.now()+300_000,terms:retrieve(today)};
    const t=await memo.terms;
    const months=Number(question.match(/(\d{1,2})\s*개월/)?.[1] ?? 12);
    const card=t.full.find(r=>question.includes(r.card)|| (r.card==='KB국민' && question.includes('국민')) || (r.card==='NH농협' && question.includes('농협')) || (r.card==='비씨' && /BC|비시/i.test(question)))?.card.replace(/^NH/,'');
    const eligible=(r:{card:string;lo:number;hi:number})=>(!card||r.card.replace(/^NH/,'')===card)&&r.lo<=months&&months<=r.hi;
    const cards=t.full.filter(eligible).map(r=>r.card);
    const costs=t.partial.filter(eligible).map(r=>r.card+' '+r.pays);
    const full=cards.length ? months+'개월 카드사 부담 무이자: '+cards.join('·')+'.' : months+'개월 전액 무이자는 이 공지에서 확인되지 않아요.';
    const partial=costs.length ? months+'개월 부분 무이자에서 고객이 이자를 내는 회차: '+costs.join(', ')+'. 나머지 회차 이자는 면제됩니다.' : months+'개월 부분 무이자도 이 공지에서 확인되지 않아요.';
    return {...fact,topic:'이번 달 카드사 '+months+'개월 무이자 할부',text:'카드사 일반 행사('+t.from+' ~ '+t.to+') 기준입니다. '+full+' '+partial+' 온라인 PG 결제 5만 원 이상이 기본 대상이며, 카드 종류·교육 등 제외 업종·상점 계약에 따라 달라요. 내 카드의 최종 조건은 결제창과 카드사에서 확인해 주세요.'};
  } catch {
    return {...fact,text:'현재 토스 공지에서 이번 달 카드별 조건을 확인하지 못했어요. 특약 제외 카드의 행사 조건은 토스 공지와 결제창에서 전액·부분 무이자 및 고객 부담 회차를 확인해 주세요.'};
  }
}
