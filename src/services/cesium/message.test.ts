import { describe, it, expect } from 'vitest';
import { parseFlightMessage, parseFleetMessage } from './message';

describe('parseFlightMessage', () => {
  it('유효 단일 메시지', () => {
    const r = parseFlightMessage({ payload: { type: 'flight', lon: 127, lat: 37, alt: 1000, heading: 90 } });
    expect(r).toEqual({ type: 'flight', lon: 127, lat: 37, alt: 1000, heading: 90, layer: undefined });
  });
  it('payload 없으면 null', () => { expect(parseFlightMessage({})).toBeNull(); });
  it('type 불일치 null', () => { expect(parseFlightMessage({ payload: { type: 'x', lon: 1, lat: 1, alt: 1, heading: 1 } })).toBeNull(); });
  it('숫자 아님/NaN null', () => {
    expect(parseFlightMessage({ payload: { type: 'flight', lon: 'a', lat: 1, alt: 1, heading: 1 } })).toBeNull();
    expect(parseFlightMessage({ payload: { type: 'flight', lon: NaN, lat: 1, alt: 1, heading: 1 } })).toBeNull();
  });
  it('비객체 null', () => { expect(parseFlightMessage(null)).toBeNull(); expect(parseFlightMessage('x')).toBeNull(); });
});

describe('parseFleetMessage', () => {
  it('유효 fleet 파싱 + 무효 항목 스킵', () => {
    const r = parseFleetMessage({ payload: { type: 'fleet', aircraft: [
      { lon: 1, lat: 2, alt: 100, heading: 30 },
      { lon: 'x', lat: 2 },                 // 무효(lon)
      { lon: 3, lat: 4 },                   // alt/heading 누락 → 0
    ] } });
    expect(r).toEqual({ type: 'fleet', aircraft: [
      { lon: 1, lat: 2, alt: 100, heading: 30 },
      { lon: 3, lat: 4, alt: 0, heading: 0 },
    ] });
  });
  it('type/배열 아니면 null', () => {
    expect(parseFleetMessage({ payload: { type: 'flight', lon: 1, lat: 1, alt: 1, heading: 1 } })).toBeNull();
    expect(parseFleetMessage({ payload: { type: 'fleet', aircraft: 'x' } })).toBeNull();
  });
  it('빈 배열 OK', () => { expect(parseFleetMessage({ payload: { type: 'fleet', aircraft: [] } })).toEqual({ type: 'fleet', aircraft: [] }); });
});
