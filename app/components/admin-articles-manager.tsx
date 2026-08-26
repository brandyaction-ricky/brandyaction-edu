"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowUp, BookOpen, Check, ChevronRight, Download, Eye, FileImage, FileText, GripVertical, ImagePlus, LoaderCircle, Paperclip, Pencil, Plus, Save, Search, Settings2, Star, Trash2, Upload, Video } from "lucide-react";
import { type Article, type ArticleBlock, type ArticleBlockType, type ArticleCategory, defaultFreeCourse, type FreeCourseSettings, slugify } from "@/lib/articles";

type AdminPayload = { articles: Article[]; categories: ArticleCategory[]; freeCourse: FreeCourseSettings };
type View = "list" | "editor" | "free-course";

const statusLabels = { draft: "임시저장", scheduled: "예약", published: "공개", hidden: "숨김" };
const blockLabels: Record<ArticleBlockType, string> = { paragraph: "문단", heading: "소제목", quote: "인용", list: "목록", image: "이미지" };

function emptyArticle(categoryId = ""): Article {
  return { id: "", categoryId, categoryName: "", slug: "", title: "", summary: "", contentType: "column", videoUrl: "", blocks: [{ id: crypto.randomUUID(), type: "paragraph", text: "" }], attachments: [], coverImagePath: "", coverImageUrl: "", coverImageAlt: "", status: "draft", isFeatured: false, landingFeaturedRank: 0, seoTitle: "", seoDescription: "", scheduledAt: "", publishedAt: "", createdAt: "", updatedAt: "" };
}

async function requestJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const result = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(result.error || "요청을 처리하지 못했습니다.");
  return result;
}

function dateLabel(value: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value)).replace(/\.\s/g, ". ").trim();
}

async function uploadImage(file: File) {
  const form = new FormData();
  form.append("file", file);
  return requestJson<{ path: string; url: string }>("/api/admin/articles/image", { method: "POST", body: form });
}

