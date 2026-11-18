import {useEffect, useId, useRef} from 'react';
import {ArrowLeft} from 'lucide-react';
import type {CanonPhase, SpyPhase} from './model';
import {SpyStation} from './spy-station';
import {ContentStation} from './content-station';
import {CanonStation} from './canon-station';
import monitor from './office-demo.module.css';

type Props = {
  station: 2 | 3 | 4;
  spyPhase: SpyPhase;
  onSpyAdvance: (phase: SpyPhase) => void;
  canonPhase: CanonPhase;
  onCanonAdvance: (phase: CanonPhase) => void;
  onComplete: () => void;
  onClose: () => void;
  revisit?: boolean;
};

const locations = {2: '경쟁사 스파이', 3: '콘텐츠 담당자', 4: '정본 · 회사 업무 기준'};

export function CorridorPanel({station, spyPhase, onSpyAdvance, canonPhase, onCanonAdvance, onComplete, onClose, revisit = false}: Props) {
  const labelId = useId();
  const label = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const frame = requestAnimationFrame(() => label.current?.focus({preventScroll: true}));
    return () => cancelAnimationFrame(frame);
  }, [station]);

  return <section className={monitor.monitor} aria-labelledby={labelId}>
    <header className={monitor.header}>
      <span id={labelId} ref={label} tabIndex={-1}>{locations[station]}</span>
      <button type="button" className={monitor.leave} onClick={onClose}><ArrowLeft size={15} aria-hidden="true"/>{revisit ? '라이브 홀로 돌아가기' : '복도로 돌아가기'}</button>
    </header>
    {station === 2 && <SpyStation phase={spyPhase} onAdvance={onSpyAdvance} onComplete={onComplete}/>}
    {station === 3 && <div className={monitor.body}><ContentStation onComplete={onComplete} revisit={revisit}/></div>}
    {station === 4 && <CanonStation phase={canonPhase} onAdvance={onCanonAdvance} onHall={onComplete}/>}
  </section>;
}
