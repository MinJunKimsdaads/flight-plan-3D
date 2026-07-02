import CesiumViewer from "./components/cesium/CesiumViewer";
import { useStandaloneAircraft } from "./hooks/useStandaloneAircraft";

function App() {
  const externalFleet = useStandaloneAircraft();
  return (
    <>
      <CesiumViewer externalFleet={externalFleet} />
    </>
  );
}

export default App;
