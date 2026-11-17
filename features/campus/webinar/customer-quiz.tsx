'use client';
import {campusActivity} from '../analytics/client';
import {useState} from 'react';
import styles from './visitor.module.css';
const questions=[
 {text:'좋은 광고를 만들려면, 먼저 “누가 어떤 불편을 겪는지” 알아보는 게 좋다.',answer:true,why:'맞아요. 상품 자랑보다 고객의 불편에서 시작하면 전달할 말이 선명해져요.'},
 {text:'모든 사람을 고객으로 정하면 광고가 더 쉬워진다.',answer:false,why:'아니에요. 가장 도움이 필요한 고객 한 명을 떠올리면 메시지를 구체적으로 만들 수 있어요.'},
 {text:'AI가 정리한 고객의 고민은 실제 고객에게도 확인해 보는 게 좋다.',answer:true,why:'맞아요. AI는 생각을 넓히는 도구예요. 고객의 말과 행동으로 가설을 확인해요.'},
];
export function CustomerQuiz(){const [step,setStep]=useState(0),[answer,setAnswer]=useState<boolean|null>(null),[finished,setFinished]=useState(false);const q=questions[step];
 return <section className={`${styles.invitation} ${styles.quiz}`}><small>고객 발견 체험 · 1분 OX 퀴즈</small><h2>{finished?'첫 고객 발견 미션 완료!':'고객의 마음, 어디서 시작할까요?'}</h2>{finished?<><p>고객의 불편 찾기 → AI와 아이디어 정리 → 실제 반응 확인. 문샷에서는 이 과정을 내 사업에 적용해요.</p><button onClick={()=>{setStep(0);setAnswer(null);setFinished(false);}}>다시 해보기</button></>:<><p className={styles.quizProgress}>질문 {step+1} / {questions.length}</p><h3>{q.text}</h3><div className={styles.oxChoices}>{[true,false].map(v=><button key={String(v)} aria-label={v?'O 맞아요':'X 아니에요'} aria-pressed={answer===v} onClick={()=>{setAnswer(v);campusActivity('quiz_answer','customer-'+step);}}><strong aria-hidden="true">{v?'O':'X'}</strong><span>{v?'맞아요':'아니에요'}</span></button>)}</div>{answer!==null&&<div className={styles.quizFeedback} role="status"><strong>{answer===q.answer?'정답이에요!':'함께 생각해 볼까요?'}</strong><p>{q.why}</p><button onClick={()=>{if(step===questions.length-1)setFinished(true);else{setStep(step+1);setAnswer(null);}}}>{step===questions.length-1?'체험 마치기':'다음 질문'}</button></div>}</>}<small>연습용 퀴즈이며 실제 과제 점수에 반영되지 않아요.</small></section>;
}
