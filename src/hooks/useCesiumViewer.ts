import { Viewer, Cartesian3, Entity, Ion, ConstantPositionProperty, Math, HeadingPitchRoll, Transforms, JulianDate, UrlTemplateImageryProvider  } from 'cesium';
import { useEffect, useRef, useState } from "react";

interface UseCesiumViewerParamss {
    longitude:number;
    latitude:number;
    altitude:number;
    direction:number;
    onAllLoaded: () => void;
}

Ion.defaultAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI2YWU3ZDhjZC00MmQ3LTQxMDYtYmQ0Mi1mNjJhNmYxMzY3YjIiLCJpZCI6MzE1NDkxLCJpYXQiOjE3NTA4MzY1NzJ9.WnZByGs7wVuhPUFy5tlSFtIxCfUzgtyvyDck79Jh5Zo';

export const useCesiumViewer = ({
    longitude,
    latitude,
    altitude,
    direction,
    onAllLoaded,
}: UseCesiumViewerParamss) => {
    const viewerRef = useRef<HTMLDivElement | null>(null);
    const cesiumViewerRef = useRef<Viewer | null>(null);
    const entityRef = useRef<Entity | null>(null);
    const isTopViewRef = useRef(false);
    const initialCameraViewRef = useRef<{
    destination: Cartesian3;
    orientation: {
        heading: number;
        pitch: number;
        roll: number;
    };
    } | null>(null);

    const [isSideView, setIsSideView] = useState(false);

    useEffect(()=>{
        if (!viewerRef.current) return;
        const viewer = new Viewer(viewerRef.current, {
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
        });
        viewer.scene.screenSpaceCameraController.enableRotate = false;
        viewer.scene.screenSpaceCameraController.enableTilt = false;
        viewer.scene.screenSpaceCameraController.enableLook = false;
        viewer.scene.screenSpaceCameraController.enableTranslate = true;
        viewer.scene.screenSpaceCameraController.enableZoom = true;

        cesiumViewerRef.current = viewer;

        const onGlobeLoad = (tilesRemaining: number) => {
            if(tilesRemaining === 0){
                onAllLoaded();
            }
        };
        viewer.scene.globe.tileLoadProgressEvent.addEventListener(onGlobeLoad);
        return () => {
            viewer.scene.globe.tileLoadProgressEvent.removeEventListener(onGlobeLoad);
            viewer.destroy();
            cesiumViewerRef.current = null;
        };
    },[])

    const addMap = (tile) => {
        let tileLayer;
        const viewer = cesiumViewerRef.current;
        viewer?.imageryLayers.removeAll();
        if(tile){
            tileLayer = new UrlTemplateImageryProvider(tile);
        }else{
            tileLayer = new UrlTemplateImageryProvider({
                url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                maximumLevel: 19,
                credit: '© OpenStreetMap contributors',
            })
        }
        viewer!.imageryLayers.addImageryProvider(tileLayer);
    }

    const addExtMap = (tile) => {
        let tileLayer;
        const viewer = cesiumViewerRef.current;
        if(tile){
            tileLayer = new UrlTemplateImageryProvider(tile);
            viewer!.imageryLayers.addImageryProvider(tileLayer);
        }
    }

    const addEntity = () => {
        const viewer = cesiumViewerRef.current;
        if (!viewer || !longitude || !latitude || !altitude || !direction) return;
        
        const entityPosition = Cartesian3.fromDegrees(longitude, latitude, altitude);
        const cameraPosition = Cartesian3.fromDegrees(longitude, latitude - 0.075, altitude + 300);
        const positionProperty = new ConstantPositionProperty(entityPosition);

        const cameraOrientation = {
            heading: Math.toRadians(0),
            pitch: Math.toRadians(-10),
            roll: 0,
        };

        // 카메라 이동
        viewer.camera.setView({ 
            destination: cameraPosition,
            orientation: cameraOrientation, 
        });

        initialCameraViewRef.current = {
            destination: cameraPosition,
            orientation: cameraOrientation,
        };

        const correctedHeading = Math.toRadians(direction - 90);
        const orientation = Transforms.headingPitchRollQuaternion(
            entityPosition,
            new HeadingPitchRoll(correctedHeading, 0, 0) //East-North-Up
        );

        const entity = viewer.entities.add(
            new Entity({
                position: positionProperty,
                orientation,
                model: {
                    uri: `${(CESIUM_BASE_URL as string)}data/aircraft.glb`,
                    minimumPixelSize : 500,
                    maximumScale : 100
                }
            })
        )
        entityRef.current = entity;
    }

    const flyHome = () => {
        const viewer = cesiumViewerRef.current;
        const view = initialCameraViewRef.current;
        if (viewer && view) {
            viewer.camera.flyTo({
                destination: view.destination,
                orientation: view.orientation,
                duration: 1.5,
            });
        }
    };

    const toggleCameraView = () => {
        const viewer = cesiumViewerRef.current;
        const entityPos = entityRef.current?.position?.getValue(JulianDate.fromDate(new Date()));
        if (viewer && entityPos) {
            isTopViewRef.current = !isTopViewRef.current;

            setIsSideView(isTopViewRef.current);

            const orientation = isTopViewRef.current
                ? { heading: Math.toRadians(0), pitch: Math.toRadians(-90), roll: 0 }
                : { heading: Math.toRadians(0), pitch: Math.toRadians(-10), roll: 0 };

            const offset = isTopViewRef.current
                ? Cartesian3.fromDegrees(longitude, latitude, altitude + 800)
                : Cartesian3.fromDegrees(longitude, latitude - 0.075, altitude + 300);

            viewer.camera.flyTo({ destination: offset, orientation, duration: 1.5 });
        }
    };

    return {
        viewerRef,
        isSideView,
        addMap,
        addExtMap,
        addEntity,
        flyHome,
        toggleCameraView,
    };
}