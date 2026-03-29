/**
 * Q6Overlay — hexagonal grid visualization of InfoM Q6 semantic space.
 *
 * Renders a semi-transparent hexagonal grid over the 3D graph.
 * Each cell corresponds to one of 64 Q6 positions (6-bit hex space).
 * Communities from infom are mapped to cells and colored by group.
 *
 * Geometric shapes (from InfoM pipeline.py):
 *   △ triangle (3)   □ rectangle (4)   ⬠ pentagon (5)
 *   ⬡ hexagon  (6)   ☆ heptagram (7)   ✳ octagram (8)   ∿ fractal (9+)
 */
import { useRef, useEffect, useCallback } from 'react';
import { GROUP_COLORS } from '../data.js';
import { shapeSymbol, COMMUNITY_TO_ARCHETYPE } from '../hooks/useInfoM.js';

// ── Hex math (flat-top orientation) ──────────────────────────────────────────
function hexToPixel(q, r, size) {
  return {
    x: size * Math.sqrt(3) * (q + r / 2),
    y: size * (3 / 2) * r,
  };
}

function hexCorners(cx, cy, size) {
  return Array.from({ length: 6 }, (_, i) => {
    const a = Math.PI / 3 * i + Math.PI / 6; // pointy-top
    return [cx + size * Math.cos(a), cy + size * Math.sin(a)];
  });
}

// Q6: hex_id 0-63 → axial (q, r) centered at origin
function hexIdToAxial(id) {
  const col = id % 8, row = Math.floor(id / 8);
  return { q: col - 3.5, r: row - 3.5 };
}

// Parse Q6 hex_id string (e.g. "hex_3" → 3, "101010" → 42, "3" → 3)
function parseHexId(hex_id) {
  if (!hex_id) return null;
  const m = hex_id.match(/(\d+)$/);
  if (m) return parseInt(m[1]) % 64;
  // try binary
  if (/^[01]+$/.test(hex_id)) return parseInt(hex_id, 2) % 64;
  return null;
}

// Group color as [r,g,b]
const GROUP_RGB = {
  time:  [255, 107, 157],
  space: [ 79, 195, 247],
  mind:  [199, 146, 234],
  form:  [128, 203, 196],
};

