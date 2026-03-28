import { GROUP_COLORS } from '../data.js';

// Semantic zoom popup: appears when camera is close to a node.
// Props:
//   nearNode   — { id, group, px, py, distToCamera } | null
//   nodeDetails — Map<id, { description, linkCount }>
export default function SemanticZoom({ nearNode, nodeDetails }) {
  if (!nearNode) return null;

  const color  = GROUP_COLORS[nearNode.group] || '#4fc3f7';
  const detail = nodeDetails?.get(nearNode.id) || {};
  const alpha  = Math.min(1, Math.max(0, 1 - nearNode.distToCamera / 120));

  return (
    <div style={{
      position: 'absolute',
      left: nearNode.px + 20,
      top:  nearNode.py - 40,
      pointerEvents: 'none',
      opacity: alpha,
      transition: 'opacity 0.2s',
      zIndex: 20,
    }}>
      {/* Card */}
      <div style={{
        background: 'rgba(7,7,20,0.88)',
        border: `1px solid ${color}55`,
        borderRadius: 8,
        padding: '10px 14px',
        minWidth: 160,
        maxWidth: 240,
        boxShadow: `0 0 24px ${color}33`,
        backdropFilter: 'blur(8px)',
      }}>
        {/* Node name */}
        <div style={{
          fontSize: 15, fontWeight: 'bold', color,
          textShadow: `0 0 12px ${color}88`,
          marginBottom: 5,
        }}>
          {nearNode.id}
        </div>

        {/* Link count bar */}
        {detail.linkCount !== undefined && (
          <div style={{ marginBottom: 6 }}>
            <div style={{ fontSize: 9, opacity: 0.4, letterSpacing: 2, marginBottom: 3 }}>
              СВЯЗЕЙ
            </div>
            <div style={{ display: 'flex', gap: 2 }}>
              {Array.from({ length: Math.min(detail.linkCount, 10) }).map((_, j) => (
                <div key={j} style={{
                  width: 6, height: 6, borderRadius: 1,
                  background: color, opacity: 0.6 + j * 0.03,
                }} />
              ))}
            </div>
          </div>
        )}

        {/* Description */}
        {detail.description && (
          <div style={{
            fontSize: 11, color: '#aac', lineHeight: 1.5,
            opacity: 0.8,
          }}>
            {detail.description}
          </div>
        )}

        {/* Height / relief indicator */}
        {detail.relief !== undefined && (
          <div style={{
            marginTop: 6, fontSize: 9, opacity: 0.35,
            letterSpacing: 1,
          }}>
            {'▲'.repeat(Math.min(Math.round(detail.relief / 10), 5))} высота {detail.relief.toFixed(0)}
          </div>
        )}
      </div>
      {/* Arrow pointing to node */}
      <div style={{
        width: 0, height: 0,
        borderTop: `6px solid ${color}44`,
        borderRight: '6px solid transparent',
        marginLeft: 8,
      }} />
    </div>
  );
}
