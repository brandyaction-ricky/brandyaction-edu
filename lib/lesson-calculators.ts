// Ported from the user-provided Replit 2026-09-07 source. Preserve this version
// for saved lesson answers; compare the live export before curriculum migration.
// RecipeCalculator.tsx SHA256 ecf56585d05df6e414cf2e7ab1039c14af10c2f7f9bdea189513f24b78a39cb4
// MarginCalculator.tsx SHA256 edf524c0581e6ba251474fe22b0832f783bf88659c9d30315d2729106ef17875
// FunnelBuilder.tsx SHA256 d3f999a8958a37045e479a085d20ee159ea6862e9333af89f05392d6cf9c9ec1
import type { BlockField, LessonBlock, PublicLessonBlock } from './lesson-blocks';

export type CalculatorType = 'recipe-calculator' | 'margin-calculator' | 'marketing-funnel';
export const CALCULATOR_VERSION = 'replit-2026-09-07' as const;
export const MAX_FUNNEL_STAGES = 50;
export const MAX_CALCULATOR_VALUE = 1e15;

export const RECIPE_INPUTS: { key: string; label: string }[] = [
  { key: "adClicks", label: "최근 3일간 당근 광고 클릭 수" },
  { key: "placeVisits", label: "최근 3일간 네이버 플레이스 유입 수" },
  { key: "couponDownloads", label: "최근 3일간 플레이스 쿠폰 다운로드 수" },
  { key: "smartCalls", label: "최근 3일간 스마트콜 횟수" },
  { key: "naverPayPayments", label: "최근 3일간 네이버 페이 결제 건" },
  { key: "receiptReviews", label: "최근 3일간 영수증 리뷰 건" },
  { key: "nPayConnectPayments", label: "최근 3일간 N pay connect 결제 건" },
  { key: "newReviews", label: "최근 3일간 획득 신규 리뷰" },
  { key: "newBlogPostings", label: "최근 3일간 획득 신규 블로그 포스팅" },
];

export const MARGIN_DEFAULTS: Record<string, string> = {
  salePrice: "",
  shippingFee: "",
  purchasePrice: "",
  purchaseShipping: "",
  etcCost: "",
  freightCost: "",
  adCost: "",
  channel: "스마트스토어",
  categoryFee: "3.63",
  linkFee: "3",
  deliveryFeeRate: "3.63",
  vatType: "일반 과세자",
  vatRate: "10",
};

export const CHANNEL_OPTIONS = ["스마트스토어", "직접 입력"];
export const VAT_OPTIONS = ["일반 과세자", "면세 사업자"];

export const CHANNEL_PRESETS: Record<string, { categoryFee: string; linkFee: string; deliveryFeeRate: string }> = {
  스마트스토어: { categoryFee: "3.63", linkFee: "3", deliveryFeeRate: "3.63" },
};

export interface FunnelStage {
  id: string;
  name: string;
  value: string;
}

export const DEFAULT_FUNNEL_STAGES: FunnelStage[] = [
  { id: "s1", name: "광고 노출", value: "1000" },
  { id: "s2", name: "클릭", value: "300" },
  { id: "s3", name: "랜딩페이지 방문", value: "200" },
  { id: "s4", name: "DB 입력 (신청)", value: "50" },
  { id: "s5", name: "매장 방문", value: "20" },
  { id: "s6", name: "업셀링", value: "8" },
];


function n(value: string) { return value.trim() ? Number(value) : 0; }
function fmt(value: number) { return Math.round(value * 100) / 100; }
export function validCalculatorNumber(value: string): boolean {
  return value.trim() === '' || (/^(?:[+]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)$/i.test(value.trim()) && Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= MAX_CALCULATOR_VALUE);
}
function checkedNumber(value: string) {
  if (!validCalculatorNumber(value)) throw new Error('계산기에는 범위 안의 0 이상 숫자를 입력해 주세요.');
  return n(value);
}

