import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getEduSettings } from "@/lib/edu-settings";
import { MOONSHOT_SUPPORT_URL } from "@/lib/purchase-onboarding";

export default async function EmailChangeHelpPage({ searchParams }: { searchParams: Promise<{ status?: string; flow?: string }> }) {
  const { status, flow } = await searchParams;
  const { data: { user } } = await (await createClient()).auth.getUser();
  const success = status === "success";
  const pending = status === "pending";
  const unavailable = status === "expired" || (flow === "admin_email_change" && !success && !pending);
  const adminChange = flow === "admin_email_change";
  const { operations } = unavailable && adminChange ? await getEduSettings() : { operations: {} as Record<string, unknown> };
  const supportUrl = typeof operations.supportUrl === "string" && /^https:\/\/[^\s]+$/.test(operations.supportUrl) ? operations.supportUrl : MOONSHOT_SUPPORT_URL;

  return <div className="edu-front"><main className="form-page"><section className="form-card">
    <h1>{success ? "새 이메일 확인 완료" : pending ? "이메일 변경 확인 중" : unavailable ? "이 확인 링크는 사용할 수 없어요" : "이메일 변경 상태 확인"}</h1>
    {success ? <>
      <p className="lead">로그인 이메일 변경이 끝났어요. 새 이메일과 방금 정한 <strong>브랜디에듀 비밀번호</strong>로 로그인할 수 있어요.</p>
      <p className="mt24">기존 주문과 수강 내역은 그대로예요. 카카오·구글 로그인도 계속 사용할 수 있어요.</p>
      <Link className="btn primary full mt24" href={user ? "/my/classes" : "/login?next=%2Fmy%2Fclasses"}>{user ? "내 수강 내역 보기" : "새 이메일로 로그인하기"}</Link>
    </> : pending ? <>
      <p className="lead">메일의 링크는 확인했지만 로그인 이메일 변경이 아직 끝나지 않았어요.</p>
      <p className="mt24">이전에 받은 확인 메일이라면 기존 이메일에도 확인 메일이 왔는지 확인해 주세요. 회원 정보에서 현재 상태를 확인할 수 있어요.</p>
      <Link className="btn primary full mt24" href={user ? "/my/profile" : "/login?next=%2Fmy%2Fprofile"}>회원 정보에서 상태 확인하기</Link>
    </> : unavailable ? <>
      <p className="lead">{status === "expired" ? "메일을 보낸 지 1시간이 지났거나 이미 확인한 링크예요." : "이 링크로는 이메일 변경을 확인하지 못했어요. 새 확인 메일을 받아 주세요."}</p>
      {adminChange ? <>
        <p className="mt24">아래 버튼을 눌러 고객센터에 <strong>“로그인 이메일 변경 확인 메일을 다시 보내 주세요.”</strong>라고 말씀해 주세요.</p>
        <a className="btn primary full mt24" href={supportUrl}>확인 메일 다시 요청하기</a>
      </> : <>
        <p className="mt24">회원 정보에서 이메일 변경을 다시 신청해 주세요.</p>
        <Link className="btn primary full mt24" href={user ? "/my/profile" : "/login?next=%2Fmy%2Fprofile"}>새 확인 메일 받으러 가기</Link>
      </>}
      <p className="mt24">새 메일을 받으면 1시간 안에 링크를 눌러 주세요. 새 계정을 만들 필요는 없어요.</p>
      <p className="mt24">이미 이메일 변경과 비밀번호 설정을 마쳤다면 새 이메일과 브랜디에듀 비밀번호로 로그인하면 돼요.</p>
      <Link className="btn full mt24" href="/login?next=%2Fmy%2Fclasses">이미 변경했다면 로그인하기</Link>
    </> : <>
      <p className="lead">이 브라우저에서는 이메일 변경 완료 여부를 확인하지 못했어요. 회원 정보에서 현재 로그인 이메일을 확인해 주세요.</p>
      <p className="mt24">새 계정을 만들 필요는 없어요.</p>
      <Link className="btn primary full mt24" href={user ? "/my/profile" : "/login?next=%2Fmy%2Fprofile"}>회원 정보 확인하기</Link>
    </>}
  </section></main></div>;
}
