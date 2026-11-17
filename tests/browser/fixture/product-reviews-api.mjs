// Isolated in-memory demo only. Never calls Supabase or a payment/provider API.
const own = new Map();
export function productReviewsFixture(request,response,url) {
  const ref=request.headers.referer || '';
  if(!ref.includes('/product-reviews-test'))return false;
  const reply=(value,status=200)=>{response.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});response.end(JSON.stringify(value));};
  if(url.pathname==='/api/product-reviews'){
    const course=url.searchParams.get('course');
    if(url.searchParams.get('context'))reply({enrollmentId:'11111111-1111-4111-8111-111111111111',review:own.get(course)||null});
    else {
      const page=Number(url.searchParams.get('page')||1);
      reply({rows:Array.from({length:page===1?10:3},(_,i)=>({id:page+'-'+i,author:['문**','샷**','수**'][i%3],rating:5,body:i===0?'수업을 따라 실행하며 고객의 문제를 구체적으로 정리할 수 있었어요.\n작은 실행을 쌓아 가는 데 도움이 됐습니다.':'직접 실행하며 배울 수 있어서 좋았습니다.',published_at:'2026-11-10T00:00:00Z'})),summary:{count:13,average:4.8},page,hasMore:page===1});
    }
    return true;
  }
  if(url.pathname==='/api/platform'&&request.method==='POST'){
    let body='';request.on('data',chunk=>body+=chunk);request.on('end',()=>{
      try{const value=JSON.parse(body);if(value.action!=='review')return reply({error:'가상 후기만 저장할 수 있습니다.'},400);
        own.set('11111111-1111-4111-8111-111111111111',{id:'example-review',body:value.content,rating:value.rating,status:'pending'});reply({ok:true});
      }catch{reply({error:'요청을 확인해 주세요.'},400);}
    });return true;
  }
  return false;
}
