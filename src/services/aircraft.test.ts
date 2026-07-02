import { describe, it, expect } from 'vitest';
import { parseRow } from './aircraft';

describe('parseRow', () => {
  it('slim-v2(12) 파싱 + callsign trim', () => {
    const r = ['abc123', 'KAL123 ', 'Korea', 1700000000, 1700000005, 127.5, 37.5, 10000, false, 250, 90, 10500];
    expect(parseRow(r)).toMatchObject({
      icao24: 'abc123', callsign: 'KAL123', origin_country: 'Korea',
      lon: 127.5, lat: 37.5, alt: 10500, heading: 90, velocity: 250, on_ground: false,
    });
  });
  it('fat(17+) 파싱 + geo_altitude 우선', () => {
    const r = ['x', 'CS', 'US', 1, 2, 10, 20, 5000, true, 100, 45, 3, null, 5200, '7000', false, 0];
    const a = parseRow(r);
    expect(a?.alt).toBe(5200);
    expect(a?.heading).toBe(45);
    expect(a?.lon).toBe(10);
  });
  it('slim-v1(9) 파싱', () => {
    expect(parseRow(['y', 'C', 'KR', 1, 2, false, 200, 180, 8000])).toMatchObject({
      icao24: 'y', lon: 1, lat: 2, alt: 8000, heading: 180,
    });
  });
  it('잘못된 행은 null', () => {
    expect(parseRow(null)).toBeNull();
    expect(parseRow([1, 2, 3])).toBeNull();
    expect(parseRow(['', 'a', 'b', 1, 2, 3, 4, 5, 6, 7, 8, 9])).toBeNull();
    expect(parseRow(['id', 'c', 'o', 1, 2, 'x', 'y', 0, false, 0, 0, 0])).toBeNull();
  });
  it('heading/alt 누락 시 0 기본값', () => {
    const a = parseRow(['id', 'c', 'o', null, null, 1, 2, null, false, null, 0, null]);
    expect(a?.heading).toBe(0);
    expect(a?.alt).toBe(0);
  });
});
