import { useMemo } from 'react';
import { useUIStore, matchAircraft } from '@/store/uiStore';

// 좌상단 검색·필터·통계 패널. CesiumViewer가 주입한 lv3d-* 전역 스타일 사용.
export default function FleetPanel() {
  const aircraft = useUIStore((s) => s.aircraft);
  const query = useUIStore((s) => s.query);
  const setQuery = useUIStore((s) => s.setQuery);
  const filters = useUIStore((s) => s.filters);
  const setFilters = useUIStore((s) => s.setFilters);
  const panelOpen = useUIStore((s) => s.panelOpen);
  const togglePanel = useUIStore((s) => s.togglePanel);
  const setSelected = useUIStore((s) => s.setSelected);

  const countries = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of aircraft) { const c = a.origin_country; if (c) m.set(c, (m.get(c) ?? 0) + 1); }
    return [...m.entries()].sort((x, y) => y[1] - x[1]);
  }, [aircraft]);

  const filtered = useMemo(
    () => aircraft.filter((a) => matchAircraft(a, query, filters)),
    [aircraft, query, filters],
  );

  const stats = useMemo(() => {
    let air = 0, ground = 0, altSum = 0, altN = 0, spdSum = 0, spdN = 0;
    for (const a of filtered) {
      if (a.on_ground) ground++; else air++;
      if (typeof a.alt === 'number') { altSum += a.alt; altN++; }
      if (typeof a.velocity === 'number') { spdSum += a.velocity; spdN++; }
    }
    return { air, ground, avgAlt: altN ? altSum / altN : 0, avgSpd: spdN ? spdSum / spdN : 0 };
  }, [filtered]);

  if (!panelOpen) {
    return <button className="lv3d-fab" onClick={togglePanel} title="검색 · 필터 · 통계">☰ 패널</button>;
  }

  return (
    <div className="lv3d-fleet">
      <div className="lv3d-fleet-h">
        <span>기체 검색 · 필터 · 통계</span>
        <button className="close" onClick={togglePanel} aria-label="닫기">×</button>
      </div>

      <input
        className="lv3d-search"
        placeholder="콜사인 / ICAO 검색"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <label className="lv3d-row">
        <span>비행 중만</span>
        <input type="checkbox" checked={filters.airborneOnly} onChange={(e) => setFilters({ airborneOnly: e.target.checked })} />
      </label>

      <label className="lv3d-row">
        <span>최소 고도</span>
        <select value={filters.minAlt} onChange={(e) => setFilters({ minAlt: Number(e.target.value) })}>
          <option value={0}>전체</option>
          <option value={1000}>1 km +</option>
          <option value={3000}>3 km +</option>
          <option value={6000}>6 km +</option>
          <option value={10000}>10 km +</option>
        </select>
      </label>

      <label className="lv3d-row">
        <span>국가</span>
        <select value={filters.country} onChange={(e) => setFilters({ country: e.target.value })}>
          <option value="">전체</option>
          {countries.map(([c, n]) => (<option key={c} value={c}>{c} ({n})</option>))}
        </select>
      </label>

      <div className="lv3d-stats">
        <div><b>{filtered.length}</b><span>표시</span></div>
        <div><b>{stats.air}</b><span>비행</span></div>
        <div><b>{stats.ground}</b><span>지상</span></div>
        <div><b>{Math.round(stats.avgAlt).toLocaleString()}</b><span>평균고도 m</span></div>
        <div><b>{Math.round(stats.avgSpd * 3.6)}</b><span>평균속도 km/h</span></div>
        <div><b>{aircraft.length}</b><span>전체</span></div>
      </div>

      <div className="lv3d-top">
        <div className="lv3d-top-h">상위 국가</div>
        {countries.slice(0, 5).map(([c, n]) => {
          const pct = aircraft.length ? Math.round((n / aircraft.length) * 100) : 0;
          return (
            <div key={c} className="lv3d-bar">
              <span className="nm">{c}</span>
              <span className="bar"><i style={{ width: `${pct}%` }} /></span>
              <span className="ct">{n}</span>
            </div>
          );
        })}
      </div>

      <div className="lv3d-list">
        {filtered.slice(0, 40).map((a, i) => (
          <button key={(a.icao24 ?? '') + i} className="lv3d-li" onClick={() => setSelected(a)}>
            <span className="cs">{(a.callsign && a.callsign.trim()) || a.icao24 || '—'}</span>
            <span className="co">{a.origin_country ?? ''}</span>
          </button>
        ))}
        {filtered.length > 40 && <div className="lv3d-more">+{filtered.length - 40} more…</div>}
      </div>
    </div>
  );
}
