import { MAP } from "@/constants/cesiumConstant";
import { useCesium } from "@/contexts/CesiumContext";
import { addLayer } from "@/services/cesium/maps";
import { parseFlightMessage, parseFleetMessage, type FlightMessage, type FleetAircraft } from "@/services/cesium/message";
import {
  Viewer,
  Cartesian3,
  Ion,
  Entity,
  ConstantPositionProperty,
  Math as CesiumMath,
  HeadingPitchRoll,
  HeadingPitchRange,
  Transforms,
  CustomDataSource,
  Color,
  VerticalOrigin,
  HorizontalOrigin,
  DistanceDisplayCondition,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
} from "cesium";
import { useEffect, useRef, useState } from "react";
import styles from '@/assets/css/cesium/Cesium.module.scss';
import 'cesium/Build/Cesium/Widgets/widgets.css';

const PARENT_ORIGIN = 'http://developkmj.dothome.co.kr';
const FLEET_MODEL = () => `${(CESIUM_BASE_URL as string)}data/aircraft.glb`;
const CELL = 64;          // 화면 그리드 셀(px) — 이 안에 여러 대면 클러스터
const CLUSTER_MIN = 4;    // 셀 내 이 수 이상이면 버블로 묶음
const MODEL_CAP = 400;    // 개별 3D 모델 최대 수(성능 상한)
const RING_MIN_DIST = 15000; // 이 거리(m)보다 가까우면 포커스 링 숨김

// 지구 반대편(가려진) 점 컬링 — 구 근사 지평선 테스트.
// Cesium EllipsoidalOccluder 는 공개 타입(.d.ts)에 없어 import 시 tsc 실패 → 자체 구현.
// 시선(카메라→점) 선분이 평균반경 구를 관통하면 가려진 것으로 판단.
const GLOBE_R = 6_371_000; // 지구 평균반경(m)
function isFrontOfGlobe(cam: { x: number; y: number; z: number }, p: Cartesian3): boolean {
  const dx = p.x - cam.x, dy = p.y - cam.y, dz = p.z - cam.z;
  const dd = dx * dx + dy * dy + dz * dz;
  if (dd === 0) return true;
  const t = -(cam.x * dx + cam.y * dy + cam.z * dz) / dd; // 선분상 최근접점 파라미터
  if (t <= 0 || t >= 1) return true;                      // 최근접점이 선분 밖 → 관통 안 함
  const nx = cam.x + t * dx, ny = cam.y + t * dy, nz = cam.z + t * dz;
  return nx * nx + ny * ny + nz * nz >= GLOBE_R * GLOBE_R;
}

// 클러스터 버블(원형) 아이콘.
let _clusterPin: HTMLCanvasElement | null = null;
function clusterPin(): HTMLCanvasElement {
  if (_clusterPin) return _clusterPin;
  const c = document.createElement('canvas');
  c.width = 44; c.height = 44;
  const x = c.getContext('2d')!;
  x.beginPath(); x.arc(22, 22, 18, 0, Math.PI * 2);
  x.fillStyle = 'rgba(37,99,235,0.9)'; x.fill();
  x.lineWidth = 2.5; x.strokeStyle = 'rgba(255,255,255,0.95)'; x.stroke();
  _clusterPin = c;
  return c;
}

// 개별 기체 포커스 링(헤일로 + 선명한 링) — 스크린 페이싱 빌보드용.
let _ringPin: HTMLCanvasElement | null = null;
function ringPin(): HTMLCanvasElement {
  if (_ringPin) return _ringPin;
  const c = document.createElement('canvas');
  c.width = 60; c.height = 60;
  const x = c.getContext('2d')!;
  x.beginPath(); x.arc(30, 30, 23, 0, Math.PI * 2);
  x.strokeStyle = 'rgba(255,150,50,0.28)'; x.lineWidth = 6; x.stroke();
  x.beginPath(); x.arc(30, 30, 23, 0, Math.PI * 2);
  x.strokeStyle = 'rgba(255,140,30,0.95)'; x.lineWidth = 2; x.stroke();
  _ringPin = c;
  return c;
}

