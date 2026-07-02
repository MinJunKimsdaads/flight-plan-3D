import { create } from 'zustand';
import type { FleetAircraft } from '@/services/cesium/message';
import type { Aircraft } from '@/services/aircraft';

// 부모 postMessage(4필드) ∪ 독립형 OpenSky(리치 필드).
export type SelectedAircraft = FleetAircraft & Partial<Aircraft>;

export interface Filters {
  airborneOnly: boolean;
  minAlt: number; // m (0 = 제한 없음)
  country: string; // '' = 전체
}

export const DEFAULT_FILTERS: Filters = { airborneOnly: false, minAlt: 0, country: '' };

// 검색어 + 필터로 기체 매칭 여부.
export function matchAircraft(a: SelectedAircraft, query: string, f: Filters): boolean {
  if (f.airborneOnly && a.on_ground) return false;
  if (f.minAlt > 0 && (a.alt ?? 0) < f.minAlt) return false;
  if (f.country && a.origin_country !== f.country) return false;
  const q = query.trim().toLowerCase();
  if (q) {
    const cs = (a.callsign ?? '').toLowerCase();
    const ic = (a.icao24 ?? '').toLowerCase();
    if (!cs.includes(q) && !ic.includes(q)) return false;
  }
  return true;
}

interface UIState {
  aircraft: SelectedAircraft[];
  setAircraft: (a: SelectedAircraft[]) => void;
  selected: SelectedAircraft | null;
  setSelected: (a: SelectedAircraft | null) => void;
  clearSelected: () => void;
  query: string;
  setQuery: (q: string) => void;
  filters: Filters;
  setFilters: (f: Partial<Filters>) => void;
  panelOpen: boolean;
  togglePanel: () => void;
  weatherOn: boolean;
  toggleWeather: () => void;
}

// 3D 뷰 공유 UI 상태(선택 기체 · 검색/필터 · 기상 · 통계용 기체목록).
export const useUIStore = create<UIState>((set) => ({
  aircraft: [],
  setAircraft: (a) => set({ aircraft: a }),
  selected: null,
  setSelected: (a) => set({ selected: a }),
  clearSelected: () => set({ selected: null }),
  query: '',
  setQuery: (q) => set({ query: q }),
  filters: DEFAULT_FILTERS,
  setFilters: (f) => set((s) => ({ filters: { ...s.filters, ...f } })),
  panelOpen: false,
  togglePanel: () => set((s) => ({ panelOpen: !s.panelOpen })),
  weatherOn: false,
  toggleWeather: () => set((s) => ({ weatherOn: !s.weatherOn })),
}));
