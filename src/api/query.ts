import { parseRow, type Aircraft } from '@/services/aircraft';

const CONTENTS = 'https://api.github.com/repos/MinJunKimsdaads/flight-data-repo/contents/data/flight';
const RAW = 'https://raw.githubusercontent.com/MinJunKimsdaads/flight-data-repo/main/data/flight';

// GitHub Contents API rate limit(60/h) 대비 파일 목록 캐시.
let cachedFile: { name: string; at: number } | null = null;
const FILE_TTL = 90_000;

async function latestFile(): Promise<string | null> {
  if (cachedFile && Date.now() - cachedFile.at < FILE_TTL) return cachedFile.name;
  try {
    const res = await fetch(CONTENTS);
    if (!res.ok) return cachedFile?.name ?? null;
    const list = await res.json();
    if (!Array.isArray(list)) return cachedFile?.name ?? null;
    const files = list
      .map((f: { name?: string }) => f?.name ?? '')
      .filter((n: string) => /^\d+\.json$/.test(n))
      .sort();
    const name = files[files.length - 1] ?? null;
    if (name) cachedFile = { name, at: Date.now() };
    return name;
  } catch {
    return cachedFile?.name ?? null;
  }
}

/** 최신 스냅샷을 가져와 Aircraft[] 로 파싱. */
export async function fetchLatestAircraft(): Promise<Aircraft[]> {
  const file = await latestFile();
  if (!file) return [];
  const res = await fetch(`${RAW}/${file}`);
  if (!res.ok) return [];
  const payload = await res.json();
  const states: unknown[] = payload && Array.isArray(payload.states)
    ? payload.states
    : Array.isArray(payload) ? payload : [];
  const out: Aircraft[] = [];
  for (const r of states) {
    const a = parseRow(r);
    if (a) out.push(a);
  }
  return out;
}