export function AdminArticlesManager() {
  const [data, setData] = useState<AdminPayload>({ articles: [], categories: [], freeCourse: defaultFreeCourse });
  const [view, setView] = useState<View>("list");
  const [draft, setDraft] = useState<Article>(() => emptyArticle());
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [categoryDraft, setCategoryDraft] = useState({ id: "", name: "", description: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try { setData(await requestJson<AdminPayload>("/api/admin/articles", { cache: "no-store" })); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "블로그 데이터를 불러오지 못했습니다."); }
    finally { setLoading(false); }
  };
  useEffect(() => { void Promise.resolve().then(load); }, []);

  const visible = useMemo(() => data.articles.filter((article) => {
    const term = query.trim().toLowerCase();
    return (categoryFilter === "all" || article.categoryId === categoryFilter) && (!term || `${article.title} ${article.summary}`.toLowerCase().includes(term));
  }), [categoryFilter, data.articles, query]);

  const notify = (copy: string) => { setMessage(copy); window.setTimeout(() => setMessage(""), 2600); };
  const mutate = async (body: Record<string, unknown>, success: string) => {
    setSaving(true); setError("");
    try { await requestJson("/api/admin/articles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); await load(); notify(success); return true; }
    catch (reason) { setError(reason instanceof Error ? reason.message : "저장하지 못했습니다."); return false; }
    finally { setSaving(false); }
  };

  const saveCategory = async () => {
    const name = categoryDraft.name.trim();
    if (!name) return;
    const existing = data.categories.find((item) => item.id === categoryDraft.id);
    const ok = await mutate({ action: "saveCategory", category: { id: categoryDraft.id, name, slug: slugify(name), description: categoryDraft.description, displayOrder: existing?.displayOrder ?? data.categories.length, isActive: true } }, categoryDraft.id ? "카테고리를 수정했습니다." : "카테고리를 추가했습니다.");
    if (ok) setCategoryDraft({ id: "", name: "", description: "" });
  };
  const deleteCategory = async (category: ArticleCategory) => {
    if (!window.confirm(`‘${category.name}’ 카테고리를 삭제할까요? 연결된 글은 미분류로 남습니다.`)) return;
    await mutate({ action: "deleteCategory", id: category.id }, "카테고리를 삭제했습니다.");
  };
  const openNew = () => { setDraft(emptyArticle(data.categories[0]?.id || "")); setView("editor"); setError(""); };
  const openEdit = (article: Article) => { setDraft(structuredClone(article)); setView("editor"); setError(""); };
  const saveArticle = async (article = draft, success = "블로그 콘텐츠를 저장했습니다.") => {
    const ok = await mutate({ action: "saveArticle", article }, success);
    if (ok) setView("list");
  };
  const quickUpdate = async (article: Article, changes: Partial<Article>, success: string) => { await saveArticle({ ...article, ...changes }, success); };
  const toggleLandingFeature = async (article: Article) => {
    const isSelected = article.landingFeaturedRank > 0;
    await mutate({ action: "toggleLandingFeature", id: article.id }, isSelected ? "메인 대표 콘텐츠에서 제외했습니다." : "메인 대표 콘텐츠로 추가했습니다.");
  };
  const removeArticle = async (article: Article) => {
    if (!window.confirm(`‘${article.title}’ 콘텐츠를 삭제할까요? 삭제 후 복구할 수 없습니다.`)) return;
    await mutate({ action: "deleteArticle", id: article.id }, "블로그 콘텐츠를 삭제했습니다.");
  };

  if (loading) return <section className="admin-panel admin-loading-state"><LoaderCircle className="spin"/><strong>블로그 관리 데이터를 불러오는 중입니다.</strong></section>;
  return <>
    <div className="article-admin-nav"><button className={view === "list" ? "active" : ""} onClick={() => setView("list")}><FileText/>블로그 콘텐츠</button><button className={view === "free-course" ? "active" : ""} onClick={() => setView("free-course")}><BookOpen/>무료강의 상단 설정</button><Link href="/articles" target="_blank"><Eye/>고객 화면 미리보기</Link></div>
    {error && <p className="admin-save-error">{error}</p>}
    {view === "list" && <ArticleList data={data} visible={visible} query={query} setQuery={setQuery} categoryFilter={categoryFilter} setCategoryFilter={setCategoryFilter} categoryDraft={categoryDraft} setCategoryDraft={setCategoryDraft} saveCategory={saveCategory} deleteCategory={deleteCategory} openNew={openNew} openEdit={openEdit} quickUpdate={quickUpdate} toggleLandingFeature={toggleLandingFeature} removeArticle={removeArticle} saving={saving}/>}
    {view === "editor" && <ArticleEditor draft={draft} setDraft={setDraft} categories={data.categories} saving={saving} onBack={() => setView("list")} onSave={() => void saveArticle()} setError={setError}/>}
    {view === "free-course" && <FreeCourseEditor value={data.freeCourse} saving={saving} onSave={async (freeCourse) => { const ok = await mutate({ action: "saveFreeCourse", freeCourse }, "무료강의 상단 설정을 저장했습니다."); if (ok) setView("free-course"); }}/>}
    {message && <div className="admin-toast"><Check/>{message}</div>}
  </>;
}

function ArticleList(props: { data: AdminPayload; visible: Article[]; query: string; setQuery: (value: string) => void; categoryFilter: string; setCategoryFilter: (value: string) => void; categoryDraft: { id: string; name: string; description: string }; setCategoryDraft: (value: { id: string; name: string; description: string }) => void; saveCategory: () => void; deleteCategory: (category: ArticleCategory) => void; openNew: () => void; openEdit: (article: Article) => void; quickUpdate: (article: Article, changes: Partial<Article>, success: string) => void; toggleLandingFeature: (article: Article) => void; removeArticle: (article: Article) => void; saving: boolean }) {
  return <div className="article-admin-workspace">
    <section className="admin-panel article-category-manager"><div className="article-admin-section-head"><div><span>01</span><div><h2>수강자 고민 분류</h2><p>고객이 자신의 고민에서 글을 찾도록 카테고리명과 안내 문구를 관리합니다.</p></div></div><strong>{props.data.categories.length}개 카테고리</strong></div><div className="article-category-cards">{props.data.categories.map((category) => <article className={props.categoryDraft.id === category.id ? "editing" : ""} key={category.id}><div><strong>{category.name}</strong><p>{category.description || "안내 문구가 없습니다."}</p></div><button onClick={() => props.setCategoryDraft({ id: category.id, name: category.name, description: category.description })}><Pencil/>수정</button><button className="danger" aria-label={`${category.name} 삭제`} onClick={() => props.deleteCategory(category)}><Trash2/></button></article>)}</div><div className="article-category-add"><input value={props.categoryDraft.name} onChange={(event) => props.setCategoryDraft({ ...props.categoryDraft, name: event.target.value })} placeholder="예: 나를 이해하기"/><input value={props.categoryDraft.description} onChange={(event) => props.setCategoryDraft({ ...props.categoryDraft, description: event.target.value })} onKeyDown={(event) => event.key === "Enter" && props.saveCategory()} placeholder="고객에게 보일 짧은 안내 문구"/><button onClick={props.saveCategory} disabled={props.saving}><Save/>{props.categoryDraft.id ? "수정 저장" : "분류 추가"}</button>{props.categoryDraft.id && <button className="admin-outline" onClick={() => props.setCategoryDraft({ id: "", name: "", description: "" })}>취소</button>}</div></section>
    <section className="admin-panel article-board"><div className="article-board-head"><div><span>02</span><div><h2>블로그 콘텐츠 <small>({props.data.articles.length})</small></h2><p>칼럼과 YouTube 영상을 한곳에서 관리합니다. 메인 대표 콘텐츠는 최대 3개까지 노출됩니다.</p></div></div><button className="admin-primary" onClick={props.openNew}><Plus/>새 콘텐츠</button></div><div className="article-board-toolbar"><div className="article-filter-tabs"><button className={props.categoryFilter === "all" ? "active" : ""} onClick={() => props.setCategoryFilter("all")}>전체</button>{props.data.categories.map((category) => <button className={props.categoryFilter === category.id ? "active" : ""} key={category.id} onClick={() => props.setCategoryFilter(category.id)}>{category.name}</button>)}</div><label><Search/><input value={props.query} onChange={(event) => props.setQuery(event.target.value)} placeholder="제목·요약 검색"/></label></div>
      <div className="article-admin-table"><header><span>제목</span><span>카테고리</span><span>상태</span><span>작성일</span><span>관리</span></header>{props.visible.map((article) => <article key={article.id}><button className="article-title-cell" onClick={() => props.openEdit(article)}><strong>{article.landingFeaturedRank > 0 && <Star/>}{article.contentType === "youtube" && <Video/>}{article.title}</strong><span>{article.contentType === "youtube" ? "YouTube 영상 · " : "칼럼 · "}{article.summary || "요약이 없습니다."}</span></button><span className="article-category-pill">{article.categoryName}</span><span className={`article-status ${article.status}`}>{statusLabels[article.status]}</span><span>{dateLabel(article.publishedAt || article.updatedAt)}</span><div className="article-row-actions"><button className={article.landingFeaturedRank > 0 ? "featured" : ""} onClick={() => void props.toggleLandingFeature(article)} disabled={props.saving || article.status !== "published"} title={article.status !== "published" ? "공개된 콘텐츠만 메인에 노출할 수 있습니다." : undefined}><Star/>{article.landingFeaturedRank > 0 ? `대표 ${article.landingFeaturedRank}` : "대표"}</button><button onClick={() => void props.quickUpdate(article, { status: article.status === "published" ? "hidden" : "published" }, article.status === "published" ? "콘텐츠를 숨겼습니다." : "콘텐츠를 공개했습니다.")}>{article.status === "published" ? "숨김" : "공개"}</button><button onClick={() => props.openEdit(article)}><Pencil/>수정</button><button className="danger" onClick={() => props.removeArticle(article)}><Trash2/>삭제</button></div></article>)}{props.visible.length === 0 && <div className="article-admin-empty"><FileText/><strong>표시할 콘텐츠가 없습니다.</strong><p>새 콘텐츠를 작성하거나 검색 조건을 바꿔보세요.</p></div>}</div>
    </section>
  </div>;
}

function ArticleEditor({ draft, setDraft, categories, saving, onBack, onSave, setError }: { draft: Article; setDraft: (article: Article) => void; categories: ArticleCategory[]; saving: boolean; onBack: () => void; onSave: () => void; setError: (value: string) => void }) {
  const update = <K extends keyof Article>(key: K, value: Article[K]) => setDraft({ ...draft, [key]: value });
  const updateBlock = (id: string, changes: Partial<ArticleBlock>) => update("blocks", draft.blocks.map((block) => block.id === id ? { ...block, ...changes } : block));
  const addBlock = (type: ArticleBlockType) => update("blocks", [...draft.blocks, { id: crypto.randomUUID(), type, text: "" }]);
  const move = (index: number, offset: number) => { const target = index + offset; if (target < 0 || target >= draft.blocks.length) return; const next = [...draft.blocks]; [next[index], next[target]] = [next[target], next[index]]; update("blocks", next); };
  const uploadCover = async (file?: File) => { if (!file) return; setError(""); try { const image = await uploadImage(file); setDraft({ ...draft, coverImagePath: image.path, coverImageUrl: image.url, coverImageAlt: draft.coverImageAlt || draft.title }); } catch (reason) { setError(reason instanceof Error ? reason.message : "이미지를 업로드하지 못했습니다."); } };
  const uploadBlockImage = async (block: ArticleBlock, file?: File) => { if (!file) return; setError(""); try { const image = await uploadImage(file); updateBlock(block.id, { imagePath: image.path, imageUrl: image.url }); } catch (reason) { setError(reason instanceof Error ? reason.message : "이미지를 업로드하지 못했습니다."); } };
  const uploadResource = async (file?: File) => { if (!file) return; setError(""); try { const form = new FormData(); form.append("file", file); const attachment = await requestJson<Article["attachments"][number]>("/api/admin/articles/resource", { method: "POST", body: form }); setDraft({ ...draft, attachments: [...draft.attachments, attachment] }); } catch (reason) { setError(reason instanceof Error ? reason.message : "관련 자료를 업로드하지 못했습니다."); } };
  return <div className="article-editor-screen"><button className="article-editor-back" onClick={onBack}><ArrowLeft/>블로그 목록</button><div className="article-editor-heading"><div><span>BLOG CONTENT</span><h2>{draft.id ? "콘텐츠 수정" : "새 콘텐츠 작성"}</h2></div><span>{draft.id ? "저장된 콘텐츠를 수정하고 다시 발행합니다." : "칼럼 또는 YouTube 영상을 선택해 등록하세요."}</span></div><div className="article-editor-layout"><main className="admin-panel article-editor-main"><div className="article-content-type"><button className={draft.contentType === "column" ? "active" : ""} onClick={() => update("contentType", "column")}><FileText/><span><strong>칼럼</strong><small>본문 블록으로 실무 글 작성</small></span></button><button className={draft.contentType === "youtube" ? "active" : ""} onClick={() => update("contentType", "youtube")}><Video/><span><strong>YouTube 영상</strong><small>영상 링크와 설명 등록</small></span></button></div>{draft.contentType === "youtube" && <label className="article-video-url"><span>YouTube URL <small>일반 주소 또는 공유 주소</small></span><input type="url" value={draft.videoUrl} onChange={(event) => update("videoUrl", event.target.value)} placeholder="https://www.youtube.com/watch?v=..."/></label>}<label className="article-title-field"><span>제목</span><input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value, slug: draft.slug || slugify(event.target.value) })} placeholder="콘텐츠 제목을 입력하세요"/></label><label><span>요약 <small>목록 카드에 노출</small></span><textarea value={draft.summary} onChange={(event) => update("summary", event.target.value)} placeholder="핵심 내용을 한두 문장으로 요약하세요"/></label><div className="article-blocks-label"><span>{draft.contentType === "youtube" ? "영상 설명" : "본문"}</span><small>{draft.contentType === "youtube" ? "영상 아래에 함께 보여줄 설명이나 핵심 내용을 작성합니다." : "블록을 섞어 글을 구성하고 화살표로 순서를 바꿀 수 있습니다."}</small></div><div className="article-block-list">{draft.blocks.map((block, index) => <section className="article-block-editor" key={block.id}><header><GripVertical/><select value={block.type} onChange={(event) => updateBlock(block.id, { type: event.target.value as ArticleBlockType })}>{Object.entries(blockLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select><div><button onClick={() => move(index, -1)} disabled={index === 0} aria-label="위로 이동"><ArrowUp/></button><button onClick={() => move(index, 1)} disabled={index === draft.blocks.length - 1} aria-label="아래로 이동"><ArrowDown/></button><button onClick={() => update("blocks", draft.blocks.filter((item) => item.id !== block.id))} aria-label="블록 삭제"><Trash2/></button></div></header>{block.type === "image" ? <div className="article-block-image"><div className={block.imageUrl ? "has-image" : ""} style={block.imageUrl ? { backgroundImage: `url(${block.imageUrl})` } : undefined}>{!block.imageUrl && <><FileImage/><strong>본문 이미지를 선택하세요</strong></>}</div><label><Upload/>이미지 선택<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void uploadBlockImage(block, event.target.files?.[0])}/></label><input value={block.alt || ""} onChange={(event) => updateBlock(block.id, { alt: event.target.value })} placeholder="이미지 설명(접근성)"/><input value={block.text} onChange={(event) => updateBlock(block.id, { text: event.target.value })} placeholder="이미지 캡션(선택)"/></div> : <textarea value={block.text} onChange={(event) => updateBlock(block.id, { text: event.target.value })} placeholder={block.type === "list" ? "항목을 줄바꿈으로 입력하세요" : block.type === "heading" ? "소제목을 입력하세요" : block.type === "quote" ? "강조할 문장을 입력하세요" : "문단 내용을 입력하세요"}/>}<footer>{Object.entries(blockLabels).map(([type, label]) => <button key={type} onClick={() => addBlock(type as ArticleBlockType)}><Plus/>{label}</button>)}</footer></section>)}</div></main><aside className="article-editor-side"><section className="admin-panel"><h3><Settings2/>발행 설정</h3><label><span>카테고리</span><select value={draft.categoryId} onChange={(event) => update("categoryId", event.target.value)}><option value="">미분류</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label><span>상태</span><select value={draft.status} onChange={(event) => update("status", event.target.value as Article["status"])}><option value="draft">임시저장</option><option value="published">공개</option><option value="scheduled">예약 발행</option><option value="hidden">숨김</option></select></label>{draft.status === "scheduled" && <label><span>예약 일시</span><input type="datetime-local" value={draft.scheduledAt ? draft.scheduledAt.slice(0, 16) : ""} onChange={(event) => update("scheduledAt", event.target.value)}/></label>}<label className="article-check"><input type="checkbox" checked={draft.isFeatured} onChange={(event) => update("isFeatured", event.target.checked)}/><span>대표 콘텐츠로 지정<small>블로그 화면 상단에 노출</small></span></label></section><section className="admin-panel"><h3><ImagePlus/>대표 이미지</h3><div className={draft.coverImageUrl ? "article-cover-preview has-image" : "article-cover-preview"} style={draft.coverImageUrl ? { backgroundImage: `url(${draft.coverImageUrl})` } : undefined}>{!draft.coverImageUrl && <><FileImage/><span>목록 카드와 상세 상단에 사용됩니다.</span></>}</div><label className="article-upload-button"><Upload/>이미지 선택<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void uploadCover(event.target.files?.[0])}/></label><input value={draft.coverImageAlt} onChange={(event) => update("coverImageAlt", event.target.value)} placeholder="대표 이미지 설명"/></section>
