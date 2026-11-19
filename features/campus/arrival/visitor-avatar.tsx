'use client';

import {useEffect, useId, useRef, useState} from 'react';
import {Check, Shirt, X} from 'lucide-react';
import {VISITOR_AVATARS, type VisitorAvatarId} from './visitor-avatar-options';
import s from './visitor-avatar.module.css';

type Props = {
  value: VisitorAvatarId;
  onChange: (value: VisitorAvatarId) => void;
  persistent: boolean;
  onOpenChange?: (open: boolean) => void;
};

export function VisitorAvatar({value, onChange, persistent, onOpenChange}: Props) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    if (!open) return;
    dialog.current?.showModal();
    dialog.current?.querySelector<HTMLInputElement>('input:checked')?.focus({preventScroll:true});
  }, [open]);

  function show() {
    setDraft(value);
    setOpen(true);
    onOpenChange?.(true);
  }

  return <>
    <button type="button" className={s.trigger} ref={trigger} aria-haspopup="dialog" aria-expanded={open} onClick={show}>
      <Shirt size={17} aria-hidden="true"/>내 캐릭터
    </button>
    <dialog ref={dialog} className={s.dialog} aria-labelledby={id} onClose={() => {
      setOpen(false);
      onOpenChange?.(false);
      trigger.current?.focus({preventScroll:true});
    }}>
      {open && <>
        <header className={s.header}>
          <h2 id={id}>내 캐릭터 고르기</h2>
          <button type="button" className={s.close} aria-label="캐릭터 선택 닫기" onClick={() => dialog.current?.close()}><X size={20} aria-hidden="true"/></button>
        </header>
        <fieldset className={s.options}>
          <legend>캐릭터 선택</legend>
          {VISITOR_AVATARS.map(avatar => <label key={avatar.id} className={s.card}>
            <input type="radio" name={id} value={avatar.id} checked={avatar.id === draft} onChange={() => setDraft(avatar.id)}/>
            <span className={s.portrait} style={{backgroundColor:avatar.swatch}}>
              {/* eslint-disable-next-line @next/next/no-img-element -- Small transparent renders of the very same campus models. */}
              <img alt="" src={'/campus/arrival/avatars/'+avatar.id+'.webp'} width={238} height={208}/>
            </span>
            <span className={s.name}>{avatar.label}</span>
            {avatar.id === draft && <span className={s.mark} aria-hidden="true"><Check size={14}/></span>}
          </label>)}
        </fieldset>
        <p className={s.note}>{persistent ? '이 기기의 같은 브라우저로 돌아오면 고른 캐릭터로 입장해요.' : '이번 체험에서 고른 캐릭터로 걸어요.'}</p>
        <footer className={s.footer}><button type="button" className={s.apply} onClick={() => {
          onChange(draft);
          dialog.current?.close();
        }}>이 캐릭터로 걷기</button></footer>
      </>}
    </dialog>
  </>;
}
