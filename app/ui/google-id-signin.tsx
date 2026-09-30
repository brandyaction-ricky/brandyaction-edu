"use client";

import { googleIdDestination } from "@/lib/google-id-login";
import { createClient } from "@/lib/supabase/client";
import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";

type CredentialResponse = { credential?: string };
type GoogleId = {
  initialize: (options: {
    client_id: string;
    callback: (response: CredentialResponse) => void;
    nonce: string;
    auto_select: boolean;
  }) => void;
  renderButton: (
    element: HTMLElement,
    options: {
      theme: "outline";
      size: "large";
      type: "standard";
      text: "continue_with";
      shape: "rectangular";
      width: number;
      locale: "ko";
    },
  ) => void;
};

declare global {
  interface Window {
    google?: { accounts: { id: GoogleId } };
  }
}

async function noncePair() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const nonce = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(nonce));
  const hashed = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return { nonce, hashed };
}

export function GoogleIdSignIn({
  clientId,
  next,
  disabled,
  fallback,
}: {
  clientId: string;
  next: string;
  disabled: boolean;
  fallback: () => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const observer = useRef<ResizeObserver | null>(null);
  const buttonWidth = useRef(0);
  const [ready, setReady] = useState(false);
  const [showFallback, setShowFallback] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const initialize = useCallback(async () => {
    const google = window.google?.accounts.id;
    if (!google || !container.current) return;
    try {
      const { nonce, hashed } = await noncePair();
      if (!container.current) return;
      google.initialize({
        client_id: clientId,
        nonce: hashed,
        auto_select: false,
        callback: async ({ credential }) => {
          if (!credential) {
            setNotice("구글 로그인을 완료하지 못했습니다. 다시 시도해 주세요.");
            return;
          }
          setBusy(true);
          setNotice("");
          try {
            const { data, error } = await createClient().auth.signInWithIdToken({
              provider: "google",
              token: credential,
              nonce,
            });
            if (error || !data.user) throw error || new Error("No user returned");
            window.location.assign(googleIdDestination(data.user.user_metadata || {}, next));
          } catch {
            setNotice("구글 로그인을 완료하지 못했습니다. 다시 시도해 주세요.");
            setBusy(false);
          }
        },
      });
      const render = () => {
        if (!container.current) return;
        const width = Math.min(400, Math.max(200, container.current.clientWidth));
        if (buttonWidth.current === width) return;
        buttonWidth.current = width;
        container.current.replaceChildren();
        google.renderButton(container.current, {
          theme: "outline",
          size: "large",
          type: "standard",
          text: "continue_with",
          shape: "rectangular",
          width,
          locale: "ko",
        });
      };
      render();
      setReady(true);
      observer.current?.disconnect();
      observer.current = new ResizeObserver(render);
      observer.current.observe(container.current);
    } catch {
      setShowFallback(true);
    }
  }, [clientId, next]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!ready) setShowFallback(true);
    }, 6000);
    return () => clearTimeout(timer);
  }, [ready]);

  useEffect(() => () => observer.current?.disconnect(), []);

  return (
    <div className="google-id-signin" aria-busy={busy || disabled}>
      <Script
        src="https://accounts.google.com/gsi/client"
        strategy="afterInteractive"
        onReady={() => void initialize()}
        onError={() => setShowFallback(true)}
      />
      <div ref={container} className={disabled || busy ? "google-id-button disabled" : "google-id-button"} />
      {!ready && !showFallback && <div className="google-id-loading" role="status">Google 로그인 준비 중…</div>}
      {showFallback && !ready && (
        <button className="btn full" disabled={disabled || busy} onClick={fallback}>
          <span className="social-mark">G</span>Google로 계속하기
        </button>
      )}
      {notice && (
        <>
          <p className="form-error" role="alert">{notice}</p>
          <button className="btn full" disabled={disabled || busy} onClick={fallback}>
            다른 방법으로 구글 로그인
          </button>
        </>
      )}
    </div>
  );
}
