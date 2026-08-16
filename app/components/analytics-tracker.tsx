"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";

function classify(path: string) {
  if (path === "/order-complete") return "order_complete";
  if (path === "/checkout") return "checkout_view";
  if (/^\/articles\/[^/]+/.test(path)) return "article_view";
  if (/^\/classes\/[^/]+/.test(path)) return "class_view";
  return "page_view";
}

function send(eventName: string, path: string, targetPath = "", elementLabel = "", metadata: Record<string, string> = {}) {
  const payload = JSON.stringify({ eventName, path, targetPath, elementLabel, metadata });
  if (navigator.sendBeacon) navigator.sendBeacon("/api/analytics/event", new Blob([payload], { type: "application/json" }));
  else void fetch("/api/analytics/event", { method: "POST", headers: { "Content-Type": "application/json" }, body: payload, keepalive: true });
}

export function AnalyticsTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  useEffect(() => {
    if (pathname.startsWith("/admin")) return;
    const query = searchParams.toString();
    const path = `${pathname}${query ? `?${query}` : ""}`;
    const params = new URLSearchParams(query);
    send(classify(pathname), path, "", "", {
      source: params.get("utm_source") || (document.referrer ? new URL(document.referrer).hostname : "direct"),
      medium: params.get("utm_medium") || "",
      campaign: params.get("utm_campaign") || "",
      referrer: document.referrer,
    });
  }, [pathname, searchParams]);
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const element = (event.target as Element | null)?.closest("a,button") as HTMLAnchorElement | HTMLButtonElement | null;
      if (!element || pathname.startsWith("/admin")) return;
      const href = element instanceof HTMLAnchorElement ? element.getAttribute("href") || "" : "";
      const label = (element.getAttribute("aria-label") || element.textContent || "").replace(/\s+/g, " ").trim().slice(0, 160);
      let name = "click";
      if (href.startsWith("/articles")) name = "article_click";
      if (href.startsWith("/checkout") || /신청|예약|결제/.test(label)) name = "application_click";
      send(name, `${location.pathname}${location.search}`, href, label, { tag: element.tagName.toLowerCase() });
    };
    document.addEventListener("click", onClick, { capture: true });
    return () => document.removeEventListener("click", onClick, { capture: true });
  }, [pathname]);
  return null;
}
