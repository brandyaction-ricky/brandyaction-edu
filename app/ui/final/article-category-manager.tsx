"use client";

import { text as t, type Row } from "@/lib/platform";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { useState, type FormEvent } from "react";

type Send = (body: Record<string, unknown>, success?: string) => Promise<unknown>;
type Draft = { id: string; name: string; slug: string; description: string; displayOrder: number; active: boolean };

const emptyDraft = (): Draft => ({ id: "", name: "", slug: "", description: "", displayOrder: 0, active: true });

export function ArticleCategoryManager({ categories, articles, send, pending }: { categories: Row[]; articles: Row[]; send: Send; pending: boolean }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const ordered = [...categories].sort((a, b) => Number(a.display_order || 0) - Number(b.display_order || 0));
  const usage = (id: string) => articles.filter(article => article.category_id === id).length;
  const start = (row?: Row) => {
    setDraft(row ? { id: String(row.id), name: t(row, "name"), slug: t(row, "slug"), description: t(row, "description"), displayOrder: Number(row.display_order || 0), active: row.is_active !== false } : { ...emptyDraft(), displayOrder: ordered.length });
    setOpen(true);
  };
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await send({ action: "article-category-save", ...draft }, draft.id ? "아티클 카테고리를 수정했습니다." : "아티클 카테고리를 등록했습니다.");
    setOpen(false);
  }
  async function remove(row: Row) {
    if (!confirm(`‘${t(row, "name")}’ 카테고리를 삭제할까요?`)) return;
    await send({ action: "article-category-delete", id: row.id }, "아티클 카테고리를 삭제했습니다.");
  }
  return (
    <section className="panel article-category-manager">
      <div className="panel-head">
        <div><h2>아티클 카테고리</h2><p>등록 화면과 고객 화면의 필터에서 같은 카테고리를 사용합니다.</p></div>
        <button className="btn" type="button" disabled={pending} onClick={() => start()}><Plus />카테고리 추가</button>
      </div>
      <div className="article-category-list">
        {ordered.map(row => <div className="article-category-row" key={row.id}>
          <div><b>{t(row, "name")}</b><small>/{t(row, "slug")} · 아티클 {usage(String(row.id))}개{row.is_active === false ? " · 미사용" : ""}</small></div>
          <div className="row"><button className="icon-btn" type="button" aria-label={`${t(row, "name")} 수정`} onClick={() => start(row)}><Pencil /></button><button className="icon-btn danger" type="button" aria-label={`${t(row, "name")} 삭제`} disabled={pending || usage(String(row.id)) > 0} title={usage(String(row.id)) ? "사용 중인 카테고리는 삭제할 수 없습니다." : undefined} onClick={() => void remove(row)}><Trash2 /></button></div>
        </div>)}
        {!ordered.length && <p className="article-category-empty">등록된 카테고리가 없습니다.</p>}
      </div>
      {open && <div className="article-category-form-wrap">
        <form className="article-category-form" onSubmit={submit}>
          <div className="between"><h3>{draft.id ? "카테고리 수정" : "카테고리 등록"}</h3><button className="icon-btn" type="button" aria-label="닫기" onClick={() => setOpen(false)}><X /></button></div>
          <div className="form-grid mt16">
            <div className="field"><label htmlFor="article-category-name">카테고리명 *</label><input id="article-category-name" required maxLength={50} value={draft.name} onChange={event => setDraft(current => ({ ...current, name: event.target.value }))} /></div>
            <div className="field"><label htmlFor="article-category-slug">주소 이름 *</label><input id="article-category-slug" required pattern="[a-z0-9-]+" placeholder="marketing" value={draft.slug} onChange={event => setDraft(current => ({ ...current, slug: event.target.value.toLowerCase() }))} /></div>
            <div className="field span2"><label htmlFor="article-category-description">설명</label><input id="article-category-description" maxLength={160} value={draft.description} onChange={event => setDraft(current => ({ ...current, description: event.target.value }))} /></div>
            <div className="field"><label htmlFor="article-category-order">노출 순서</label><input id="article-category-order" type="number" min={0} max={999} value={draft.displayOrder} onChange={event => setDraft(current => ({ ...current, displayOrder: Number(event.target.value) }))} /></div>
            <label className="article-category-active"><input type="checkbox" checked={draft.active} onChange={event => setDraft(current => ({ ...current, active: event.target.checked }))} />사용 중</label>
          </div>
          <div className="row article-category-actions"><button className="btn" type="button" onClick={() => setOpen(false)}>취소</button><button className="btn primary" disabled={pending}>{pending ? "저장 중..." : "저장"}</button></div>
        </form>
      </div>}
    </section>
  );
}
