import { Canvas } from '@react-three/fiber';
import { Stars } from '@react-three/drei';
import { useStore } from '@nanostores/react';
import PlanetNode from './PlanetNode';
import CosmosCamera from './CosmosCamera';
import { $canvasVisible } from '../stores/navigation';

/**
 * Planet data is hardcoded here to match the content collection entries.
 * In production, this would be injected as serialized props from Astro's
 * getStaticPaths or fetched from a shared JSON manifest at build time.
 */
const PLANETS = [
  {
    id: 'aethermoor',
    name: 'Aethermoor',
    position: [0, 0, 0] as [number, number, number],
    radius: 8,
    color: '#7B68EE',
  },
  {
    id: 'vorrenth',
    name: 'Vorrenth',
    position: [40, -10, 15] as [number, number, number],
    radius: 6,
    color: '#CD853F',
  },
];

/**
 * The persistent R3F canvas that renders the 3D cosmos.
 * Wrapped in transition:persist on the Astro side so the WebGL
 * context survives client-side navigation.
 */
export default function CosmosScene() {
  const visible = useStore($canvasVisible);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: visible ? 1 : -1,
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.5s ease',
        pointerEvents: visible ? 'auto' : 'none',
      }}
    >
      <Canvas
        camera={{ position: [0, 20, 80], fov: 60 }}
        gl={{ antialias: true, alpha: true }}
      >
        {/* Lighting */}
        <ambientLight intensity={0.3} />
        <pointLight position={[50, 50, 50]} intensity={1.5} />
        <pointLight position={[-30, -20, -40]} intensity={0.5} color="#4488ff" />

        {/* Starfield backdrop */}
        <Stars radius={200} depth={100} count={3000} factor={4} fade speed={0.5} />

        {/* Planet nodes from the knowledge graph */}
        {PLANETS.map((planet) => (
          <PlanetNode key={planet.id} {...planet} />
        ))}

        {/* GSAP-driven camera controller */}
        <CosmosCamera />
      </Canvas>
    </div>
  );
}
