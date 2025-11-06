import { useState } from "react";
import { Header } from "../components/Header";
import { World, type GlobeConfig, type Position } from "../components/ui/globe";

// Sample data for the globe arcs
const sampleData: Position[] = [
  {
    order: 1,
    startLat: 28.6139,
    startLng: 77.2090,
    endLat: 40.7128,
    endLng: -74.0060,
    arcAlt: 0.1,
    color: "#C7A869",
  },
  {
    order: 2,
    startLat: 51.5074,
    startLng: -0.1278,
    endLat: 40.7128,
    endLng: -74.0060,
    arcAlt: 0.2,
    color: "#C7A869",
  },
  {
    order: 3,
    startLat: 35.6762,
    startLng: 139.6503,
    endLat: 40.7128,
    endLng: -74.0060,
    arcAlt: 0.3,
    color: "#C7A869",
  },
];

const globeConfig: GlobeConfig = {
  pointSize: 4,
  globeColor: "#062056",
  showAtmosphere: true,
  atmosphereColor: "#FFFFFF",
  atmosphereAltitude: 0.1,
  emissive: "#062056",
  emissiveIntensity: 0.1,
  shininess: 0.9,
  arcTime: 1000,
  arcLength: 0.9,
  rings: 1,
  maxRings: 3,
  initialPosition: { lat: 0, lng: 0 },
  autoRotate: true,
  autoRotateSpeed: 0.5,
  polygonColor: "rgba(255,255,255,0.7)",
  ambientLight: "#38bdf8",
  directionalLeftLight: "#ffffff",
  directionalTopLight: "#ffffff",
  pointLight: "#ffffff",
};

export default function GlobePage() {
  const [globeData] = useState<Position[]>(sampleData);

  return (
    <div className="container">
      <Header />
      
      <div style={{ marginTop: 20, marginBottom: 20 }}>
        <h1 className="h1">Global Network</h1>
        <p className="sub text-sm" style={{ marginTop: 8 }}>
          Interactive 3D globe visualization of global connections
        </p>
      </div>

      <div
        style={{
          width: "100%",
          height: "600px",
          position: "relative",
          borderRadius: "12px",
          overflow: "hidden",
          border: "1px solid var(--border)",
          background: "var(--card)",
        }}
      >
        <World globeConfig={globeConfig} data={globeData} />
      </div>

      <div className="spacer-24" />
    </div>
  );
}

