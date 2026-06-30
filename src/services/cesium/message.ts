// 부모(flight-plan) postMessage 파싱/검증.
// 단일: { payload: { type:'flight', lon, lat, alt, heading, layer?, weather? } }
// 전체: { payload: { type:'fleet', aircraft: [{lon,lat,alt,heading}, ...] } }

export interface FlightMessage {
  type: 'flight';
  lon: number;
  lat: number;
  alt: number;
  heading: number;
  layer?: unknown;
}

export interface FleetAircraft {
  lon: number;
  lat: number;
  alt: number;
  heading: number;
}

export interface FleetMessage {
  type: 'fleet';
  aircraft: FleetAircraft[];
}

function payloadOf(data: unknown): Record<string, unknown> | null {
  if (!data || typeof data !== 'object') return null;
  const payload = (data as { payload?: unknown }).payload;
  if (!payload || typeof payload !== 'object') return null;
  return payload as Record<string, unknown>;
}

const num = (v: unknown, fallback = 0) =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;

export function parseFlightMessage(data: unknown): FlightMessage | null {
  const p = payloadOf(data);
  if (!p || p.type !== 'flight') return null;
  const { lon, lat, alt, heading } = p;
  if ([lon, lat, alt, heading].some((v) => typeof v !== 'number' || !Number.isFinite(v as number))) return null;
  return { type: 'flight', lon: lon as number, lat: lat as number, alt: alt as number, heading: heading as number, layer: p.layer };
}

export function parseFleetMessage(data: unknown): FleetMessage | null {
  const p = payloadOf(data);
  if (!p || p.type !== 'fleet' || !Array.isArray(p.aircraft)) return null;
  const aircraft: FleetAircraft[] = [];
  for (const item of p.aircraft) {
    if (!item || typeof item !== 'object') continue;
    const a = item as Record<string, unknown>;
    if (typeof a.lon === 'number' && typeof a.lat === 'number' && Number.isFinite(a.lon) && Number.isFinite(a.lat)) {
      aircraft.push({ lon: a.lon, lat: a.lat, alt: num(a.alt), heading: num(a.heading) });
    }
  }
  return { type: 'fleet', aircraft };
}
