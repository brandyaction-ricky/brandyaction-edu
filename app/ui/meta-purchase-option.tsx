'use client';
import type { useMetaPurchaseConsent } from './use-meta-purchase-consent';
import styles from './optional-consent.module.css';
type State = ReturnType<typeof useMetaPurchaseConsent>;
export function MetaPurchaseOption({ state, disabled = false, immediate = false }: { state: State; disabled?: boolean; immediate?: boolean }) {
  const terms = state.snapshot?.terms;
  return <div className={styles.benefit}>
    <label><input type="checkbox" checked={state.value} disabled={disabled || state.busy || !terms} onChange={event => {
      state.setValue(event.target.checked);
      if (immediate) void state.save(event.target.checked);
    }}/><span>[선택] Meta 구매 전환 측정·광고 최적화를 위한 정보 제공·국외 이전 동의</span></label>
    <p className={styles.help}>Facebook·Instagram 광고 성과 측정과 광고 최적화에 사용하는 항목이에요. 선택하지 않아도 광고 수신 동의와 쿠폰 발급에는 영향이 없어요.</p>
    {terms ? <details className={styles.details}><summary>Meta에 보내는 정보와 국외 이전 안내</summary><dl className={styles.disclosure}>
      <dt>제공받는 자</dt><dd>{terms.recipient}</dd>
      <dt>이전 국가</dt><dd>{terms.country}</dd>
      <dt>제공 항목</dt><dd>{terms.items}</dd>
      <dt>이용 목적</dt><dd>{terms.purpose}</dd>
      <dt>이전 시기·방법</dt><dd>{terms.transfer}</dd>
      <dt>보유·이용 기간</dt><dd>{terms.retention}</dd>
      <dt>동의 거부·철회</dt><dd>{terms.refusal}</dd>
      <dt>문의</dt><dd>{terms.contact}</dd>
    </dl></details> : !state.error && <p className={styles.help}>전송 항목과 국외 이전 안내를 준비 중이에요. 지금은 새 동의를 받지 않아요.</p>}
    {state.snapshot?.needsRenewal && <p className={styles.help}>안내가 바뀌어 기존 동의는 적용하지 않아요. 새 안내를 확인한 뒤 원할 때 선택해 주세요.</p>}
    {immediate && state.snapshot?.consented && <button type="button" className="btn ghost" disabled={disabled || state.busy} onClick={() => { state.setValue(false); void state.save(false); }}>Meta 동의 취소</button>}
    {state.notice && <p role="status" className={styles.help}>{state.notice}</p>}
    {state.error && <div><p role="alert" className={styles.help}>{state.error}</p><div className={styles.actions}>
      {immediate && state.unresolved && !state.conflict && <button type="button" className="btn ghost" disabled={disabled || state.busy} onClick={() => void state.save()}>Meta 동의 저장 다시 확인하기</button>}
      <button type="button" className="btn ghost" disabled={disabled || state.busy} onClick={() => void state.reload()}>Meta 설정 다시 불러오기</button>
    </div></div>}
  </div>;
}
