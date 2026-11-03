'use client';

import { RotateCw } from 'lucide-react';
import './mobile-refresh.css';

export function MobileRefresh() {
  return <button type="button" className="mobile-page-refresh" onClick={() => window.location.reload()} title="현재 화면 새로고침">
    <RotateCw size={20} strokeWidth={1.75} aria-hidden="true" />
    <span>새로고침</span>
  </button>;
}