export function calculateRecipe(values: Record<string, string>) {
  const getVal = (key: string) => values[key] ?? '';
  const adClicks = checkedNumber(getVal("adClicks"));
  const placeVisits = checkedNumber(getVal("placeVisits"));
  const couponDownloads = checkedNumber(getVal("couponDownloads"));
  const smartCalls = checkedNumber(getVal("smartCalls"));
  const naverPayPayments = checkedNumber(getVal("naverPayPayments"));
  const receiptReviews = checkedNumber(getVal("receiptReviews"));
  const nPayConnectPayments = checkedNumber(getVal("nPayConnectPayments"));
  const newReviews = checkedNumber(getVal("newReviews"));
  const newBlogPostings = checkedNumber(getVal("newBlogPostings"));

  const organicVisits = (placeVisits - adClicks) / 3;
  const adVisits = adClicks / 3;
  const totalVisits = organicVisits + adVisits;

  const couponAvg = couponDownloads / 3;
  const smartCallAvg = smartCalls / 3;
  const directionAvg = (placeVisits / 3) * 0.03;
  const totalBehavior = couponAvg + smartCallAvg + directionAvg;

  const nPayConnectAvg = nPayConnectPayments / 3;
  const naverPayAvg = naverPayPayments / 3;
  const receiptReviewAvg = receiptReviews / 3;
  const totalPayment = nPayConnectAvg + naverPayAvg + receiptReviewAvg;

  const reviewAvg = newReviews / 3;
  const blogAvg = newBlogPostings / 3;
  const totalReview = reviewAvg + blogAvg;

  const BENCHMARKS = { visits: 50, behavior: 5, payment: 3, review: 1 };
  const achievements = [
    { label: "총 유입", rate: (totalVisits / BENCHMARKS.visits) * 100 },
    { label: "행동 데이터 획득", rate: (totalBehavior / BENCHMARKS.behavior) * 100 },
    { label: "결제 전환 획득", rate: (totalPayment / BENCHMARKS.payment) * 100 },
    { label: "리뷰 전환 획득", rate: (totalReview / BENCHMARKS.review) * 100 },
  ];

  const results = [
    {
      label: "총 유입 획득 수",
      value: fmt(totalVisits),
      unit: "명",
      subDesc: "(=오가닉 유입+광고 유입)",
      details: [
        { label: "오가닉 유입", value: fmt(organicVisits), desc: "(=(플레이스 유입-광고 클릭)/3)" },
        { label: "광고 유입", value: fmt(adVisits), desc: "(=광고 클릭/3)" },
      ],
    },
    {
      label: "행동 데이터 획득",
      value: fmt(totalBehavior),
      unit: "건",
      subDesc: "(=쿠폰 다운로드+스마트콜+길찾기)",
      details: [
        { label: "쿠폰 다운로드 수", value: fmt(couponAvg), desc: "(=쿠폰 다운로드/3)" },
        { label: "스마트콜 횟수", value: fmt(smartCallAvg), desc: "(=스마트콜/3)" },
        { label: "길찾기 수(추정치)", value: fmt(directionAvg), desc: "(=플레이스 유입/3×0.03)" },
      ],
    },
    {
      label: "결제 전환 획득",
      value: fmt(totalPayment),
      unit: "건",
      subDesc: "(=Npayconnect+네이버 페이+영수증 리뷰)",
      details: [
        { label: "Npayconnect 결제 건", value: fmt(nPayConnectAvg), desc: "(=N pay connect/3)" },
        { label: "네이버 페이 결제 건", value: fmt(naverPayAvg), desc: "(=네이버 페이/3)" },
        { label: "영수증 리뷰 건", value: fmt(receiptReviewAvg), desc: "(=영수증 리뷰/3)" },
      ],
    },
    {
      label: "리뷰 전환 획득",
      value: fmt(totalReview),
      unit: "건",
      subDesc: "(=리뷰 전환+블로그 전환)",
      details: [
        { label: "리뷰 전환", value: fmt(reviewAvg), desc: "(=신규 리뷰/3)" },
        { label: "블로그 전환", value: fmt(blogAvg), desc: "(=신규 블로그 포스팅/3)" },
      ],
    },
  ];

  return { results, achievements };
}

export function calculateMargin(values: Record<string, string>) {
  const getVal = (key: string) => values[key] ?? MARGIN_DEFAULTS[key] ?? '';
  const P = checkedNumber(getVal("salePrice"));
  const S = checkedNumber(getVal("shippingFee"));
  const C = checkedNumber(getVal("purchasePrice"));
  const CS = checkedNumber(getVal("purchaseShipping"));
  const E = checkedNumber(getVal("etcCost"));
  const F = checkedNumber(getVal("freightCost"));
  const AD = checkedNumber(getVal("adCost"));
  const f1 = checkedNumber(getVal("categoryFee"));
  const f2 = checkedNumber(getVal("linkFee"));
  const f3 = checkedNumber(getVal("deliveryFeeRate"));
  const vatType = getVal("vatType");
  const v = checkedNumber(getVal("vatRate"));

  const revenue = P + S;
  const categoryFeeAmt = (P * f1) / 100;
  const linkFeeAmt = (P * f2) / 100;
  const deliveryFeeAmt = (S * f3) / 100;
  const totalFee = categoryFeeAmt + linkFeeAmt + deliveryFeeAmt;
  const settlement = revenue - totalFee;

  const totalCost = C + CS + E + F + AD;

  let vat = 0;
  if (vatType === "일반 과세자") {
    const salesVat = (revenue * v) / (100 + v);
    const purchaseVat = (totalCost * v) / (100 + v);
    vat = salesVat - purchaseVat;
  }

  const netProfit = settlement - totalCost - vat;
  const marginRate = P > 0 ? (netProfit / P) * 100 : 0;


  return { revenue, categoryFeeAmt, linkFeeAmt, deliveryFeeAmt, totalFee, settlement, totalCost, vat, netProfit, marginRate };
}

