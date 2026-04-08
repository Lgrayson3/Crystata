/**
 * Shared Navigation State (Nanostores)
 *
 * Framework-agnostic stores that synchronize navigation depth
 * between the R3F cosmos island, map overlays, and Astro pages.
 */

import { atom, map } from 'nanostores';

/** The three navigation depth levels of the codex */
export type DepthLevel = 'cosmos' | 'planet' | 'codex';

/** Current navigation depth — drives camera behavior and UI chrome */
export const $depthLevel = atom<DepthLevel>('cosmos');

/** ID of the currently focused planet (null when viewing full cosmos) */
export const $activePlanetId = atom<string | null>(null);

/** 3D position the camera should target when focusing a planet */
export const $activePlanetPosition = map<{ x: number; y: number; z: number }>({
  x: 0,
  y: 0,
  z: 0,
});

/** ID of the currently viewed codex entry */
export const $activeEntryId = atom<string | null>(null);

/** Whether the 3D canvas should be visible */
export const $canvasVisible = atom<boolean>(true);

// ─── Actions ────────────────────────────────────────────────────

export function navigateToPlanet(id: string, position: { x: number; y: number; z: number }) {
  $activePlanetId.set(id);
  $activePlanetPosition.set(position);
  $depthLevel.set('planet');
  $canvasVisible.set(true);
}

export function navigateToCosmos() {
  $activePlanetId.set(null);
  $depthLevel.set('cosmos');
  $canvasVisible.set(true);
}

export function navigateToCodex(entryId: string) {
  $activeEntryId.set(entryId);
  $depthLevel.set('codex');
  // Canvas remains persistent but may be visually hidden
  $canvasVisible.set(false);
}
