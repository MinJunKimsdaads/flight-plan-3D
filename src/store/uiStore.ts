import { create } from 'zustand';
import type { FleetAircraft } from '@/services/cesium/message';
import type { Aircraft } from '@/services/aircraft';

// 부모 postMessage(4필드) ∪ 독립형 OpenSky(리치 필드).
export type SelectedAircraft = FleetAircraft & Partial<Aircraft>;

interface UIState {
  selected: SelectedAircraft | null;
  setSelected: (a: SelectedAircraft | null) => void;
  clearSelected: () => void;
}

// 3D 뷰 공유 UI 상태(선택 기체 등). 향후 검색/필터 상태도 이곳으로 확장.
export const useUIStore = create<UIState>((set) => ({
  selected: null,
  setSelected: (a) => set({ selected: a }),
  clearSelected: () => set({ selected: null }),
}));
