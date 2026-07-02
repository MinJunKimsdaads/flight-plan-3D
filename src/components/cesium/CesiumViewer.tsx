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
// LOD 임계 카메라 고도(m). 이보다 낮게(줌인) 내려가면 개별 3D 모델로 전환.
const LOD_HEIGHT = 400000;
// 줌인 시 3D 모델로 그릴 최대 대수(카메라에 가까운 순).
const MAX_MODELS = 200;
const FLEET_MODEL = () => `${(CESIUM_BASE_URL as string)}data/aircraft.glb`;

// 클러스터 버블(원형) 아이콘. 개수는 라벨로.
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
// 개별 항공기(클러스터 소자)용 작은 비행기 아이콘.
let _planeIcon: HTMLCanvasElement | null = null;
function planeIcon(): HTMLCanvasElement {
  if (_planeIcon) return _planeIcon;
  const c = document.createElement('canvas');
  c.width = 24; c.height = 24;
  const x = c.getContext('2d')!;
  x.translate(12, 12);
  x.fillStyle = '#f59e0b'; x.strokeStyle = 'rgba(50,33,0,0.85)'; x.lineWidth = 1;
  x.beginPath();
  x.moveTo(0, -10); x.lineTo(1.6, -2.4); x.lineTo(10, 2.5); x.lineTo(10, 4); x.lineTo(1.6, 1.6);
  x.lineTo(1.2, 7.5); x.lineTo(4, 10); x.lineTo(4, 11); x.lineTo(0, 9);
  x.lineTo(-4, 11); x.lineTo(-4, 10); x.lineTo(-1.2, 7.5); x.lineTo(-1.6, 1.6);
  x.lineTo(-10, 4); x.lineTo(-10, 2.5); x.lineTo(-1.6, -2.4);
  x.closePath(); x.fill(); x.stroke();
  _planeIcon = c;
  return c;
}

const ctrlBtn: React.CSSProperties = {
  width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'rgba(20,28,42,0.78)', border: '1px solid rgba(255,255,255,0.18)',
  borderRadius: 8, cursor: 'pointer', padding: 0,
};

interface FleetPos { a: FleetAircraft; pos: Cartesian3 }

const CesiumViewer = () => {
  const cesiumRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const entityRef = useRef<Entity | null>(null);
  const clusterDsRef = useRef<CustomDataSource | null>(null);
  const modelDsRef = useRef<CustomDataSource | null>(null);
  const fleetPosRef = useRef<FleetPos[]>([]);
  const { setCesium } = useCesium();

  const [flight, setFlight] = useState<FlightMessage | null>(null);
  const [fleet, setFleet] = useState<FleetAircraft[] | null>(null);
  const [viewerReady, setViewerReady] = useState(false);
  const [viewMode, setViewMode] = useState<'side' | 'top'>('side');
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

  // LOD: 고도에 따라 클러스터(멀리) ↔ 개별 3D 모델(가까이) 전환
  const updateLod = () => {
    const viewer = viewerRef.current;
    const clusterDs = clusterDsRef.current;
    const modelDs = modelDsRef.current;
    if (!viewer || !clusterDs || !modelDs) return;
    const zoomedIn = viewer.camera.positionCartographic.height <= LOD_HEIGHT;
    clusterDs.show = !zoomedIn;
    modelDs.show = zoomedIn;
    if (!zoomedIn) { modelDs.entities.removeAll(); return; }
    const cam = viewer.camera.positionWC;
    const near = [...fleetPosRef.current]
      .sort((p, q) => Cartesian3.distanceSquared(cam, p.pos) - Cartesian3.distanceSquared(cam, q.pos))
      .slice(0, MAX_MODELS);
    modelDs.entities.removeAll();
    for (const { a, pos } of near) {
      const orientation = Transforms.headingPitchRollQuaternion(
        pos, new HeadingPitchRoll(CesiumMath.toRadians(a.heading - 90), 0, 0),
      );
      modelDs.entities.add({
        position: pos,
        orientation,
        model: { uri: FLEET_MODEL(), minimumPixelSize: 48, maximumScale: 20000 },
      });
    }
    viewer.scene.requestRender();
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
    // 카메라 멈출 때마다 LOD 재평가
    viewer.camera.moveEnd.addEventListener(updateLod);
    viewerRef.current = viewer;
    setCesium(viewer);
    setViewerReady(true);
    return () => {
      viewer.camera.moveEnd.removeEventListener(updateLod);
      viewer.destroy();
      viewerRef.current = null; clusterDsRef.current = null; modelDsRef.current = null;
      setViewerReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      model: { uri: FLEET_MODEL(), minimumPixelSize: 500, maximumScale: 100 },
    }));
    viewer.camera.cancelFlight();
    viewer.zoomTo(entityRef.current, new HeadingPitchRange(0, CesiumMath.toRadians(-30), 3200)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flight, viewerReady]);

  // 전체 항공기(fleet): 클러스터(멀리) DataSource 구성 + LOD 반영
  useEffect(() => {
    if (!viewerReady) return;
    const viewer = viewerRef.current;
    if (!viewer) return;
    let clusterDs = clusterDsRef.current;
    if (!clusterDs) {
      clusterDs = new CustomDataSource('fleet-cluster');
      viewer.dataSources.add(clusterDs);
      clusterDs.clustering.enabled = true;
      clusterDs.clustering.pixelRange = 42;
      clusterDs.clustering.minimumClusterSize = 3;
      const pin = clusterPin();
      clusterDs.clustering.clusterEvent.addEventListener((clustered, cluster) => {
        cluster.billboard.show = true;
        cluster.billboard.image = pin as unknown as string;
        cluster.billboard.verticalOrigin = VerticalOrigin.CENTER;
        cluster.billboard.disableDepthTestDistance = Number.POSITIVE_INFINITY;
        cluster.label.show = true;
        cluster.label.text = String(clustered.length);
        cluster.label.font = 'bold 13px sans-serif';
        cluster.label.fillColor = Color.WHITE;
        cluster.label.verticalOrigin = VerticalOrigin.CENTER;
        cluster.label.horizontalOrigin = HorizontalOrigin.CENTER;
        cluster.label.disableDepthTestDistance = Number.POSITIVE_INFINITY;
      });
      clusterDsRef.current = clusterDs;
    }
    if (!modelDsRef.current) {
      const md = new CustomDataSource('fleet-model');
      viewer.dataSources.add(md);
      modelDsRef.current = md;
    }
    // 클러스터용 빌보드 엔티티(전량) + 위치 캐시
    const img = planeIcon();
    const positions: FleetPos[] = [];
    clusterDs.entities.removeAll();
    for (const a of fleet ?? []) {
      const pos = Cartesian3.fromDegrees(a.lon, a.lat, a.alt);
      positions.push({ a, pos });
      clusterDs.entities.add({
        position: pos,
        billboard: {
          image: img as unknown as string,
          scale: 0.8,
          rotation: CesiumMath.toRadians(-a.heading),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
    }
    fleetPosRef.current = positions;
    updateLod();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