export default function Q6Overlay({ width, height, communities = [], activeArchetype = null, frame = 0 }) {
  const canvasRef = useRef();

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, width, height);

    const HEX_SIZE = Math.min(width, height) * 0.042; // responsive hex size
    const cx = width  * 0.5;
    const cy = height * 0.5;
    const t  = frame * 0.02;

    // ── Draw all 64 cells (background grid) ────────────────────────────
    for (let id = 0; id < 64; id++) {
      const { q, r } = hexIdToAxial(id);
      const { x, y } = hexToPixel(q, r, HEX_SIZE);
      const px = cx + x, py = cy + y;
      const corners = hexCorners(px, py, HEX_SIZE * 0.92);

      ctx.beginPath();
      ctx.moveTo(...corners[0]);
      corners.slice(1).forEach(c => ctx.lineTo(...c));
      ctx.closePath();
      ctx.strokeStyle = 'rgba(79,195,247,0.06)';
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }

    // ── Draw community cells (colored) ─────────────────────────────────
    communities.forEach((comm, i) => {
      const archId    = i % 4;
      const archName  = COMMUNITY_TO_ARCHETYPE[archId];
      const groupKey  = ['time', 'space', 'mind', 'form'][archId];
      const [r, g, b] = GROUP_RGB[groupKey] ?? [79, 195, 247];
      const isActive  = activeArchetype === archName;

      const hexId = parseHexId(comm.hex_id);
      if (hexId === null) return;

      const { q, r: rowR } = hexIdToAxial(hexId);
      const { x, y }       = hexToPixel(q, rowR, HEX_SIZE);
      const px = cx + x, py = cy + y;
      const corners = hexCorners(px, py, HEX_SIZE * 0.88);

      const pulse = isActive
        ? 0.25 + 0.15 * Math.sin(t * 3)
        : 0.08 + 0.03 * Math.sin(t + i * 0.8);

      // Fill
      ctx.beginPath();
      ctx.moveTo(...corners[0]);
      corners.slice(1).forEach(c => ctx.lineTo(...c));
      ctx.closePath();
      ctx.fillStyle = `rgba(${r},${g},${b},${pulse})`;
      ctx.fill();

      // Border
      ctx.strokeStyle = isActive
        ? `rgba(${r},${g},${b},0.8)`
        : `rgba(${r},${g},${b},0.3)`;
      ctx.lineWidth = isActive ? 2 : 0.8;
      ctx.stroke();

      // Glow for active
      if (isActive) {
        ctx.save();
        ctx.shadowColor = `rgb(${r},${g},${b})`;
        ctx.shadowBlur  = 18;
        ctx.stroke();
        ctx.restore();
      }

      // Shape symbol
      const sym  = shapeSymbol(comm.n_nodes ?? 6);
      const symSz = HEX_SIZE * 0.52;
      ctx.fillStyle = isActive
        ? `rgba(${r},${g},${b},0.95)`
        : `rgba(${r},${g},${b},0.55)`;
      ctx.font = `${symSz}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(sym, px, py);

      // Community label (below symbol, small)
      if (comm.label && HEX_SIZE > 22) {
        ctx.fillStyle = `rgba(${r},${g},${b},${isActive ? 0.9 : 0.4})`;
        ctx.font = `${Math.max(7, HEX_SIZE * 0.28)}px monospace`;
        ctx.fillText(
          comm.label.slice(0, 8),
          px, py + HEX_SIZE * 0.55,
        );
      }
    });

    // ── If no communities yet: show placeholder grid with archetype labels ─
    if (communities.length === 0) {
      const DEMO = [
        { id: 18, arch: 'Бытие',     group: 'time'  },
        { id: 21, arch: 'Поток',     group: 'space' },
        { id: 42, arch: 'Познание',  group: 'mind'  },
        { id: 45, arch: 'Структура', group: 'form'  },
      ];
      DEMO.forEach(({ id, arch, group }) => {
        const [r, g, b] = GROUP_RGB[group];
        const isActive  = activeArchetype === arch;
        const { q, r: rowR } = hexIdToAxial(id);
        const { x, y }       = hexToPixel(q, rowR, HEX_SIZE);
        const px = cx + x, py = cy + y;
        const corners = hexCorners(px, py, HEX_SIZE * 0.88);
        const pulse = isActive
          ? 0.2 + 0.1 * Math.sin(t * 3)
          : 0.07 + 0.02 * Math.sin(t + id * 0.5);

        ctx.beginPath();
        ctx.moveTo(...corners[0]);
        corners.slice(1).forEach(c => ctx.lineTo(...c));
        ctx.closePath();
        ctx.fillStyle = `rgba(${r},${g},${b},${pulse})`;
        ctx.fill();
        ctx.strokeStyle = isActive
          ? `rgba(${r},${g},${b},0.7)`
          : `rgba(${r},${g},${b},0.25)`;
        ctx.lineWidth = isActive ? 1.5 : 0.7;
        ctx.stroke();

        ctx.fillStyle = `rgba(${r},${g},${b},${isActive ? 0.95 : 0.5})`;
        ctx.font = `${HEX_SIZE * 0.32}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(arch, px, py);
      });
    }

    // ── Corner label ──────────────────────────────────────────────────────
    ctx.fillStyle = 'rgba(79,195,247,0.2)';
    ctx.font = '9px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('Q6 · 64 CELLS · 6D HEX SPACE', 12, 12);
  }, [width, height, communities, activeArchetype, frame]);

  useEffect(() => { draw(); }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{
        position: 'absolute', inset: 0,
        pointerEvents: 'none',
        zIndex: 3,
      }}
    />
  );
}
