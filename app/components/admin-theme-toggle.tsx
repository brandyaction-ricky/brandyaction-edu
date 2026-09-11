"use client";

import { useEffect, useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";

type AdminTheme = "dark" | "light";
const THEME_KEY = "brandy-admin-theme";
const THEME_EVENT = "brandy-admin-theme-change";

function subscribeTheme(callback: () => void) {
  window.addEventListener(THEME_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(THEME_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

function getTheme(): AdminTheme {
  try { return window.localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light"; }
  catch { return "light"; }
}

export function AdminThemeToggle() {
  const theme = useSyncExternalStore(subscribeTheme, getTheme, () => "light");

  useEffect(() => {
    document.documentElement.dataset.adminTheme = theme;
  }, [theme]);

  const toggle = () => {
    const next: AdminTheme = theme === "dark" ? "light" : "dark";
    try { window.localStorage.setItem(THEME_KEY, next); } catch { /* Storage may be blocked. */ }
    window.dispatchEvent(new Event(THEME_EVENT));
  };

  return <button className="admin-theme-toggle" type="button" onClick={toggle} aria-label={`${theme === "dark" ? "라이트" : "다크"} 모드로 전환`} title={`${theme === "dark" ? "라이트" : "다크"} 모드`}>
    {theme === "dark" ? <Sun aria-hidden="true"/> : <Moon aria-hidden="true"/>}
  </button>;
}
