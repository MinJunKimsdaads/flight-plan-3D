import { MAP } from "@/constants/cesiumConstant";
import { useCesium } from "@/contexts/CesiumContext";
import { addLayer } from "@/services/cesium/maps";
import { parseFlightMessage, type FlightMessage } from "@/services/cesium/message";
import {
  Viewer,
  Cartesian3,
  Ion,
  Entity,
  ConstantPositionProperty,
  Math as CesiumMath,
  HeadingPitchRoll,
  Transforms,
} from "cesium";
import { useEffect, useRef, useState } from "react";
import styles from '@/assets/css/cesium/Cesium.module.scss';
import 'cesium/Build/Cesium/Widgets/widgets.css';

// 부모(flight-plan) origin. 이 origin 메시지만 신뢰.
// TODO(보안): 호스트 HTTPS 지원 시 https 로 전환.
const PARENT_ORIGIN = 'http://developkmj.dothome.co.kr';

const CesiumViewer = () => {
  const cesiumRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const entityRef = useRef<Entity | null>(null);
  const { setCesium } = useCesium();
  const [flight, setFlight] = useState<FlightMessage | null>(null);
  const [viewerReady, setViewerReady] = useState(false);

  // Cesium Viewer 생성 (마운트 시 1회)
  useEffect(() => {
    if (!cesiumRef.current) return;

    // TODO(보안): Ion 토큰은 재발급 후 import.meta.env(VITE_CESIUM_ION_TOKEN)로 이전.
    Ion.defaultAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI2YWU3ZDhjZC00MmQ3LTQxMDYtYmQ0Mi1mNjJhNmYxMzY3YjIiLCJpZCI6MzE1NDkxLCJpYXQiOjE3NTA4MzY1NzJ9.WnZByGs7wVuhPUFy5tlSFtIxCfUzgtyvyDck79Jh5Zo';

    const viewer = new Viewer(cesiumRef.current, {
      shouldAnimate: false,
      timeline: false,
      animation: false,
      baseLayerPicker: false,
      sceneModePicker: false,
      geocoder: false,
      navigationHelpButton: false,
      infoBox: false,
      selectionIndicator: false,
      homeButton: false,
      useDefaultRenderLoop: true,
    });
    viewer.scene.screenSpaceCameraController.enableRotate = false;
    viewer.scene.screenSpaceCameraController.enableTilt = false;
    viewer.scene.screenSpaceCameraController.enableLook = false;

    addLayer(viewer, MAP[0]);
    viewer.camera.flyTo({
      destination: Cartesian3.fromDegrees(127.1388684, 37.4449168, 2000000),
    });

    viewerRef.current = viewer;
    setCesium(viewer);
    setViewerReady(true);
    return () => {
      viewer.destroy();
      viewerRef.current = null;
      setViewerReady(false);
    };
  }, [setCesium]);

  // 메시지 수신 + 부모에 '준비됨' 통지 (iframe onLoad 레이스 방지 핸드셰이크)
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== PARENT_ORIGIN) return;
      const f = parseFlightMessage(e.data);
      if (f) setFlight(f);
    };
    window.addEventListener('message', onMessage);
    // 리스너 등록 후 부모에게 알림 → 부모가 현재 기체 데이터를 (재)전송
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: 'viewer-ready' }, PARENT_ORIGIN);
    }
    return () => window.removeEventListener('message', onMessage);
  }, []);

  // flight + viewer 둘 다 준비되면 기체 엔티티 렌더 + 카메라 추종 (순서 무관)
  useEffect(() => {
    if (!flight || !viewerReady) return;
    const viewer = viewerRef.current;
    if (!viewer) return;

    const pos = Cartesian3.fromDegrees(flight.lon, flight.lat, flight.alt);
    const cam = Cartesian3.fromDegrees(flight.lon, flight.lat - 0.075, flight.alt + 300);
    viewer.camera.setView({
      destination: cam,
      orientation: { heading: CesiumMath.toRadians(0), pitch: CesiumMath.toRadians(-10), roll: 0 },
    });

    const orientation = Transforms.headingPitchRollQuaternion(
      pos,
      new HeadingPitchRoll(CesiumMath.toRadians(flight.heading - 90), 0, 0),
    );

    if (entityRef.current) viewer.entities.remove(entityRef.current);
    entityRef.current = viewer.entities.add(
      new Entity({
        position: new ConstantPositionProperty(pos),
        orientation,
        model: {
          uri: `${(CESIUM_BASE_URL as string)}data/aircraft.glb`,
          minimumPixelSize: 500,
          maximumScale: 100,
        },
      }),
    );
  }, [flight, viewerReady]);

  return <div ref={cesiumRef} className={styles.cesiumBox}></div>;
};

export default CesiumViewer;
