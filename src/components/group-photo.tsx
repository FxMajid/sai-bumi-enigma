"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";

const leaseSchema = z.object({ url: z.url(), expiresAt: z.iso.datetime({ offset: true }) });
export function GroupPhoto({ groupId, demoUrl, isDemo, label }: { groupId: string; demoUrl: string; isDemo: boolean; label: string }) {
  const [lease, setLease] = useState<{ url: string; expiresAt: string } | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const failedRefresh = useRef(false);
  const imageError = useCallback(() => {
    if (!failedRefresh.current && !isDemo) { failedRefresh.current = true; setAttempt((value) => value + 1); }
    else setError(true);
  }, [isDemo]);
  useEffect(() => {
    if (isDemo) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;
    async function load() {
      if (!active || document.hidden) return;
      if (timer) clearTimeout(timer);
      controller?.abort(); const requestController = new AbortController(); controller = requestController;
      try {
        const response = await fetch(`/api/groups/${groupId}/photo`, { cache: "no-store", signal: requestController.signal });
        if (!response.ok) throw new Error("photo unavailable");
        const data = leaseSchema.parse(await response.json());
        if (!active) return;
        setLease(data); setError(false);
        timer = setTimeout(() => void load(), Math.max(1000, Date.parse(data.expiresAt) - Date.now() - 10000));
      } catch {
        if (active && !requestController.signal.aborted) setError(true);
      }
    }
    function visibility() {
      if (document.hidden) { if (timer) clearTimeout(timer); controller?.abort(); }
      else void load();
    }
    void load(); document.addEventListener("visibilitychange", visibility);
    return () => { active = false; if (timer) clearTimeout(timer); controller?.abort(); document.removeEventListener("visibilitychange", visibility); };
  }, [groupId, isDemo, attempt]);
  if (error) return <div className="empty-panel" role="alert"><p>Foto kelompok belum dapat dimuat.</p><button type="button" className="button button-outline" onClick={() => { failedRefresh.current = false; setError(false); setAttempt((value) => value + 1); }}>Muat ulang foto</button></div>;
  if (!isDemo && !lease) return <div className="empty-panel" role="status">Memuat foto kelompok…</div>;
  return <Image src={isDemo ? demoUrl : lease!.url} alt={label} width={800} height={450} unoptimized referrerPolicy="no-referrer" onError={imageError} />;
}
