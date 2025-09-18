import { createContext, useContext, useState } from "react";
import { Viewer } from "cesium";

type CesiumContextType = {
  cesium: Viewer | null;
  setCesium: (viewer: Viewer) => void;
}

const CesiumContext = createContext<CesiumContextType | undefined>(undefined);

export const CesiumProvider = ({children}:{children: React.ReactNode}) => {
    const [cesium, setCesium] = useState<Viewer | null>(null);
    return(
        <CesiumContext.Provider value={{cesium, setCesium}}>
            {children}
        </CesiumContext.Provider>
    )
}

export const useCesium = () => {
    const ctx = useContext(CesiumContext);
    if(!ctx) throw new Error("useMap must be used within a MapProvide");
    return ctx;
}