import Link from 'next/link';
import './site-footer.css';

export function SiteFooter({ supportEmail, supportUrl }: { supportEmail?: string; supportUrl?: string } = {}) {
  const email = supportEmail || 'edu@brandyaction.co.kr';
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div className="site-footer-top">
          <div>
            <Link className="site-footer-name" href="/">브랜디액션 에듀</Link>
            <p className="site-footer-description">사람과 사업의 가능성을 실행으로 바꾸는 실전 교육 플랫폼</p>
          </div>
          <nav className="site-footer-links" aria-label="푸터 안내">
            <Link href="/policies/terms">이용약관</Link>
            <Link href="/policies/privacy">개인정보처리방침</Link>
            <Link href="/policies/refund">환불규정</Link>
            <Link href={supportUrl || '/my/questions'}>문의하기</Link>
          </nav>
        </div>
        <div className="site-footer-company">
          <dl className="site-footer-business">
            <div><dt>상호</dt><dd>주식회사 브랜디액션</dd></div>
            <div><dt>대표자</dt><dd>전태헌, 안정호</dd></div>
            <div><dt>사업자등록번호</dt><dd>677-87-02769</dd></div>
            <div><dt>통신판매업 신고번호</dt><dd>제2026-충남천안-1825호</dd></div>
            <div><dt>대표전화</dt><dd><a href="tel:07077363744">070-7736-3744</a></dd></div>
          </dl>
          <dl className="site-footer-contact">
            <div><dt>주소</dt><dd>충청남도 천안시 서북구 천안천4길 32 506호</dd></div>
            <div><dt>고객지원</dt><dd><a href={'mailto:' + email}>{email}</a></dd></div>
          </dl>
        </div>
        <p className="site-footer-copyright">© 2026 BrandyAction Co., Ltd. All rights reserved.</p>
      </div>
    </footer>
  );
}
