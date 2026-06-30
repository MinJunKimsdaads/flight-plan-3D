import { describe, it, expect } from 'vitest';
import { parseFlightMessage } from './message';

describe('parseFlightMessage', () => {
  it('유효 메시지를 파싱한다', () => {
    const r = parseFlightMessage({ payload: { type: 'flight', lon: 127, lat: 37, alt: 1000, heading: 90 } });
    expect(r).toEqual({ type: 'flight', lon: 127, lat: 37, alt: 1000, heading: 90, layer: undefined });
  });
  it('payload 가 없으면 null', () => {
    expect(parseFlightMessage({})).toBeNull();
  });
  it('type 이 flight 가 아니면 null', () => {
    expect(parseFlightMessage({ payload: { type: 'x', lon: 1, lat: 1, alt: 1, heading: 1 } })).toBeNull();
  });
  it('좌표가 숫자가 아니면 null', () => {
    expect(parseFlightMessage({ payload: { type: 'flight', lon: 'a', lat: 1, alt: 1, heading: 1 } })).toBeNull();
  });
  it('NaN/Infinity 거부', () => {
    expect(parseFlightMessage({ payload: { type: 'flight', lon: NaN, lat: 1, alt: 1, heading: 1 } })).toBeNull();
  });
  it('비객체 입력은 null', () => {
    expect(parseFlightMessage(null)).toBeNull();
    expect(parseFlightMessage('x')).toBeNull();
    expect(parseFlightMessage(42)).toBeNull();
  });
  it('layer 를 보존한다', () => {
    const r = parseFlightMessage({ payload: { type: 'flight', lon: 1, lat: 2, alt: 3, heading: 4, layer: { url: 'u' } } });
    expect(r?.layer).toEqual({ url: 'u' });
  });
});