<section className="admin-panel article-resource-card"><h3><Paperclip/>관련 자료</h3><p>독자가 내려받을 워크북·체크리스트·템플릿을 등록합니다.</p><div className="article-resource-admin-list">{draft.attachments.map((item) => <article key={item.id}><FileText/><span><strong>{item.name}</strong><small>{item.size ? `${(item.size / 1_000_000).toFixed(item.size >= 1_000_000 ? 1 : 2)}MB` : "파일"}</small></span><a href={item.url} download aria-label={`${item.name} 다운로드`}><Download/></a><button type="button" onClick={() => update("attachments", draft.attachments.filter((attachment) => attachment.id !== item.id))} aria-label={`${item.name} 제거`}><Trash2/></button></article>)}</div><label className="article-upload-button"><Upload/>관련 자료 추가<input type="file" accept=".pdf,.zip,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt" onChange={(event) => { void uploadResource(event.target.files?.[0]); event.currentTarget.value = ""; }}/></label><small className="article-resource-help">PDF·ZIP·문서·엑셀·PPT, 파일당 20MB 이하</small></section><section className="admin-panel article-seo-card"><h3>검색·공유 설정</h3><label><span>URL 주소</span><input value={draft.slug} onChange={(event) => update("slug", slugify(event.target.value))} placeholder="article-url"/></label><label><span>SEO 제목</span><input value={draft.seoTitle} onChange={(event) => update("seoTitle", event.target.value)} placeholder={draft.title || "검색 결과 제목"}/></label><label><span>SEO 설명</span><textarea value={draft.seoDescription} onChange={(event) => update("seoDescription", event.target.value)} placeholder={draft.summary || "검색 결과 설명"}/></label></section><div className="article-publish-actions"><button onClick={onBack}>취소</button><button className="admin-primary" onClick={onSave} disabled={saving}><Save/>{saving ? "저장 중..." : draft.status === "published" ? "저장하고 공개" : "저장"}</button></div></aside></div></div>;
}

