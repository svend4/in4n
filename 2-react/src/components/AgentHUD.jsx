import { GROUP_COLORS } from '../data.js';

const AGENT_COLORS = ['#4fc3f7', '#ff6b9d', '#c792ea', '#80cbc4', '#ffd54f'];
const AGENT_NAMES  = ['Ты', 'α', 'β', 'γ', 'δ'];

// Props:
//   agents: [{ id, nodeId, score, color }]
//   gameMode: bool
//   gameTarget: nodeId | null
export default function AgentHUD({ agents, gameMode, gameTarget, currentNodeId }) {
  return (
    <div style={{
      position: 'absolute',
      top: 20, right: 20,
      pointerEvents: 'none',
      fontFamily: 'monospace',
      fontSize: 11,
    }}>
      {/* Agent scores */}
      <div style={{ marginBottom: 10 }}>
        {agents.map((ag, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            marginBottom: 3, justifyContent: 'flex-end',
            opacity: ag.color === agents[0].color ? 1 : 0.7,
          }}>
            <span style={{ opacity: 0.5 }}>{AGENT_NAMES[i]}</span>
            <div style={{
              width: 8, height: 8, borderRadius: '50%',
              background: ag.color,
              boxShadow: `0 0 6px ${ag.color}`,
            }} />
            <span style={{ color: ag.color, fontWeight: 'bold', minWidth: 18, textAlign: 'right' }}>
              {ag.score}
            </span>
          </div>
        ))}
      </div>

      {/* Game target indicator */}
      {gameMode && gameTarget && (
        <div style={{
          background: 'rgba(7,7,20,0.8)',
          border: '1px solid #ffd54f44',
          borderRadius: 6,
          padding: '5px 10px',
          textAlign: 'right',
          fontSize: 10,
        }}>
          <div style={{ opacity: 0.4, letterSpacing: 2, marginBottom: 2 }}>ЦЕЛЬ</div>
          <div style={{ color: '#ffd54f', fontWeight: 'bold', fontSize: 13 }}>
            {gameTarget}
          </div>
        </div>
      )}
    </div>
  );
}
