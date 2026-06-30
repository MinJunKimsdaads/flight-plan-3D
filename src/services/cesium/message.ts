// 부모(flight-plan)에서 postMessage 로 오는 항공기 메시지 파싱/검증.
// 계약: { payload: { type:'flight', lon, lat, alt, heading, layer?, weather? } }

export interface FlightMessage {
  type: 'flight';
  lon: number;
  lat: number;
  alt: number;
  heading: number;
  /** 부모가 보낸 Cesium 베이스맵 설정(선택) — 그대로 통과 */
  layer?: unknown;
}

export function parseFlightMessage(data: unknown): FlightMessage | null {
  if (!data || typeof data !== 'object') return null;
  const payload = (data as { payload?: unknown }).payload;
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as Record<string, unknown>;
  if (p.type !== 'flight') return null;
  const { lon, lat, alt, heading } = p;
  if ([lon, lat, alt, heading].some((v) => typeof v !== 'number' || !Number.isFinite(v as number))) return null;
  return {
    type: 'flight',
    lon: lon as number,
    lat: lat as number,
    alt: alt as number,
    heading: heading as number,
    layer: p.layer,
  };
}