export const MARGIN_INPUTS = [
  { key:'salePrice', label:'판매가격', group:'매출', unit:'원' },
  { key:'shippingFee', label:'배송비', group:'매출', unit:'원' },
  { key:'purchasePrice', label:'매입가격', group:'매입', unit:'원' },
  { key:'purchaseShipping', label:'매입운송비', group:'매입', unit:'원' },
  { key:'etcCost', label:'기타(포장비, 사은품 등..)', group:'매입', unit:'원' },
  { key:'freightCost', label:'운임비(택배비용)', group:'매입', unit:'원' },
  { key:'adCost', label:'광고비(마케팅)', group:'매입', unit:'원' },
  { key:'channel', label:'판매 채널', group:'수수료', unit:'', options:CHANNEL_OPTIONS },
  { key:'categoryFee', label:'카테고리 수수료', group:'수수료', unit:'%' },
  { key:'linkFee', label:'연동 수수료', group:'수수료', unit:'%' },
  { key:'deliveryFeeRate', label:'배송비 수수료', group:'수수료', unit:'%' },
  { key:'vatType', label:'과세 유형', group:'부가세', unit:'', options:VAT_OPTIONS },
  { key:'vatRate', label:'부가세율', group:'부가세', unit:'%' },
];
export function isCalculator(type: string): type is CalculatorType { return ['recipe-calculator','margin-calculator','marketing-funnel'].includes(type); }
export function calculatorFields(type: CalculatorType): BlockField[] {
  const input = type === 'recipe-calculator' ? RECIPE_INPUTS : type === 'margin-calculator' ? MARGIN_INPUTS : [{key:'data',label:'마케팅 퍼널 단계'}];
  return input.map(item => ({ id:item.key, variable:item.key, label:item.label, placeholder:'', required:false, sensitive:false, ...('options' in item && item.options ? {options:[...(item.options as string[])]} : {}) }));
}
export function hasCalculatorDefinition(block: Pick<PublicLessonBlock,'type'|'toolVersion'|'fields'>): boolean {
  if (!isCalculator(block.type) || block.toolVersion !== CALCULATOR_VERSION) return false;
  const expected=calculatorFields(block.type),fields=block.fields;
  return Boolean(fields && fields.length===expected.length && expected.every((e,i)=>{
    const f=fields[i];return f.id===e.id && f.variable===e.variable && f.label===e.label && f.placeholder===e.placeholder && f.required===e.required && f.sensitive===e.sensitive && JSON.stringify(f.options)===JSON.stringify(e.options);
  }));
}
export function newCalculatorBlock(type:CalculatorType,id:string):LessonBlock { return {id,type,toolVersion:CALCULATOR_VERSION,fields:calculatorFields(type)}; }
export function parseFunnelStages(raw?: string):FunnelStage[] {
  if (raw===undefined || raw==='') return structuredClone(DEFAULT_FUNNEL_STAGES);
  let data:unknown;
  try { data=JSON.parse(raw); } catch { throw new Error('저장된 퍼널 단계 형식을 확인해 주세요.'); }
  if (!Array.isArray(data) || data.length<2 || data.length>MAX_FUNNEL_STAGES) throw new Error(`퍼널은 2~${MAX_FUNNEL_STAGES}단계로 구성해 주세요.`);
  const ids=new Set<string>();
  return data.map(item=>{
    if (!item || typeof item!=='object' || Array.isArray(item) || Object.keys(item).some(key=>!['id','name','value'].includes(key))) throw new Error('퍼널 단계 형식을 확인해 주세요.');
    if (typeof item.id!=='string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/.test(item.id) || Object.hasOwn(Object.prototype,item.id) || item.id==='prototype' || ids.has(item.id)) throw new Error('퍼널 단계 식별자를 확인해 주세요.');
    if (typeof item.name!=='string' || item.name.length>100 || typeof item.value!=='string' || !validCalculatorNumber(item.value)) throw new Error('퍼널 단계 이름과 숫자를 확인해 주세요.');
    ids.add(item.id); return {id:item.id,name:item.name,value:item.value};
  });
}
export function validateCalculatorValues(type:CalculatorType,values:Record<string,string|number>):void {
  const fields=calculatorFields(type);
  for(const [key,value]of Object.entries(values)){
    const field=fields.find(f=>f.id===key);
    if(!field || typeof value!=='string') throw new Error('계산기 입력 항목을 확인해 주세요.');
    if(type==='marketing-funnel')parseFunnelStages(value);
    else if(field.options){if(!field.options.includes(value))throw new Error('목록에 있는 계산 조건을 선택해 주세요.');}
    else checkedNumber(value);
  }
}
export function calculateFunnel(stages:FunnelStage[]){
  const nums=stages.map(s=>checkedNumber(s.value)),base=Math.max(nums[0]||0,1);
  return stages.map((stage,i)=>({
    ...stage,number:nums[i],ratio:Math.max(0,Math.min(1,nums[i]/base)),
    // The original used 1 when the first stage was zero. Keep its safe visual
    // width, but never report a fabricated conversion rate for a zero base.
    overall:nums[0]>0?nums[i]/nums[0]*100:null,
    previous:i>0 && nums[i-1]>0?nums[i]/nums[i-1]*100:null,
  }));
}
