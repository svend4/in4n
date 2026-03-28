import { GROUP_COLORS } from '../data.js';

export default function InfoPanel({ currentNode, targetNode, path, era, onEraChange, maxEra }) {
  const color = currentNode ? GROUP_COLORS[currentNode.group] : '#4fc3f7';

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
      pointerEvents: 'none',
    }}>
      {/* Top-left: current node */}
      <div style={{ position: 'absolute', top: 24, left: 24 }}>
        <div style={{ fontSize: 10, letterSpacing: 3, opacity: 0.35, textTransform: 'uppercase' }}>
          InfoAquarium
        </div>
        <div style={{
          marginTop: 8, fontSize: 28, fontWeight: 'bold',
          color, textShadow: `0 0 24px ${color}88`,
          minHeight: 36,
        }}>
          {currentNode?.id ?? '…'}
        </div>
        {path.length > 1 && (
          <div style={{ marginTop: 4, fontSize: 11, opacity: 0.5, color: '#ccc', maxWidth: 220 }}>
            {path.join(' → ')}
          </div>
        )}
        {targetNode && currentNode?.id !== targetNode.id && (
          <div style={{ marginTop: 6, fontSize: 11, color: '#ffd54f', opacity: 0.8 }}>
            ⟶ цель: {targetNode.id}
          </div>
        )}
      </div>

      {/* Bottom: time slider */}
      <div style={{
        position: 'absolute', bottom: 32, left: '50%',
        transform: 'translateX(-50%)',
        textAlign: 'center',
        pointerEvents: 'all',
      }}>
        <div style={{ fontSize: 10, opacity: 0.4, marginBottom: 6, letterSpacing: 2 }}>
          ВРЕМЕННАя ОСЬ
        </div>
        <input
          type="range" min={1} max={maxEra} step={1}
          value={era}
          onChange={e => onEraChange(+e.target.value)}
          style={{
            width: 260, accentColor: '#4fc3f7',
            cursor: 'pointer',
          }}
        />
        <div style={{ marginTop: 4, fontSize: 13, color: '#4fc3f7', opacity: 0.8 }}>
          Эра {era} / {maxEra}
        </div>
      </div>

      {/* Bottom-right: hint */}
      <div style={{
        position: 'absolute', bottom: 24, right: 24,
        fontSize: 10, opacity: 0.25, textAlign: 'right', lineHeight: 2,
      }}>
        Клик — цель путешественника<br />
        Перетащить — вращение<br />
        Колесо — зум<br />
        Ползунок — время
      </div>
    </div>
  );
}
