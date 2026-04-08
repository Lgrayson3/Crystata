import { useEffect, useRef, useCallback } from 'react';
import * as d3 from 'd3';

interface MapRegion {
  id: string;
  name: string;
  x: number;
  y: number;
}

interface MapViewProps {
  planetName: string;
  regions: MapRegion[];
}

/**
 * Hybrid Canvas/SVG map with D3-driven pan & zoom.
 *
 * - Canvas (base): renders the heavy terrain/background
 * - SVG (overlay): lightweight interactive hitboxes for regions
 *
 * Both layers receive the same D3 transform matrix to stay
 * in perfect registration (see blueprint §3.1–3.2).
 */
export default function MapView({ planetName, regions }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const drawBaseMap = useCallback(
    (ctx: CanvasRenderingContext2D, width: number, height: number) => {
      // Background gradient representing planetary terrain
      const gradient = ctx.createRadialGradient(
        width / 2, height / 2, 50,
        width / 2, height / 2, Math.max(width, height) / 2,
      );
      gradient.addColorStop(0, '#1a1a2e');
      gradient.addColorStop(0.5, '#16213e');
      gradient.addColorStop(1, '#0f0f23');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);

      // Grid lines for cartographic feel
      ctx.strokeStyle = 'rgba(100, 140, 200, 0.08)';
      ctx.lineWidth = 1;
      for (let x = 0; x < width; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y < height; y += 40) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // Region markers on canvas layer
      ctx.fillStyle = 'rgba(123, 104, 238, 0.15)';
      for (const region of regions) {
        ctx.beginPath();
        ctx.arc(region.x, region.y, 30, 0, Math.PI * 2);
        ctx.fill();
      }
    },
    [regions],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    const svg = svgRef.current;
    const container = containerRef.current;
    if (!canvas || !svg || !container) return;

    const width = container.clientWidth;
    const height = container.clientHeight;
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d')!;
    drawBaseMap(ctx, width, height);

    // D3 zoom behavior applied to the container
    const zoom = d3.zoom<HTMLDivElement, unknown>()
      .scaleExtent([0.5, 8])
      .on('zoom', (event) => {
        const { transform } = event;

        // Update SVG interactive layer
        d3.select(svg)
          .select<SVGGElement>('g.interactive-layer')
          .attr('transform', transform.toString());

        // Redraw canvas with transform
        ctx.save();
        ctx.clearRect(0, 0, width, height);
        ctx.translate(transform.x, transform.y);
        ctx.scale(transform.k, transform.k);
        drawBaseMap(ctx, width, height);
        ctx.restore();
      });

    d3.select(container).call(zoom);

    return () => {
      d3.select(container).on('.zoom', null);
    };
  }, [drawBaseMap]);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        width: '100%',
        height: '500px',
        borderRadius: '8px',
        overflow: 'hidden',
        border: '1px solid rgba(123, 104, 238, 0.3)',
      }}
    >
      {/* Canvas base layer — heavy rendering */}
      <canvas
        ref={canvasRef}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      />

      {/* SVG overlay — lightweight interactive hitboxes */}
      <svg
        ref={svgRef}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      >
        <g className="interactive-layer">
          {regions.map((region) => (
            <g key={region.id}>
              {/* Invisible hit area */}
              <circle
                cx={region.x}
                cy={region.y}
                r={25}
                fill="transparent"
                stroke="rgba(123, 104, 238, 0.6)"
                strokeWidth={2}
                style={{ cursor: 'pointer' }}
                onClick={() => {
                  window.location.href = `/codex/regions/${region.id}`;
                }}
              />
              {/* Region label */}
              <text
                x={region.x}
                y={region.y - 32}
                textAnchor="middle"
                fill="rgba(200, 200, 255, 0.9)"
                fontSize="12"
                fontFamily="monospace"
              >
                {region.name}
              </text>
            </g>
          ))}
        </g>
      </svg>

      {/* Map title overlay */}
      <div
        style={{
          position: 'absolute',
          top: '12px',
          left: '16px',
          color: 'rgba(200, 200, 255, 0.8)',
          fontFamily: 'monospace',
          fontSize: '14px',
          pointerEvents: 'none',
        }}
      >
        ◈ {planetName} — Regional Map
      </div>
    </div>
  );
}
