import { useState } from 'react';
import { ProductDetail } from '../../../app/ui/final/public-views';
import { MemberViews } from '../../../app/ui/final/member-views';
import type { Row, User } from '../../../lib/platform';
const courseId='11111111-1111-4111-8111-111111111111';
export function ProductReviewsFixture() {
  const params=new URLSearchParams(location.search);
  const user:User={id:'synthetic-member',role:'member',email:'student@example.test',full_name:'합성 수강생',phone:null};
  const [mine,setMine]=useState<Row[]>([]);
  const course={id:courseId,title:'AI 문샷 챌린지',category:'paid_class',status:'published',list_price:1950000,duration_label:'6주',schedule_label:'온라인 학습',description:'아이디어를 실행으로 옮기고 나만의 사업을 만들어 가는 수업입니다.'};
  const data={courses:[course],cohorts:[{id:'cohort',course_id:courseId,name:'문샷 5기',status:'upcoming',price:1950000,recruitment_end_at:'2099-01-01T00:00:00Z'}],curriculum_weeks:[{id:'week',course_id:courseId,title:'시작하기',is_published:true}],curriculum_lessons:[{id:'lesson',week_id:'week',title:'첫 학습',is_published:true}],enrollments:[{id:'enrollment',course_id:courseId,status:'active'}],my_reviews:mine};
  return <div className="edu-front"><p style={{margin:16,fontSize:13,color:"#687080"}}>화면 미리보기 · 가상 후기입니다. 실제 회원 정보나 서버 저장은 사용하지 않습니다.</p>{params.has('member')?<main className="wrap" style={{padding:24}}><MemberViews section="reviews" data={data} user={user} logout={async()=>{}} pending={false} send={async body=>{
    const response=await fetch('/api/platform',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const result=await response.json();if(!response.ok)throw Error(result.error);
    setMine([{id:'mine',course_id:courseId,rating:body.rating,body:body.content,status:'pending'}]);return result;
  }}/></main>:<ProductDetail course={course} data={data} user={params.has('guest')?null:user}/>}</div>;
}
