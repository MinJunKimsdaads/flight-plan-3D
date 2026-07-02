// OpenSky 상태벡터 row → Aircraft. 스키마는 길이로 판별(fat≥17 / slim-v2=12 / slim-v1=9).
export interface Aircraft {
  icao24: string;
  callsign: string | null;
  origin_country: string | null;
  lon: number;
  lat: number;
  alt: number;            // geo_altitude ?? baro_altitude (m)
  heading: number;        // true_track (deg)
  velocity: number | null;
  on_ground: boolean | null;
  baro_altitude: number | null;
  geo_altitude: number | null;
  vertical_rate: number | null;
  time_position: number | null;
  last_contact: number | null;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function parseRow(r: unknown): Aircraft | null {
  if (!Array.isArray(r)) return null;
  const len = r.length;
  let icao24: unknown, callsign: unknown, origin_country: unknown;
  let time_position: unknown = null, last_contact: unknown = null;
  let lon: unknown, lat: unknown;
  let baro_altitude: unknown = null, on_ground: unknown = null, velocity: unknown = null;
  let true_track: unknown = 0, vertical_rate: unknown = null, geo_altitude: unknown = null;

  if (len >= 17) {
    icao24 = r[0]; callsign = r[1]; origin_country = r[2]; time_position = r[3]; last_contact = r[4];
    lon = r[5]; lat = r[6]; baro_altitude = r[7]; on_ground = r[8]; velocity = r[9]; true_track = r[10];
    vertical_rate = r[11]; geo_altitude = r[13];
  } else if (len === 12) {
    icao24 = r[0]; callsign = r[1]; origin_country = r[2]; time_position = r[3]; last_contact = r[4];
    lon = r[5]; lat = r[6]; baro_altitude = r[7]; on_ground = r[8]; velocity = r[9]; true_track = r[10]; geo_altitude = r[11];
  } else if (len === 9) {
    icao24 = r[0]; callsign = r[1]; origin_country = r[2];
    lon = r[3]; lat = r[4]; on_ground = r[5]; velocity = r[6]; true_track = r[7]; geo_altitude = r[8];
  } else {
    return null;
  }
  if (typeof icao24 !== 'string' || !icao24) return null;
  if (typeof lon !== 'number' || typeof lat !== 'number') return null;

  const geo = num(geo_altitude);
  const baro = num(baro_altitude);
  return {
    icao24,
    callsign: typeof callsign === 'string' ? callsign.trim() || null : null,
    origin_country: typeof origin_country === 'string' ? origin_country : null,
    lon, lat,
    alt: geo ?? baro ?? 0,
    heading: num(true_track) ?? 0,
    velocity: num(velocity),
    on_ground: typeof on_ground === 'boolean' ? on_ground : null,
    baro_altitude: baro,
    geo_altitude: geo,
    vertical_rate: num(vertical_rate),
    time_position: num(time_position),
    last_contact: num(last_contact),
  };
}
