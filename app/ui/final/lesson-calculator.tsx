"use client";

import { useState } from 'react';
import type { BlockAnswer, PublicLessonBlock } from '@/lib/lesson-blocks';
import { calculateFunnel, calculateMargin, calculateRecipe, CHANNEL_PRESETS, hasCalculatorDefinition, isCalculator, MARGIN_DEFAULTS, MARGIN_INPUTS, MAX_CALCULATOR_VALUE, MAX_FUNNEL_STAGES, parseFunnelStages, RECIPE_INPUTS, validCalculatorNumber, validateCalculatorValues, type FunnelStage } from '@/lib/lesson-calculators';
import { downloadFunnelImage } from '@/lib/lesson-funnel-image';
import './lesson-calculator.css';

type Props={block:PublicLessonBlock;answer?:BlockAnswer;readOnly:boolean;onChange:(answer:BlockAnswer)=>void};
type Inputs={values:Record<string,string>;readOnly:boolean;onChange:(values:Record<string,string>)=>void};
function NumericInput({label,value,unit='',readOnly,onChange,onError}:{label:string;value:string;unit?:string;readOnly:boolean;onChange:(value:string)=>void;onError:(message:string)=>void}){
  return <label className="lbc-input"><span>{label}</span><div><input aria-label={label} type="number" min={0} max={MAX_CALCULATOR_VALUE} step="any" value={value} placeholder="0" readOnly={readOnly} onChange={event=>{if(validCalculatorNumber(event.target.value)){onError('');onChange(event.target.value);}else onError('0 이상 숫자를 입력해 주세요. 너무 큰 값은 입력할 수 없습니다.');}}/>{unit && <span>{unit}</span>}</div></label>;
}
function Recipe({values,readOnly,onChange}:Inputs){
  const [error,setError]=useState('');
  const calculation=calculateRecipe(values);
  return <section className="lb-card lb-calculator" aria-label="레시피 실행 계산기"><h3>레시피 실행 계산기</h3><p>최근 3일 동안의 데이터를 입력하세요.</p>
    {RECIPE_INPUTS.map(input=><NumericInput key={input.key} label={input.label} value={values[input.key]||''} readOnly={readOnly} onChange={value=>onChange({...values,[input.key]:value})} onError={setError}/>)}
    {error && <p role="alert">{error}</p>}<h4>일 평균 결과</h4>
    {calculation.results.map(result=><section className="lbc-result" key={result.label} aria-label={result.label}><strong>{result.label}</strong><output aria-label={`${result.label} 결과`}>{result.value.toLocaleString('ko-KR')} {result.unit}</output><p>{result.subDesc}</p><details><summary>상세정보 펼쳐보기</summary><dl>{result.details.map(detail=><div key={detail.label}><dt>{detail.label}<small>{detail.desc}</small></dt><dd>{detail.value.toLocaleString('ko-KR')}</dd></div>)}</dl></details></section>)}
    <h4>연습용 두쫀쿠레시피 달성율</h4><p className="meta">연습 기준: 하루 유입 50명 · 행동 5건 · 결제 전환 3건 · 리뷰 1건</p>
    {calculation.achievements.map(item=><div className="lbc-achievement" key={item.label}><span>{item.label}</span><strong>{Math.round(item.rate*10)/10}%</strong><progress max={100} value={Math.min(100,Math.max(0,item.rate))} aria-label={`${item.label} 달성율`}/></div>)}
  </section>;
}
function Margin({values:stored,readOnly,onChange}:Inputs){
  const [error,setError]=useState('');const values={...MARGIN_DEFAULTS,...stored},result=calculateMargin(values);
  function change(key:string,value:string){onChange({...values,[key]:value,...(key==='channel'?CHANNEL_PRESETS[value]||{}:{})});}
  return <section className="lb-card lb-calculator" aria-label="마진 계산기"><h3>다른 상품은 얼마나 남을까?</h3><p>입력한 조건으로 예상 금액을 계산합니다. 수수료는 수업 예시값이며 직접 수정할 수 있습니다.</p>
    <dl className="lbc-summary"><div><dt>정산금액</dt><dd><output aria-label="예상 정산금액">{Math.round(result.settlement).toLocaleString('ko-KR')} 원</output></dd></div><div><dt>순이익</dt><dd><output aria-label="예상 순이익">{Math.round(result.netProfit).toLocaleString('ko-KR')} 원</output></dd></div><div><dt>마진율</dt><dd><output aria-label="마진율">{(Math.round(result.marginRate*10)/10).toLocaleString('ko-KR')}%</output></dd></div></dl>
    {['매출','매입','수수료','부가세'].map(group=><fieldset key={group} disabled={readOnly}><legend>{group}</legend>{MARGIN_INPUTS.filter(f=>f.group===group).map(field=>field.options?<label key={field.key} className="lbc-input"><span>{field.label}</span><select value={values[field.key]} onChange={event=>change(field.key,event.target.value)}>{field.options.map(option=><option key={option}>{option}</option>)}</select></label>:<NumericInput key={field.key} label={field.label} unit={field.unit} value={values[field.key]} readOnly={readOnly} onChange={value=>change(field.key,value)} onError={setError}/>)}</fieldset>)}
    {error && <p role="alert">{error}</p>}<details><summary>계산 내역 보기</summary><dl className="lbc-summary"><div><dt>수수료 합계</dt><dd>{Math.round(result.totalFee).toLocaleString('ko-KR')} 원</dd></div><div><dt>매입·비용 합계</dt><dd>{Math.round(result.totalCost).toLocaleString('ko-KR')} 원</dd></div><div><dt>부가세 차액</dt><dd>{Math.round(result.vat).toLocaleString('ko-KR')} 원</dd></div></dl></details>
  </section>;
}
function Funnel({values,readOnly,onChange}:Inputs){
  const [error,setError]=useState(''),[downloading,setDownloading]=useState(false);
  const stages=parseFunnelStages(values.data),rows=calculateFunnel(stages);
  function commit(next:FunnelStage[]){if(!readOnly)onChange({data:JSON.stringify(next)});}
  function update(id:string,patch:Partial<FunnelStage>){commit(stages.map(s=>s.id===id?{...s,...patch}:s));}
  function move(index:number,offset:number){const next=[...stages];[next[index],next[index+offset]]=[next[index+offset],next[index]];commit(next);}
  async function download(){setDownloading(true);setError('');try{await downloadFunnelImage(stages);}catch{setError('이미지 다운로드에 실패했습니다. 다시 시도해 주세요.');}finally{setDownloading(false);}}
  return <section className="lb-card lb-calculator" aria-label="마케팅 퍼널 만들기"><h3>마케팅 퍼널 만들기</h3><h4>나의 마케팅 퍼널</h4>
    <figure className="lbc-funnel" aria-label="단계별 수와 전환율"><figcaption>오른쪽은 첫 단계 대비 비율입니다.</figcaption>{rows.map((row,i)=>{
      const top=200*row.ratio,bottom=200*(rows[i+1]?.ratio??row.ratio);
      return <div className="lbc-funnel-row" key={row.id}><div><strong>{row.name||'단계'}</strong><span>{Math.round(row.number).toLocaleString('ko-KR')}</span>{row.previous!==null && <small>이전 대비 {Math.round(row.previous*10)/10}%</small>}</div><svg aria-hidden="true" viewBox="0 0 200 100" preserveAspectRatio="none"><polygon points={`${100-top/2},0 ${100+top/2},0 ${100+bottom/2},100 ${100-bottom/2},100`} fill={`rgba(26,171,223,${Math.max(.45,.9-i*.13)})`}/></svg><strong>{row.overall===null?'—':`${Math.round(row.overall*10)/10}%`}</strong></div>;
    })}</figure>
    {rows[0].overall===null && <p className="meta">첫 단계 값이 0이어서 전체 전환율은 계산할 수 없습니다.</p>}
    {!readOnly && <section className="lbc-stage-editor"><h4>단계 편집</h4>{stages.map((stage,i)=><div className="lbc-stage" key={stage.id} data-funnel-stage={stage.id}><label className="lb-field"><span>단계 {i+1} 이름</span><input maxLength={100} value={stage.name} onChange={event=>update(stage.id,{name:event.target.value})}/></label><NumericInput label={`단계 ${i+1} 수`} value={stage.value} readOnly={false} onChange={value=>update(stage.id,{value})} onError={setError}/><div className="lbc-stage-actions"><button type="button" className="btn small" disabled={i===0} aria-label={`단계 ${i+1} 위로`} onClick={()=>move(i,-1)}>↑</button><button type="button" className="btn small" disabled={i===stages.length-1} aria-label={`단계 ${i+1} 아래로`} onClick={()=>move(i,1)}>↓</button><button type="button" className="btn small" disabled={stages.length<=2} aria-label={`단계 ${i+1} 삭제`} onClick={()=>{if(window.confirm('이 퍼널 단계를 삭제할까요?'))commit(stages.filter(s=>s.id!==stage.id));}}>삭제</button></div></div>)}<button type="button" className="btn" disabled={stages.length>=MAX_FUNNEL_STAGES} onClick={()=>commit([...stages,{id:crypto.randomUUID(),name:'새 단계',value:''}])}>단계 추가</button></section>}
    <button type="button" className="btn primary lbc-download" disabled={downloading} onClick={()=>void download()}>{downloading?'이미지 만드는 중…':'퍼널 이미지 다운로드'}</button><p className="meta">다운로드한 이미지를 클로드에 올려 보고서를 요청해 보세요.</p>{error && <p role="alert">{error}</p>}
  </section>;
}
export function LessonCalculator({block,answer,readOnly,onChange}:Props){
  if(!isCalculator(block.type) || !hasCalculatorDefinition(block))return <p role="alert">계산기의 구성과 버전을 확인하고 있습니다.</p>;
  if(answer!==undefined && (!answer || typeof answer!=='object' || Array.isArray(answer)))return <p role="alert">저장된 계산기 입력을 확인하지 못했습니다. 기존 값을 보존한 상태로 관리자에게 문의해 주세요.</p>;
  const values=answer ?? {};
  try{validateCalculatorValues(block.type,values);}catch{return <p role="alert">저장된 계산기 입력을 확인하지 못했습니다. 기존 값을 보존한 상태로 관리자에게 문의해 주세요.</p>;}
  const props={values:values as Record<string,string>,readOnly,onChange};
  return <>{block.content && <p className="reading-copy">{block.content}</p>}{readOnly && !Object.keys(values).length && <p className="meta">아직 입력한 데이터가 없습니다. 아래에는 기본값이 표시됩니다.</p>}{block.type==='recipe-calculator'?<Recipe {...props}/>:block.type==='margin-calculator'?<Margin {...props}/>:<Funnel {...props}/>}</>;
}
