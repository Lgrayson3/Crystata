import { useStore } from '@nanostores/react';
import { $depthLevel, $activePlanetId, navigateToCosmos } from '../stores/navigation';

/**
 * Persistent UI overlay that floats above the canvas.
 * Shows breadcrumb-style navigation based on current depth level.
 */
export default function NavigationOverlay() {
  const depth = useStore($depthLevel);
  const planetId = useStore($activePlanetId);

  return (
    <nav
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        padding: '16px 24px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        fontFamily: 'monospace',
        fontSize: '14px',
        color: 'rgba(200, 200, 255, 0.8)',
        zIndex: 100,
        pointerEvents: 'auto',
        background: 'linear-gradient(to bottom, rgba(0,0,0,0.6), transparent)',
      }}
    >
      <a
        href="/"
        onClick={(e) => {
          e.preventDefault();
          navigateToCosmos();
          window.history.pushState({}, '', '/');
        }}
        style={{
          color: depth === 'cosmos' ? '#7B68EE' : 'rgba(200, 200, 255, 0.6)',
          textDecoration: 'none',
          cursor: 'pointer',
        }}
      >
        Cosmos
      </a>

      {planetId && (
        <>
          <span style={{ opacity: 0.4 }}>/</span>
          <a
            href={`/planets/${planetId}`}
            style={{
              color: depth === 'planet' ? '#7B68EE' : 'rgba(200, 200, 255, 0.6)',
              textDecoration: 'none',
            }}
          >
            {planetId}
          </a>
        </>
      )}

      {depth === 'codex' && (
        <>
          <span style={{ opacity: 0.4 }}>/</span>
          <span style={{ color: '#7B68EE' }}>codex</span>
        </>
      )}
    </nav>
  );
}
