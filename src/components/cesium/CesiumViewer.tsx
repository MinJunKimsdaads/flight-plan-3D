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
  BillboardCollection,
} from "cesium";
import { useEffect, useRef, useState } from "react";
import styles from '@/assets/css/cesium/Cesium.module.scss';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import homeImg from '@/assets/img/home.svg';
import menuImg from '@/assets/img/menu.svg';

const PARENT_ORIGIN = 'http://developkmj.dothome.co.kr';

// fleet 빌보드용 비행기 아이콘(canvas) — SVG 렌더 의존 없이 1회 생성해 공유.
let _planeIcon: HTMLCanvasElement | null = null;
function planeIcon(): HTMLCanvasElement {
  if (_planeIcon) return _planeIcon;
  const c = document.createElement('canvas');
  c.width = 28; c.height = 28;
  const x = c.getContext('2d')!;
  x.translate(14, 14);
  x.fillStyle = '#f59e0b';
  x.strokeStyle = 'rgba(50,33,0,0.85)';
  x.lineWidth = 1;
  x.beginPath();
  x.moveTo(0, -12);
  x.lineTo(2, -3); x.lineTo(12, 3); x.lineTo(12, 5); x.lineTo(2, 2);
  x.lineTo(1.5, 9); x.lineTo(5, 12); x.lineTo(5, 13); x.lineTo(0, 11);
  x.lineTo(-5, 13); x.lineTo(-5, 12); x.lineTo(-1.5, 9); x.lineTo(-2, 2);
  x.lineTo(-12, 5); x.lineTo(-12, 3); x.lineTo(-2, -3);
  x.closePath();
  x.fill(); x.stroke();
  _planeIcon = c;
  return c;
}

const ctrlBtn: React.CSSProperties = {
  width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'rgba(20,28,42,0.78)', border: '1px solid rgba(255,255,255,0.18)',
  borderRadius: 8, cursor: 'pointer', padding: 0,
};

const CesiumViewer = () => {
  const cesiumRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const entityRef = useRef<Entity | null>(null);
  const billboardsRef = useRef<BillboardCollection | null>(null);
  const { setCesium } = useCesium();

  const [flight, setFlight] = useState<FlightMessage | null>(null);
  const [fleet, setFleet] = useState<FleetAircraft[] | null>(null);
  const [viewerReady, setViewerReady] = useState(false);
  const [viewMode, setViewMode] = useState<'side' | 'top'>('side');
  const viewModeRef = useRef(viewMode);
  viewModeRef.current = viewMode;

  // 선택 기체를 현재(또는 지정) 시점으로 프레이밍
  const frameSelected = (mode?: 'side' | 'top') => {
    const viewer = viewerRef.current;
    if (!viewer || !entityRef.current) return;
    const m = mode ?? viewModeRef.current;
    const pitch = m === 'top' ? -89 : -30;
    const range = m === 'top' ? 2600 : 3200;
    viewer.camera.cancelFlight();
    viewer.zoomTo(entityRef.current, new HeadingPitchRange(0, CesiumMath.toRadians(pitch), range)).catch(() => {});
  };
  const onHome = () => frameSelected();
  const onToggleView = () => {
    const next = viewModeRef.current === 'side' ? 'top' : 'side';
    setViewMode(next);
    frameSelected(next);
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
    addLayer(viewer, MAP[0]);
    viewer.camera.flyTo({ destination: Cartesian3.fromDegrees(127.1388684, 37.4449168, 2000000) });
    viewerRef.current = viewer;
    setCesium(viewer);
    setViewerReady(true);
    return () => { viewer.destroy(); viewerRef.current = null; billboardsRef.current = null; setViewerReady(false); };
  }, [setCesium]);

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
      model: { uri: `${(CESIUM_BASE_URL as string)}data/aircraft.glb`, minimumPixelSize: 500, maximumScale: 100 },
    }));
    frameSelected();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flight, viewerReady]);

  // 전체 항공기(fleet): 빌보드로 일괄 렌더(heading 회전)
  useEffect(() => {
    if (!viewerReady) return;
    const viewer = viewerRef.current;
    if (!viewer) return;
    if (!billboardsRef.current) {
      billboardsRef.current = viewer.scene.primitives.add(new BillboardCollection());
    }
    const bb = billboardsRef.current;
    bb.removeAll();
    const img = planeIcon();
    for (const a of fleet ?? []) {
      bb.add({
        position: Cartesian3.fromDegrees(a.lon, a.lat, a.alt),
        image: img,
        scale: 0.7,
        rotation: CesiumMath.toRadians(-a.heading),
      });
    }
    viewer.scene.requestRender();
  }, [fleet, viewerReady]);

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
      </div>
    </div>
  );
};

export default CesiumViewer;
