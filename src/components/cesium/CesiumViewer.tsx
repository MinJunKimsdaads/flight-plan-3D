import { MAP } from "@/constants/cesiumConstant";
import { useCesium } from "@/contexts/CesiumContext";
import { addLayer } from "@/services/cesium/maps";
import { Viewer,Cartesian3,Ion } from "cesium";
import { useEffect, useRef } from "react";
import styles from '@/assets/css/cesium/Cesium,.module.scss';
import 'cesium/Build/Cesium/Widgets/widgets.css';

const CesiumViewer = () => {
  const cesiumRef = useRef<HTMLDivElement | null>(null);
  const {setCesium} = useCesium();
  useEffect(()=>{
    if(!cesiumRef.current) return;

    Ion.defaultAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI2YWU3ZDhjZC00MmQ3LTQxMDYtYmQ0Mi1mNjJhNmYxMzY3YjIiLCJpZCI6MzE1NDkxLCJpYXQiOjE3NTA4MzY1NzJ9.WnZByGs7wVuhPUFy5tlSFtIxCfUzgtyvyDck79Jh5Zo';
  
    const viewer = new Viewer(cesiumRef.current,{
      shouldAnimate: false,  // 시간 애니메이션(Clock 등)을 실행할지 여부 (true: 자동 시간 흐름)
      timeline: false, // 하단의 타임라인 UI 표시 여부
      animation: false, // 좌측 하단 재생/일시정지 컨트롤러 UI 표시 여부
      baseLayerPicker: false, // 우측 상단의 지도 베이스 레이어 선택 버튼 표시 여부
      sceneModePicker: false, // 2D/3D/Columbus View 전환 버튼 표시 여부
      geocoder: false, // 검색창(UI 상단의 위치 검색창) 표시 여부
      navigationHelpButton: false, // 마우스 조작법 도움말 버튼 표시 여부
      infoBox: false, // 엔티티 클릭 시 나오는 정보 상자 UI 표시 여부
      selectionIndicator: false, // 클릭된 엔티티의 강조 원 애니메이션 표시 여부
      homeButton: false, // 🏠 Home 버튼 (기본 시점 복귀) 표시 여부
      useDefaultRenderLoop: true,
    });

    // 초기 카메라 위치 설정
    viewer.camera.flyTo({
      destination: Cartesian3.fromDegrees(127.1388684, 37.4449168, 2000000),
    });

    addLayer(viewer,MAP[0]);

    setCesium(viewer);
    return () => {
      viewer.destroy();
    };
  },[setCesium])
  return (
    <div ref={cesiumRef} className={styles.cesiumBox}></div>
  );
};

export default CesiumViewer;