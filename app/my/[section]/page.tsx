import { CreditCard, Settings } from "lucide-react";
import { LearnerShell } from "../../components/learner-shell";

export default async function MyPlaceholder({params}:{params:Promise<{section:string}>}){const {section}=await params;const orders=section==="orders";return <LearnerShell active={orders?"orders":"settings"}><div className="placeholder-page"><span className="placeholder-icon">{orders?<CreditCard/>:<Settings/>}</span><h1>{orders?"구매 내역":"계정 설정"}</h1><p>{orders?"결제·환불 내역과 영수증을 확인하는 영역입니다.":"회원 정보와 알림 수신 설정을 관리하는 영역입니다."}</p><div className="placeholder-box"><strong>UI/UX 구조에 포함된 화면</strong><span>실제 회원·결제 데이터 연동 시 목록이 표시됩니다.</span></div></div></LearnerShell>}
