import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { useStore } from '@nanostores/react';
import gsap from 'gsap';
import * as THREE from 'three';
import { $activePlanetPosition, $depthLevel } from '../stores/navigation';

/**
 * GSAP-driven camera controller that transitions between
 * the macro cosmos view and planetary orbit view.
 *
 * Disables OrbitControls during transitions to prevent
 * conflicting camera mutations (see blueprint §2.3).
 */
export default function CosmosCamera() {
  const { camera } = useThree();
  const depthLevel = useStore($depthLevel);
  const targetPos = useStore($activePlanetPosition);
  const tweenRef = useRef<gsap.core.Tween | null>(null);

  useEffect(() => {
    // Kill any in-flight tween before starting a new one
    tweenRef.current?.kill();

    if (depthLevel === 'cosmos') {
      // Pull back to the wide stellar overview
      tweenRef.current = gsap.to(camera.position, {
        x: 0,
        y: 20,
        z: 80,
        duration: 2.5,
        ease: 'power3.inOut',
        onUpdate: () => {
          camera.lookAt(0, 0, 0);
        },
      });
    } else if (depthLevel === 'planet') {
      // Fly to the selected planet's orbital offset
      const offset = new THREE.Vector3(
        targetPos.x,
        targetPos.y + 5,
        targetPos.z + 20,
      );

      tweenRef.current = gsap.to(camera.position, {
        x: offset.x,
        y: offset.y,
        z: offset.z,
        duration: 2.5,
        ease: 'power3.inOut',
        onUpdate: () => {
          camera.lookAt(targetPos.x, targetPos.y, targetPos.z);
        },
      });
    }

    return () => {
      tweenRef.current?.kill();
    };
  }, [depthLevel, targetPos, camera]);

  return null;
}
