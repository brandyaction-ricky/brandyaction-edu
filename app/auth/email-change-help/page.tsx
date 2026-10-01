import Link from "next/link";

export default async function EmailChangeHelpPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const pending = (await searchParams).status === "pending";
  return <div className="edu-front"><main className="form-page"><section className="form-card">
    <h1>{pending ? "이 이메일 주소를 확인했습니다" : "이메일 변경 확인하기"}</h1>
    <p className="lead">{pending ? "주소 변경을 마치려면 나머지 확인 메일도 열어 주세요. 지금 비밀번호를 입력하거나 새 계정을 만들 필요는 없습니다." : "확인 링크를 연 브라우저에서 로그인 화면이 나와도 새 계정을 만들 필요는 없습니다."}</p>
    <ol className="mt24">
      {pending && <li>기존 이메일과 새 이메일 중 아직 확인하지 않은 주소의 메일함을 열고 ‘이메일 주소 확인하기’를 눌러 주세요.</li>}
      <li>{pending ? "두 메일을 모두 확인한 뒤 원래 열어 둔 회원 정보 화면으로 돌아가세요. 로그인이 필요하면 기존 카카오·구글 계정을 사용하세요." : "기존에 사용하던 카카오·구글 계정으로 로그인하세요."}</li>
      <li>마이페이지 → 회원 정보에서 현재 로그인 이메일과 변경 확인 대기 상태를 확인하세요. 기존 이메일에도 확인 메일이 왔다면 그 메일까지 확인해야 변경이 끝납니다.</li>
      <li>새 이메일로 직접 로그인하려면, 회원 정보에서 이메일 로그인 비밀번호를 설정하세요. 카카오·구글 가입 계정에는 비밀번호가 자동으로 생기지 않습니다.</li>
    </ol>
    <Link className="btn primary full mt24" href="/login?next=%2Fmy%2Fprofile">기존 계정으로 로그인하고 상태 확인</Link>
    <p className="meta mt16">현재 회원 정보 화면이 다른 탭에 열려 있다면 그 탭으로 돌아가 ‘이메일 변경 상태 새로 확인’을 눌러도 됩니다.</p>
  </section></main></div>;
}
