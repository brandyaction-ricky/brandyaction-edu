"use client";

import { useEffect, useMemo, useState } from "react";

const baseTabs = [
  { id: "overview", label: "클래스 소개" },
  { id: "curriculum", label: "커리큘럼" },
  { id: "benefit", label: "제공 혜택" },
  { id: "review", label: "수강 후기" },
  { id: "faq", label: "FAQ" },
] as const;

type TabId = (typeof baseTabs)[number]["id"] | "free-resources";

export function DetailTabs({ resources = false, compact = false }: { resources?: boolean; compact?: boolean }) {
  const tabs = useMemo(() => resources ? [...baseTabs.slice(0, 2), { id: "free-resources" as const, label: "무료 자료" }, ...baseTabs.slice(2)] : baseTabs, [resources]);
  const [activeTab, setActiveTab] = useState<TabId>("overview");

  useEffect(() => {
    let frame = 0;

    const updateActiveTab = () => {
      const activationLine = 180;
      let nextTab: TabId = "overview";

      const isAtPageBottom =
        window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2;
      if (isAtPageBottom) {
        setActiveTab("faq");
        return;
      }

      for (const tab of tabs) {
        const section = document.getElementById(tab.id);
        if (section && section.getBoundingClientRect().top <= activationLine) {
          nextTab = tab.id;
        }
      }

      setActiveTab((current) => (current === nextTab ? current : nextTab));
    };

    const handleScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(updateActiveTab);
    };

    frame = requestAnimationFrame(updateActiveTab);
    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleScroll);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleScroll);
    };
  }, [tabs]);

  const selectTab = (event: React.MouseEvent<HTMLAnchorElement>, id: TabId) => {
    event.preventDefault();
    const section = document.getElementById(id);
    if (!section) return;

    setActiveTab(id);
    window.history.replaceState(null, "", `#${id}`);
    section.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <nav className="detail-tabs" aria-label="클래스 상세 메뉴">
      <div className="container">
        {tabs.map((tab) => (
          <a
            key={tab.id}
            href={`#${tab.id}`}
            className={activeTab === tab.id ? "active" : ""}
            aria-current={activeTab === tab.id ? "location" : undefined}
            onClick={(event) => selectTab(event, tab.id)}
          >
            {compact && tab.id === "overview" ? "소개" : compact && tab.id === "curriculum" ? "콘텐츠" : tab.label}
          </a>
        ))}
      </div>
    </nav>
  );
}