function FreeCourseEditor({ value, saving, onSave }: { value: FreeCourseSettings; saving: boolean; onSave: (value: FreeCourseSettings) => void }) {
  const [draft, setDraft] = useState(() => structuredClone(value));
  const updateLesson = (index: number, changes: Partial<FreeCourseSettings["lessons"][number]>) => setDraft({ ...draft, lessons: draft.lessons.map((lesson, lessonIndex) => lessonIndex === index ? { ...lesson, ...changes } : lesson) });
  return <div className="free-course-admin"><section className="admin-panel"><div className="article-admin-section-head"><div><span>01</span><div><h2>회원가입 무료강의</h2><p>아티클 화면 최상단에서 비회원 가입을 유도하고, 회원에게 3강을 바로 공개합니다.</p></div></div><strong>3개 강의</strong></div><div className="free-course-fields"><label><span>상단 영문 라벨</span><input value={draft.eyebrow} onChange={(event) => setDraft({ ...draft, eyebrow: event.target.value })}/></label><label><span>메인 제목</span><input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })}/></label><label className="full"><span>설명</span><textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })}/></label><label className="full"><span>회원가입 안내 문구</span><input value={draft.signupCopy} onChange={(event) => setDraft({ ...draft, signupCopy: event.target.value })}/></label></div></section><section className="admin-panel"><div className="article-admin-section-head"><div><span>02</span><div><h2>무료강의 3강 설정</h2><p>YouTube 일반 주소 또는 공유 주소를 입력하면 개인정보 보호 모드로 재생됩니다.</p></div></div></div><div className="free-course-lesson-admin">{draft.lessons.map((lesson, index) => <article key={lesson.id}><span>{String(index + 1).padStart(2, "0")}</span><label><small>강의 제목</small><input value={lesson.title} onChange={(event) => updateLesson(index, { title: event.target.value })}/></label><label><small>YouTube URL</small><input value={lesson.videoUrl} onChange={(event) => updateLesson(index, { videoUrl: event.target.value })} placeholder="https://youtu.be/..."/></label><ChevronRight/></article>)}</div></section><div className="free-course-save"><span>저장 즉시 고객 아티클 화면에 반영됩니다.</span><button className="admin-primary" onClick={() => onSave(draft)} disabled={saving}><Save/>{saving ? "저장 중..." : "무료강의 설정 저장"}</button></div></div>;
}