// 인라인 아이콘(에셋 불필요, currentColor 상속) ------------------------------
const S = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
const IconPlus = () => (<svg {...S}><path d="M12 5v14M5 12h14" /></svg>);
const IconMinus = () => (<svg {...S}><path d="M5 12h14" /></svg>);
const IconNorth = () => (<svg {...S}><circle cx="12" cy="12" r="9" /><path d="M12 6.5l3 9-3-2-3 2 3-9z" fill="currentColor" stroke="none" /></svg>);
const IconExpand = () => (<svg {...S}><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>);
const IconCompress = () => (<svg {...S}><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" /></svg>);
const IconCluster = () => (<svg {...S}><circle cx="8" cy="9" r="2.3" /><circle cx="15.5" cy="8" r="2.3" /><circle cx="11.5" cy="15.5" r="2.3" /></svg>);
const IconChevron = ({ open }: { open: boolean }) => (<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={`lv3d-chev${open ? ' open' : ''}`}><path d="M6 9l6 6 6-6" /></svg>);
const IconLocate = () => (<svg {...S}><circle cx="12" cy="12" r="7" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /><circle cx="12" cy="12" r="1.7" fill="currentColor" stroke="none" /></svg>);
const IconView = ({ top }: { top: boolean }) => (top
  ? (<svg {...S}><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M4 9h16M9 4v16" /></svg>)
  : (<svg {...S}><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" /><path d="M4 7.5l8 4.5 8-4.5M12 12v9" /></svg>));

// 컨트롤 패널 스타일(단일 파일 유지 — scss 트렁케이션 회피, :hover 지원).
const PANEL_CSS = `
.lv3d-panel{position:absolute;top:12px;right:12px;z-index:5;display:flex;flex-direction:column;gap:6px;padding:8px;border-radius:12px;background:rgba(15,22,34,0.72);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,0.10);box-shadow:0 8px 30px rgba(0,0,0,0.40);}
.lv3d-badge{display:flex;align-items:center;justify-content:center;gap:5px;font:600 11px/1 ui-monospace,SFMono-Regular,monospace;color:#cfe0ff;background:rgba(37,99,235,0.18);border:1px solid rgba(80,130,255,0.35);border-radius:8px;padding:6px 8px;letter-spacing:.02em;}
.lv3d-badge svg{width:13px;height:13px;opacity:.9;}
.lv3d-btn{width:36px;height:36px;display:flex;align-items:center;justify-content:center;padding:0;color:#dbe6f5;background:rgba(28,38,56,0.85);border:1px solid rgba(255,255,255,0.12);border-radius:9px;cursor:pointer;transition:background .15s,border-color .15s,transform .05s;}
.lv3d-btn:hover{background:rgba(45,60,88,0.95);border-color:rgba(255,255,255,0.25);}
.lv3d-btn:active{transform:scale(0.94);}
.lv3d-btn.active{background:rgba(37,99,235,0.85);border-color:rgba(120,160,255,0.70);color:#fff;}
.lv3d-btn img{width:18px;height:18px;display:block;}
.lv3d-btn svg{display:block;}
.lv3d-div{height:1px;margin:1px 3px;background:rgba(255,255,255,0.10);}
.lv3d-dd{position:relative;}
.lv3d-dd-btn{display:flex;align-items:center;justify-content:space-between;gap:6px;width:134px;color:#dbe6f5;background:rgba(28,38,56,0.85);border:1px solid rgba(255,255,255,0.12);border-radius:9px;cursor:pointer;font:500 11px/1 system-ui,sans-serif;padding:9px;transition:background .15s;}
.lv3d-dd-btn:hover{background:rgba(45,60,88,0.95);}
.lv3d-dd-btn span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.lv3d-dd-menu{position:absolute;top:calc(100% + 6px);left:0;width:100%;max-height:236px;overflow:auto;display:flex;flex-direction:column;gap:2px;padding:5px;border-radius:10px;background:rgba(15,22,34,0.97);border:1px solid rgba(255,255,255,0.14);box-shadow:0 12px 30px rgba(0,0,0,0.50);}
.lv3d-dd-item{text-align:left;color:#c7d3e6;background:transparent;border:0;border-radius:7px;cursor:pointer;font:500 11px/1.2 system-ui,sans-serif;padding:8px;transition:background .12s;}
.lv3d-dd-item:hover{background:rgba(255,255,255,0.08);color:#fff;}
.lv3d-dd-item.active{background:rgba(37,99,235,0.65);color:#fff;}
.lv3d-chev{transition:transform .18s;}
.lv3d-chev.open{transform:rotate(180deg);}
`;

interface FleetPos { a: FleetAircraft; pos: Cartesian3; idx: number }

const CesiumViewer = ({ externalFleet }: { externalFleet?: FleetAircraft[] | null }) => {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const cesiumRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const entityRef = useRef<Entity | null>(null);
  const bubbleDsRef = useRef<CustomDataSource | null>(null);
  const modelDsRef = useRef<CustomDataSource | null>(null);
  const fleetPosRef = useRef<FleetPos[]>([]);
  const modelPoolRef = useRef<Map<number, Entity>>(new Map());
  const { setCesium } = useCesium();

  const [flight, setFlight] = useState<FlightMessage | null>(null);
  const [fleet, setFleet] = useState<FleetAircraft[] | null>(null);
  const [viewerReady, setViewerReady] = useState(false);
  const [viewMode, setViewMode] = useState<'side' | 'top'>('side');
  const [tileIdx, setTileIdx] = useState(0);
  const [tileMenuOpen, setTileMenuOpen] = useState(false);
  const [clusterOn, setClusterOn] = useState(true);
  const [count, setCount] = useState(0);
  const [isFs, setIsFs] = useState(false);
  const viewModeRef = useRef(viewMode);
  viewModeRef.current = viewMode;
  const clusterOnRef = useRef(clusterOn);
  clusterOnRef.current = clusterOn;

  const frameSelected = (mode?: 'side' | 'top') => {
    const viewer = viewerRef.current;
    const entity = entityRef.current;
    if (!viewer || !entity) return;
    const m = mode ?? viewModeRef.current;
    const pitch = m === 'top' ? -89 : -30;
    const range = m === 'top' ? 2600 : 3200;
    viewer.camera.cancelFlight();
    viewer.zoomTo(entity, new HeadingPitchRange(0, CesiumMath.toRadians(pitch), range)).catch(() => {});
  };
  const onHome = () => frameSelected();
  const onToggleView = () => {
    const next = viewModeRef.current === 'side' ? 'top' : 'side';
    setViewMode(next);
    frameSelected(next);
  };

  // 화면 그리드 클러스터링: 뭉친 셀=버블, 개별=3D 모델. (카메라 이동/데이터 갱신마다 재구성)
  const rebuild = () => {
    const viewer = viewerRef.current;
    const bubbleDs = bubbleDsRef.current;
    const modelDs = modelDsRef.current;
    if (!viewer || !bubbleDs || !modelDs) return;
    const scene = viewer.scene;
    const w = scene.canvas.clientWidth;
    const h = scene.canvas.clientHeight;
    const camWC = viewer.camera.positionWC;
    const cam = { x: camWC.x, y: camWC.y, z: camWC.z };
    const clusterMin = clusterOnRef.current ? CLUSTER_MIN : Number.POSITIVE_INFINITY;

    const cells = new Map<string, FleetPos[]>();
    let visible = 0;
    for (const fp of fleetPosRef.current) {
      if (!isFrontOfGlobe(cam, fp.pos)) continue; // 지구 반대편 제외
      const s = scene.cartesianToCanvasCoordinates(fp.pos);
      if (!s || s.x < 0 || s.x > w || s.y < 0 || s.y > h) continue; // 화면 밖 제외
      visible++;
      const key = Math.floor(s.x / CELL) + ',' + Math.floor(s.y / CELL);
      const arr = cells.get(key);
      if (arr) arr.push(fp); else cells.set(key, [fp]);
    }

    // 버블은 매번 재구성(가벼운 빌보드 — 깜빡임 없음).
    bubbleDs.entities.removeAll();
    // 모델은 풀에서 재사용 + show 토글 → 카메라 이동 시 glb 재로딩/깜빡임 방지.
    const pool = modelPoolRef.current;
    const used = new Set<number>();
    const pin = clusterPin();
    const ring = ringPin();
    let modelCount = 0;
    for (const arr of cells.values()) {
      if (arr.length >= clusterMin) {
        bubbleDs.entities.add({
          position: arr[0].pos,
          billboard: {
            image: pin as unknown as string,
            verticalOrigin: VerticalOrigin.CENTER,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
          label: {
            text: String(arr.length),
            font: 'bold 13px sans-serif',
            fillColor: Color.WHITE,
            verticalOrigin: VerticalOrigin.CENTER,
            horizontalOrigin: HorizontalOrigin.CENTER,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        });
      } else {
        for (const fp of arr) {
          if (modelCount >= MODEL_CAP) break;
          let ent = pool.get(fp.idx);
          if (!ent) {
            const orientation = Transforms.headingPitchRollQuaternion(
              fp.pos, new HeadingPitchRoll(CesiumMath.toRadians(fp.a.heading - 90), 0, 0),
            );
            ent = modelDs.entities.add({
              position: fp.pos,
              orientation,
              model: { uri: FLEET_MODEL(), minimumPixelSize: 42, maximumScale: 20000 },
              billboard: {
                image: ring as unknown as string,
                verticalOrigin: VerticalOrigin.CENTER,
                horizontalOrigin: HorizontalOrigin.CENTER,
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
                distanceDisplayCondition: new DistanceDisplayCondition(RING_MIN_DIST, Number.MAX_VALUE),
              },
            });
            pool.set(fp.idx, ent);
          }
          ent.show = true;
          used.add(fp.idx);
          modelCount++;
        }
      }
    }
    // 이번 프레임에 개별 표시 안 된 모델은 숨김(파괴하지 않음).
    for (const [idx, ent] of pool) { if (!used.has(idx)) ent.show = false; }
    setCount(visible);
    scene.requestRender();
  };

  // 줌 인/아웃 (현재 고도 비례)
  const zoomStep = (dir: 1 | -1) => {
    const v = viewerRef.current;
    if (!v) return;
    const amt = Math.max(1000, v.camera.positionCartographic.height * 0.35);
    if (dir > 0) v.camera.zoomIn(amt); else v.camera.zoomOut(amt);
    requestAnimationFrame(() => rebuild());
  };
  // 정북 리셋 (위치 유지, heading=0)
  const resetNorth = () => {
    const v = viewerRef.current;
    if (!v) return;
    v.camera.setView({ orientation: { heading: 0, pitch: v.camera.pitch, roll: 0 } });
    requestAnimationFrame(() => rebuild());
  };
  // 풀스크린 토글 (뷰 루트 기준)
  const toggleFullscreen = () => {
    const el = rootRef.current;
    if (!document.fullscreenElement) el?.requestFullscreen?.().catch(() => {});
    else document.exitFullscreen?.().catch(() => {});
  };
  const pickTile = (i: number) => { setTileIdx(i); setTileMenuOpen(false); };

  // Cesium Viewer 생성 (1회)
  useEffect(() => {
    if (!cesiumRef.current) return;
    // TODO(보안): Ion 토큰 재발급 후 env(VITE_CESIUM_ION_TOKEN)로 이전.
    Ion.defaultAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI2YWU3ZDhjZC00MmQ3LTQxMDYtYmQ0Mi1mNjJhNmYxMzY3YjIiLCJpZCI6MzE1NDkxLCJpYXQiOjE3NTA4MzY1NzJ9.WnZByGs7wVuhPUFy5tlSFtIxCfUzgtyvyDck79Jh5Zo';
    const viewer = new Viewer(cesiumRef.current, {
      shouldAnimate: false, timeline: false, animation: false,
      baseLayerPicker: false, sceneModePicker: false, geocoder: false,
      navigationHelpButton: false, infoBox: false, selectionIndicator: false,
      homeButton: false, useDefaultRenderLoop: true,
    });
    viewer.scene.screenSpaceCameraController.enableRotate = false;
    viewer.scene.screenSpaceCameraController.enableTilt = false;
    viewer.scene.screenSpaceCameraController.enableLook = false;
    viewer.camera.flyTo({ destination: Cartesian3.fromDegrees(127.1388684, 37.4449168, 2000000) });
    viewer.camera.percentageChanged = 0.2; // 카메라 변경 민감도↑ (줌 중에도 갱신)
    viewer.camera.moveEnd.addEventListener(rebuild);
    viewer.camera.changed.addEventListener(rebuild);
    // 항공기 위에 마우스 올리면 커서 포인터
    const hoverHandler = new ScreenSpaceEventHandler(viewer.scene.canvas);
    hoverHandler.setInputAction((m) => {
      const picked = viewer.scene.pick(m.endPosition);
      viewer.scene.canvas.style.cursor = picked && picked.id ? 'pointer' : '';
    }, ScreenSpaceEventType.MOUSE_MOVE);
    viewerRef.current = viewer;
    setCesium(viewer);
    setViewerReady(true);
    return () => {
      hoverHandler.destroy();
      viewer.camera.moveEnd.removeEventListener(rebuild);
      viewer.camera.changed.removeEventListener(rebuild);
      viewer.destroy();
      viewerRef.current = null; bubbleDsRef.current = null; modelDsRef.current = null;
      setViewerReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setCesium]);

  // 풀스크린 상태 동기화
  useEffect(() => {
    const onFs = () => setIsFs(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  // 드롭다운 바깥 클릭 시 닫기
  useEffect(() => {
    if (!tileMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!rootRef.current?.querySelector('.lv3d-dd')?.contains(t)) setTileMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [tileMenuOpen]);

  // 베이스맵(타일) 전환
  useEffect(() => {
    const v = viewerRef.current;
    if (!v || !viewerReady) return;
    addLayer(v, MAP[tileIdx]);
  }, [tileIdx, viewerReady]);

  // 클러스터 on/off 토글 시 재구성
  useEffect(() => {
    if (!viewerReady) return;
    rebuild();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clusterOn, viewerReady]);

  // 메시지 수신(flight/fleet) + 준비 통지(핸드셰이크)
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== PARENT_ORIGIN) return;
      const f = parseFlightMessage(e.data);
      if (f) { setFlight(f); return; }
      const fl = parseFleetMessage(e.data);
      if (fl) setFleet(fl.aircraft);
    };
    window.addEventListener('message', onMessage);
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: 'viewer-ready' }, PARENT_ORIGIN);
    }
    return () => window.removeEventListener('message', onMessage);
  }, []);

  // 선택 기체: 상세 모델 + 카메라 프레이밍
  useEffect(() => {
    if (!flight || !viewerReady) return;
    const viewer = viewerRef.current;
    if (!viewer) return;
    const pos = Cartesian3.fromDegrees(flight.lon, flight.lat, flight.alt);
    const orientation = Transforms.headingPitchRollQuaternion(
      pos, new HeadingPitchRoll(CesiumMath.toRadians(flight.heading - 90), 0, 0),
    );
    if (entityRef.current) viewer.entities.remove(entityRef.current);
    entityRef.current = viewer.entities.add(new Entity({
      position: new ConstantPositionProperty(pos),
      orientation,
      model: { uri: FLEET_MODEL(), minimumPixelSize: 500, maximumScale: 100 },
    }));
    viewer.camera.cancelFlight();
    viewer.zoomTo(entityRef.current, new HeadingPitchRange(0, CesiumMath.toRadians(-30), 3200)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flight, viewerReady]);

  // fleet 수신 → 위치 캐시 + 데이터소스 준비 + 재구성
  useEffect(() => {
    if (!viewerReady) return;
    const viewer = viewerRef.current;
    if (!viewer) return;
    if (!bubbleDsRef.current) {
      const bd = new CustomDataSource('fleet-bubble');
      viewer.dataSources.add(bd);
      bubbleDsRef.current = bd;
    }
    if (!modelDsRef.current) {
      const md = new CustomDataSource('fleet-model');
      viewer.dataSources.add(md);
      modelDsRef.current = md;
    }
    const src = externalFleet ?? fleet;
    fleetPosRef.current = (src ?? []).map((a, i) => ({ a, pos: Cartesian3.fromDegrees(a.lon, a.lat, a.alt), idx: i }));
    // 위치가 바뀌므로 모델 풀 초기화(데이터 갱신 시 1회) — 이후 카메라 이동엔 재사용.
    modelDsRef.current?.entities.removeAll();
    modelPoolRef.current.clear();
    rebuild();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalFleet, fleet, viewerReady]);

  return (
    <div ref={rootRef} className={styles.cesiumBox}>
      <style>{PANEL_CSS}</style>
      <div ref={cesiumRef} style={{ width: '100%', height: '100%' }} />

      <div className="lv3d-panel">
        <div className="lv3d-badge" title="화면에 표시 중인 기체 수">
          <svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M21 16v-2l-8-5V3.5A1.5 1.5 0 0 0 11.5 2 1.5 1.5 0 0 0 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z" /></svg>
          {count}
        </div>

        <button className="lv3d-btn" onClick={onHome} title="선택 기체로 이동">
          <IconLocate />
        </button>
        <button className="lv3d-btn" onClick={onToggleView} title={viewMode === 'top' ? '측면 뷰로 전환' : '탑 뷰로 전환'}>
          <IconView top={viewMode === 'top'} />
        </button>

        <div className="lv3d-div" />

        <button className="lv3d-btn" onClick={() => zoomStep(1)} title="줌 인"><IconPlus /></button>
        <button className="lv3d-btn" onClick={() => zoomStep(-1)} title="줌 아웃"><IconMinus /></button>
        <button className="lv3d-btn" onClick={resetNorth} title="정북 정렬"><IconNorth /></button>
        <button className="lv3d-btn" onClick={toggleFullscreen} title={isFs ? '풀스크린 종료' : '풀스크린'}>
          {isFs ? <IconCompress /> : <IconExpand />}
        </button>

        <div className="lv3d-div" />

        <button
          className={`lv3d-btn${clusterOn ? ' active' : ''}`}
          onClick={() => setClusterOn((v) => !v)}
          title={clusterOn ? '클러스터링 켜짐 (클릭 시 끄기)' : '클러스터링 꺼짐 (클릭 시 켜기)'}
        >
          <IconCluster />
        </button>

        <div className="lv3d-dd">
          <button className="lv3d-dd-btn" onClick={() => setTileMenuOpen((o) => !o)} title="베이스맵 전환">
            <span>{MAP[tileIdx].name}</span>
            <IconChevron open={tileMenuOpen} />
          </button>
          {tileMenuOpen && (
            <div className="lv3d-dd-menu">
              {MAP.map((m, i) => (
                <button
                  key={m.name}
                  className={`lv3d-dd-item${i === tileIdx ? ' active' : ''}`}
                  onClick={() => pickTile(i)}
                >
                  {m.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CesiumViewer;
