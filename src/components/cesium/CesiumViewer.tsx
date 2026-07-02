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
} from "cesium";
import { useEffect, useRef, useState } from "react";
import styles from '@/assets/css/cesium/Cesium.module.scss';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import homeImg from '@/assets/img/home.svg';
import menuImg from '@/assets/img/menu.svg';

const PARENT_ORIGIN = 'http://developkmj.dothome.co.kr';
const FLEET_MODEL = () => `${(CESIUM_BASE_URL as string)}data/aircraft.glb`;
const CELL = 64;          // 화면 그리드 셀(px) — 이 안에 여러 대면 클러스터
const CLUSTER_MIN = 4;    // 셀 내 이 수 이상이면 버블로 묶음
const MODEL_CAP = 400;    // 개별 3D 모델 최대 수(성능 상한)

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

const ctrlBtn: React.CSSProperties = {
  width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'rgba(20,28,42,0.78)', border: '1px solid rgba(255,255,255,0.18)',
  borderRadius: 8, cursor: 'pointer', padding: 0,
};

interface FleetPos { a: FleetAircraft; pos: Cartesian3 }

const CesiumViewer = ({ externalFleet }: { externalFleet?: FleetAircraft[] | null }) => {
  const cesiumRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const entityRef = useRef<Entity | null>(null);
  const bubbleDsRef = useRef<CustomDataSource | null>(null);
  const modelDsRef = useRef<CustomDataSource | null>(null);
  const fleetPosRef = useRef<FleetPos[]>([]);
  const { setCesium } = useCesium();

  const [flight, setFlight] = useState<FlightMessage | null>(null);
  const [fleet, setFleet] = useState<FleetAircraft[] | null>(null);
  const [viewerReady, setViewerReady] = useState(false);
  const [viewMode, setViewMode] = useState<'side' | 'top'>('side');
  const [tileIdx, setTileIdx] = useState(0);
  const viewModeRef = useRef(viewMode);
  viewModeRef.current = viewMode;

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

    const cells = new Map<string, FleetPos[]>();
    for (const fp of fleetPosRef.current) {
      if (!isFrontOfGlobe(cam, fp.pos)) continue; // 지구 반대편 제외
      const s = scene.cartesianToCanvasCoordinates(fp.pos);
      if (!s || s.x < 0 || s.x > w || s.y < 0 || s.y > h) continue; // 화면 밖 제외
      const key = Math.floor(s.x / CELL) + ',' + Math.floor(s.y / CELL);
      const arr = cells.get(key);
      if (arr) arr.push(fp); else cells.set(key, [fp]);
    }

    bubbleDs.entities.removeAll();
    modelDs.entities.removeAll();
    const pin = clusterPin();
    let modelCount = 0;
    for (const arr of cells.values()) {
      if (arr.length >= CLUSTER_MIN) {
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
          const orientation = Transforms.headingPitchRollQuaternion(
            fp.pos, new HeadingPitchRoll(CesiumMath.toRadians(fp.a.heading - 90), 0, 0),
          );
          modelDs.entities.add({
            position: fp.pos,
            orientation,
            model: { uri: FLEET_MODEL(), minimumPixelSize: 42, maximumScale: 20000 },
          });
          modelCount++;
        }
      }
    }
    scene.requestRender();
  };

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
    viewer.camera.moveEnd.addEventListener(rebuild);
    viewerRef.current = viewer;
    setCesium(viewer);
    setViewerReady(true);
    return () => {
      viewer.camera.moveEnd.removeEventListener(rebuild);
      viewer.destroy();
      viewerRef.current = null; bubbleDsRef.current = null; modelDsRef.current = null;
      setViewerReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setCesium]);

  // 베이스맵(타일) 전환
  useEffect(() => {
    const v = viewerRef.current;
    if (!v || !viewerReady) return;
    addLayer(v, MAP[tileIdx]);
  }, [tileIdx, viewerReady]);

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
    fleetPosRef.current = (src ?? []).map((a) => ({ a, pos: Cartesian3.fromDegrees(a.lon, a.lat, a.alt) }));
    rebuild();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalFleet, fleet, viewerReady]);

  return (
    <div className={styles.cesiumBox}>
      <div ref={cesiumRef} style={{ width: '100%', height: '100%' }} />
      <div style={{ position: 'absolute', top: 12, left: 12, display: 'flex', flexDirection: 'column', gap: 8, zIndex: 5 }}>
        <button onClick={onHome} title="선택 기체로 이동" style={ctrlBtn}>
          <img src={homeImg} width={18} height={18} alt="home" />
        </button>
        <button onClick={onToggleView} title="측면/탑뷰 전환" style={ctrlBtn}>
          <img src={menuImg} width={18} height={18} alt="view" />
        </button>
        <select
          value={tileIdx}
          onChange={(e) => setTileIdx(Number(e.target.value))}
          title="베이스맵 전환"
          style={{ marginTop: 2, background: 'rgba(20,28,42,0.82)', color: '#e6ecf5', border: '1px solid rgba(255,255,255,0.18)', borderRadius: 8, fontSize: 11, padding: '4px 6px', cursor: 'pointer', maxWidth: 128 }}
        >
          {MAP.map((m, i) => (
            <option key={m.name} value={i} style={{ color: '#000' }}>{m.name}</option>
          ))}
        </select>
      </div>
    </div>
  );
};

export default CesiumViewer;
