import { useState } from 'react';
import { GROUP_COLORS } from '../data.js';

const STATUS_COLOR = {
  disconnected: '#556',
  connecting:   '#ffd54f',
  connected:    '#80cbc4',
  error:        '#ff6b6b',
};
const STATUS_ICON = {
  disconnected: '○',
  connecting:   '◌',
  connected:    '●',
  error:        '✕',
};

export default function InfoPanel({
  currentNode, targetNode, path, era, onEraChange, maxEra,
  infom = null, q6Mode = false, onToggleQ6 = null,
}) {
  const color = currentNode ? GROUP_COLORS[currentNode.group] : '#4fc3f7';
  const [showConnect, setShowConnect] = useState(false);
  const [urlInput,    setUrlInput]    = useState('http://localhost:8000');
  const [indexText,   setIndexText]   = useState('');
  const [indexing,    setIndexing]    = useState(false);
  const [indexMsg,    setIndexMsg]    = useState('');

  const status    = infom?.status ?? 'disconnected';
  const graphInfo = infom?.graphInfo;

  async function handleConnect() {
    try { await infom?.connect(urlInput); }
    catch { /* status updated in hook */ }
  }

  async function handleIndex() {
    if (!indexText.trim() || indexing) return;
    setIndexing(true);
    setIndexMsg('');
    try {
      await infom?.indexText(indexText.trim(), false);
      setIndexMsg(`Проиндексировано. Узлов: ${infom?.graphInfo?.nodes ?? '?'}`);
      setIndexText('');
    } catch (e) {
      setIndexMsg(`Ошибка: ${e.message}`);
    } finally {
      setIndexing(false);
    }
  }

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
      pointerEvents: 'none',
    }}>
      {/* ── Top-left: current node ── */}
      <div style={{ position: 'absolute', top: 24, left: 24 }}>
        <div style={{ fontSize: 10, letterSpacing: 3, opacity: 0.35, textTransform: 'uppercase' }}>
          InfoAquarium
        </div>
        <div style={{
          marginTop: 8, fontSize: 28, fontWeight: 'bold',
          color, textShadow: `0 0 24px ${color}88`, minHeight: 36,
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
        <div style={{ marginTop: 12, fontSize: 9, opacity: 0.2, lineHeight: 1.8, letterSpacing: 1 }}>
          V воронои · Q Q6-сетка · / запрос · H гиперб.
        </div>
      </div>

      {/* ── Top-right: InfoM connection panel ── */}
      <div style={{
        position: 'absolute', top: 20, right: 20,
        fontFamily: 'monospace', pointerEvents: 'all',
      }}>
        {/* Connection badge */}
        <div
          onClick={() => setShowConnect(v => !v)}
          style={{
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '5px 12px', borderRadius: 20, cursor: 'pointer',
            background: 'rgba(7,7,20,0.85)',
            border: `1px solid ${STATUS_COLOR[status]}44`,
            transition: 'all 0.2s', userSelect: 'none',
          }}
        >
          <span style={{ color: STATUS_COLOR[status], fontSize: 10 }}>
            {STATUS_ICON[status]}
          </span>
          <span style={{ fontSize: 9, letterSpacing: 1, color: STATUS_COLOR[status] }}>
            INFOM
          </span>
          {graphInfo && (
            <span style={{ fontSize: 9, opacity: 0.5, color: '#aaa' }}>
              {graphInfo.nodes}n · {graphInfo.communities}c
            </span>
          )}
          <span style={{ fontSize: 9, opacity: 0.3, marginLeft: 4 }}>
            {showConnect ? '▲' : '▼'}
          </span>
        </div>

        {/* Q6 toggle button */}
        {onToggleQ6 && (
          <div
            onClick={onToggleQ6}
            style={{
              marginTop: 4, padding: '4px 12px', borderRadius: 20,
              cursor: 'pointer', textAlign: 'center',
              background: q6Mode ? 'rgba(128,203,196,0.15)' : 'rgba(7,7,20,0.7)',
              border: `1px solid ${q6Mode ? '#80cbc466' : '#2a2a40'}`,
              fontSize: 9, letterSpacing: 1,
              color: q6Mode ? '#80cbc4' : '#445',
              transition: 'all 0.2s',
            }}
          >
            ⬡ Q6 GRID
          </div>
        )}

        {/* Expanded connect panel */}
        {showConnect && (
          <div style={{
            marginTop: 8, padding: '14px',
            background: 'rgba(7,7,20,0.95)',
            border: '1px solid rgba(79,195,247,0.15)',
            borderRadius: 10, width: 260,
            boxShadow: '0 4px 30px rgba(0,0,0,0.7)',
          }}>
            <div style={{ fontSize: 9, opacity: 0.4, letterSpacing: 1, marginBottom: 5 }}>
              URL СЕРВЕРА
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                value={urlInput}
                onChange={e => setUrlInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleConnect()}
                placeholder="http://localhost:8000"
                style={{
                  flex: 1, background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(79,195,247,0.2)',
                  borderRadius: 6, color: '#ccc',
                  fontFamily: 'monospace', fontSize: 11,
                  padding: '5px 8px', outline: 'none',
                }}
              />
              <button onClick={handleConnect} style={{
                padding: '5px 10px', borderRadius: 6, cursor: 'pointer',
                background: 'rgba(79,195,247,0.15)',
                border: '1px solid #4fc3f744',
                color: '#4fc3f7', fontFamily: 'monospace', fontSize: 10,
              }}>
                {status === 'connecting' ? '◌' : '→'}
              </button>
            </div>

            {graphInfo && (
              <div style={{
                marginTop: 10, padding: '8px',
                background: 'rgba(255,255,255,0.02)',
                borderRadius: 6, fontSize: 10,
              }}>
                {[
                  ['Узлов',       graphInfo.nodes],
                  ['Рёбер',       graphInfo.edges],
                  ['Сообществ',   graphInfo.communities],
                  ['Modularity Q', graphInfo.modularity?.toFixed(3)],
                ].map(([label, val]) => (
                  <div key={label} style={{
                    display: 'flex', justifyContent: 'space-between',
                    padding: '2px 0', borderBottom: '1px solid rgba(255,255,255,0.04)',
                    color: '#889',
                  }}>
                    <span style={{ opacity: 0.6 }}>{label}</span>
                    <span style={{ color: '#4fc3f7' }}>{val ?? '—'}</span>
                  </div>
                ))}
              </div>
            )}

            {status === 'connected' && (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 9, opacity: 0.4, letterSpacing: 1, marginBottom: 5 }}>
                  ИНДЕКСИРОВАТЬ ТЕКСТ
                </div>
                <textarea
                  value={indexText}
                  onChange={e => setIndexText(e.target.value)}
                  placeholder="Вставь текст для индексации..."
                  rows={3}
                  style={{
                    width: '100%', background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(79,195,247,0.15)',
                    borderRadius: 6, color: '#bbb',
                    fontFamily: 'monospace', fontSize: 10,
                    padding: '6px 8px', resize: 'none',
                    outline: 'none', boxSizing: 'border-box',
                  }}
                />
                <button onClick={handleIndex} disabled={!indexText.trim() || indexing} style={{
                  marginTop: 5, width: '100%', padding: '5px',
                  borderRadius: 6, cursor: 'pointer',
                  background: 'rgba(128,203,196,0.12)',
                  border: '1px solid #80cbc444',
                  color: '#80cbc4', fontFamily: 'monospace', fontSize: 10,
                }}>
                  {indexing ? '◌ индексирую...' : '↑ ИНДЕКСИРОВАТЬ'}
                </button>
                {indexMsg && (
                  <div style={{ marginTop: 5, fontSize: 9, color: '#80cbc4', opacity: 0.7 }}>
                    {indexMsg}
                  </div>
                )}
              </div>
            )}

            {status === 'connected' && (
              <button onClick={() => infom?.disconnect?.()} style={{
                marginTop: 8, width: '100%', padding: '4px',
                borderRadius: 6, cursor: 'pointer',
                background: 'transparent',
                border: '1px solid rgba(255,100,100,0.2)',
                color: '#ff6b6b66', fontFamily: 'monospace', fontSize: 9,
              }}>
                отключиться
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Bottom: era slider ── */}
      <div style={{
        position: 'absolute', bottom: 32, left: '50%',
        transform: 'translateX(-50%)',
        textAlign: 'center', pointerEvents: 'all',
      }}>
        <div style={{ fontSize: 10, opacity: 0.4, marginBottom: 6, letterSpacing: 2 }}>
          ВРЕМЕННАя ОСЬ
        </div>
        <input
          type="range" min={1} max={maxEra} step={1} value={era}
          onChange={e => onEraChange(+e.target.value)}
          style={{ width: 260, accentColor: '#4fc3f7', cursor: 'pointer' }}
        />
        <div style={{ marginTop: 4, fontSize: 13, color: '#4fc3f7', opacity: 0.8 }}>
          Эра {era} / {maxEra}
        </div>
      </div>
    </div>
  );
}
