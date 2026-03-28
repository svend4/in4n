import { useEffect, useRef } from 'react';
import Delaunator from 'delaunator';
import { GROUP_COLORS } from '../data.js';

// Renders Delaunay triangulation terrain on a 2D canvas overlay.
// nodePositions: [{ id, x, y, group }] — updated each frame from ForceGraph3D
export default function TerrainOverlay({ nodePositions, width, height, opacity }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || nodePositions.length < 3) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, width, height);

    // Build Delaunay from projected 2D positions
    const coords = nodePositions.flatMap(n => [n.px, n.py]);
    let del;
    try { del = new Delaunator(coords); } catch { return; }

    const tris = del.triangles;
    for (let i = 0; i < tris.length; i += 3) {
      const a = nodePositions[tris[i]];
      const b = nodePositions[tris[i + 1]];
      const c = nodePositions[tris[i + 2]];
      if (!a || !b || !c) continue;

      // mix group colors of the three vertices
      const colors = [a, b, c].map(n => GROUP_COLORS[n.group] || '#888');
      const avgHue = mixHues(colors);

      ctx.beginPath();
      ctx.moveTo(a.px, a.py);
      ctx.lineTo(b.px, b.py);
      ctx.lineTo(c.px, c.py);
      ctx.closePath();
      ctx.fillStyle = avgHue;
      ctx.fill();
    }
  }, [nodePositions, width, height]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{
        position: 'absolute',
        top: 0, left: 0,
        pointerEvents: 'none',
        opacity: opacity ?? 0.18,
        mixBlendMode: 'screen',
      }}
    />
  );
}

// Parse hex → [r,g,b], average, return rgba string
function mixHues(hexColors) {
  const rgbs = hexColors.map(hexToRgb);
  const r = Math.round(rgbs.reduce((s, c) => s + c[0], 0) / rgbs.length);
  const g = Math.round(rgbs.reduce((s, c) => s + c[1], 0) / rgbs.length);
  const b = Math.round(rgbs.reduce((s, c) => s + c[2], 0) / rgbs.length);
  return `rgba(${r},${g},${b},0.9)`;
}

function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
