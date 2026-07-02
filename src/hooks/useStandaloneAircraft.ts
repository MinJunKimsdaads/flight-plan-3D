import { useEffect, useState } from 'react';
import { fetchLatestAircraft } from '@/api/query';
import type { Aircraft } from '@/services/aircraft';

const POLL_MS = 120_000;

/** 직접 접속(비-iframe)일 때만 자체 데이터 폴링. iframe 자식이면 null(부모 postMessage 사용). */
export function useStandaloneAircraft(): Aircraft[] | null {
  const [data, setData] = useState<Aircraft[] | null>(null);
  useEffect(() => {
    if (window.top !== window.self) return; // iframe 자식 → 폴링 안 함
    let alive = true;
    const load = async () => {
      const ac = await fetchLatestAircraft();
      if (alive) setData(ac);
    };
    load();
    const id = window.setInterval(load, POLL_MS);
    return () => { alive = false; window.clearInterval(id); };
  }, []);
  return data;
}
