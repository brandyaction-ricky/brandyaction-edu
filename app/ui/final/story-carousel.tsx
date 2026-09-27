"use client";

import type { Row } from "@/lib/platform";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Story } from "./primitives";
import "../story-carousel.css";

export function StoryCarousel({ stories }: { stories: Row[] }) {
  const track = useRef<HTMLDivElement>(null);
  const paused = useRef(false);
  const [current, setCurrent] = useState(0);
  const [canScroll, setCanScroll] = useState(false);

  useEffect(() => {
    const element = track.current;
    if (!element) return;
    const measure = () => setCanScroll(element.scrollWidth > element.clientWidth + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [stories.length]);

  function goTo(index: number) {
    const element = track.current;
    if (!element) return;
    const items = element.querySelectorAll<HTMLElement>(".story-slide");
    const next = (index + items.length) % items.length;
    element.scrollTo({ left: items[next].offsetLeft - items[0].offsetLeft, behavior: "smooth" });
    setCurrent(next);
  }

  function advance(direction: number) {
    const element = track.current;
    if (!element) return;
    const atEnd = element.scrollLeft >= element.scrollWidth - element.clientWidth - 2;
    if (direction > 0 && atEnd) goTo(0);
    else if (direction < 0 && element.scrollLeft <= 2) goTo(stories.length - 1);
    else goTo(current + direction);
  }

  useEffect(() => {
    if (!canScroll || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => {
      const element = track.current;
      if (!element || paused.current || document.hidden) return;
      const items = element.querySelectorAll<HTMLElement>(".story-slide");
      const atEnd = element.scrollLeft >= element.scrollWidth - element.clientWidth - 2;
      const currentItem = [...items].findIndex((item) => item.offsetLeft - items[0].offsetLeft > element.scrollLeft + 2);
      element.scrollTo({ left: atEnd || currentItem < 0 ? 0 : items[currentItem].offsetLeft - items[0].offsetLeft, behavior: "smooth" });
    }, 6000);
    return () => window.clearInterval(timer);
  }, [canScroll, stories.length]);

  function syncPosition() {
    const element = track.current;
    if (!element) return;
    const items = [...element.querySelectorAll<HTMLElement>(".story-slide")];
    const index = items.reduce((closest, item, i) =>
      Math.abs(item.offsetLeft - items[0].offsetLeft - element.scrollLeft) <
      Math.abs(items[closest].offsetLeft - items[0].offsetLeft - element.scrollLeft) ? i : closest, 0);
    setCurrent(index);
  }

  return (
    <div className="story-carousel" onMouseEnter={() => { paused.current = true; }} onMouseLeave={() => { paused.current = false; }} onFocusCapture={() => { paused.current = true; }} onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) paused.current = false; }}>
      <div className="story-carousel-track" data-count={stories.length} ref={track} onScroll={syncPosition} role="region" aria-label="고객 이야기 목록" tabIndex={0}>
        {stories.map((story) => <div className="story-slide" key={story.id}><Story story={story} /></div>)}
      </div>
      {canScroll && <div className="story-carousel-footer">
        <span aria-live="polite">{current + 1} / {stories.length}</span>
        <div className="story-carousel-controls">
          <button type="button" aria-label="이전 고객 이야기" onClick={() => advance(-1)}><ArrowLeft /></button>
          <button type="button" aria-label="다음 고객 이야기" onClick={() => advance(1)}><ArrowRight /></button>
        </div>
      </div>}
    </div>
  );
}
