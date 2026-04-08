import { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import type { Mesh } from 'three';
import { navigateToPlanet } from '../stores/navigation';

interface PlanetNodeProps {
  id: string;
  name: string;
  position: [number, number, number];
  radius: number;
  color: string;
}

/**
 * Interactive planet mesh within the 3D cosmos.
 * Clicking navigates the camera to orbit this planet.
 */
export default function PlanetNode({ id, name, position, radius, color }: PlanetNodeProps) {
  const meshRef = useRef<Mesh>(null);
  const [hovered, setHovered] = useState(false);

  // Slow rotation for visual interest
  useFrame((_, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.15;
    }
  });

  function handleClick() {
    navigateToPlanet(id, { x: position[0], y: position[1], z: position[2] });
  }

  return (
    <group position={position}>
      <mesh
        ref={meshRef}
        onClick={handleClick}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
        scale={hovered ? 1.1 : 1}
      >
        <sphereGeometry args={[radius, 32, 32]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={hovered ? 0.4 : 0.15}
          roughness={0.6}
        />
      </mesh>

      {/* Planet label floating above */}
      <Text
        position={[0, radius + 2, 0]}
        fontSize={1.5}
        color="white"
        anchorX="center"
        anchorY="bottom"
        font={undefined}
      >
        {name}
      </Text>
    </group>
  );
}
