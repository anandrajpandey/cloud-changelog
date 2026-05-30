"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const VISITOR_COOKIE = "cloud_changelog_visitor_id";
const SESSION_KEY = "cloud_changelog_session";
const SESSION_START_KEY = "cloud_changelog_session_start";

function getCookie(name: string) {
  if (typeof document === "undefined") return "";
  const match = document.cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : "";
}

function setCookie(name: string, value: string) {
  document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; path=/; max-age=31536000; samesite=strict`;
}

function getOrCreateVisitorId() {
  const existing = getCookie(VISITOR_COOKIE);
  if (existing) return existing;
  const id = crypto.randomUUID();
  setCookie(VISITOR_COOKIE, id);
  return id;
}

function getOrCreateSessionId() {
  const existing = sessionStorage.getItem(SESSION_KEY);
  if (existing) return existing;
  const id = crypto.randomUUID();
  sessionStorage.setItem(SESSION_KEY, id);
  return id;
}

async function postMetric(payload: Record<string, unknown>) {
  try {
    await fetch("/api/analytics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    });
  } catch {
    // Best effort only.
  }
}

export function AnalyticsTracker() {
  const pathname = usePathname();

  useEffect(() => {
    const visitorId = getOrCreateVisitorId();
    const sessionId = getOrCreateSessionId();
    const started = sessionStorage.getItem(SESSION_START_KEY);

    if (!started) {
      sessionStorage.setItem(SESSION_START_KEY, String(Date.now()));
      postMetric({
        eventType: "session_start",
        visitorId,
        sessionId,
        path: pathname,
      });
    }

    const flush = () => {
      const start = Number(sessionStorage.getItem(SESSION_START_KEY) || Date.now());
      const durationSeconds = Math.max(0, Math.round((Date.now() - start) / 1000));
      postMetric({
        eventType: "session_end",
        visitorId,
        sessionId,
        path: pathname,
        durationSeconds,
      });
    };

    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, [pathname]);

  return null;
}
