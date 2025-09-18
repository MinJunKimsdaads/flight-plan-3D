import { UrlTemplateImageryProvider } from "cesium";

export const addLayer = (viewer,layer) => {
    viewer?.imageryLayers.removeAll();
    const tileLayer = new UrlTemplateImageryProvider({
        ...layer
    });
    viewer.imageryLayers.addImageryProvider(tileLayer);
}