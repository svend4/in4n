/**
 * QueryPanel — overlay query interface for InfoM GraphRAG.
 *
 * Open with / key, close with Escape.
 * Modes: hybrid (default) | local | global
 * Shows answer with typewriter animation.
 * Highlights which archetype answered.
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { COMMUNITY_TO_ARCHETYPE, shapeSymbol } from '../hooks/useInfoM.js';
import { GROUP_COLORS } from '../data.js';

const MODES = ['hybrid', 'local', 'global'];
const MODE_DESC = {
  hybrid: 'Локальный + глобальный контекст',
  local:  'Ближайшие узлы к запросу',
  global: 'Обзор всех сообществ',
};

// Group color for archetype
const ARCHETYPE_GROUP = {
  Бытие:     'time',
  Поток:     'space',
  Познание:  'mind',
  Структура: 'form',
};

export default function QueryPanel({ onQuery, onClose, infomStatus, communities = [] }) {
  const [text,      setText]     = useState('');
  const [mode,      setMode]     = useState('hybrid');
  const [answer,    setAnswer]   = useState(null);  // { result, archetypeHint, mode }
  const [loading,   setLoading]  = useState(false);
  const [displayed, setDisplayed] = useState('');
  const inputRef = useRef();
  const timerRef = useRef();

  // Focus input on mount
  useEffect(() => { inputRef.current?.focus(); }, []);

  // Typewriter effect when answer arrives
  useEffect(() => {
    if (!answer?.result) return;
    clearInterval(timerRef.current);
    let i = 0;
    setDisplayed('');
    timerRef.current = setInterval(() => {
      if (i >= answer.result.length) { clearInterval(timerRef.current); return; }
      i++;
      setDisplayed(answer.result.slice(0, i));
    }, 10);
    return () => clearInterval(timerRef.current);
  }, [answer]);

  // Escape to close
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = useCallback(async () => {
    if (!text.trim() || loading) return;
    setLoading(true);
    setAnswer(null);
    setDisplayed('');
    try {
      const ans = await onQuery(text.trim(), mode);
      setAnswer(ans);
    } catch (e) {
      setAnswer({
        result: `Ошибка: ${e.message}\n\nПроверь, запущен ли infom:\n  python infom_api.py`,
        archetypeHint: null, mode, error: true,
      });
    } finally {
      setLoading(false);
    }
  }, [text, mode, loading, onQuery]);

  const onKeyDown = e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
  };

  const archetypeColor = answer?.archetypeHint
    ? GROUP_COLORS[ARCHETYPE_GROUP[answer.archetypeHint]] ?? '#4fc3f7'
    : '#4fc3f7';

  const disconnected = infomStatus !== 'connected';

  return (
    <div style={{
      position: 'fixed', inset: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(7,7,20,0.75)',
      backdropFilter: 'blur(6px)',
      zIndex: 100,
    }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        width: 640, maxWidth: '92vw',
        background: 'rgba(10,10,28,0.98)',
        border: '1px solid rgba(79,195,247,0.25)',
        borderRadius: 16,
        boxShadow: '0 0 60px rgba(79,195,247,0.12), 0 8px 40px rgba(0,0,0,0.8)',
        fontFamily: 'monospace',
        overflow: 'hidden',
      }}>

        {/* Header */}
        <div style={{
          padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.05)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{ fontSize: 9, letterSpacing: 3, opacity: 0.4, textTransform: 'uppercase' }}>
            InfoM GraphRAG Query
          </span>
          <div style={{
            marginLeft: 'auto', fontSize: 9, letterSpacing: 1,
            padding: '2px 8px', borderRadius: 10,
            background: disconnected ? 'rgba(255,100,100,0.1)' : 'rgba(79,195,247,0.1)',
            color: disconnected ? '#ff6b6b' : '#4fc3f7',
            border: `1px solid ${disconnected ? '#ff6b6b44' : '#4fc3f744'}`,
          }}>
            {infomStatus === 'connecting' ? '◌ подключение' :
             infomStatus === 'connected'  ? '● online' :
             infomStatus === 'error'      ? '✕ ошибка' : '○ отключён'}
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: '#666',
            cursor: 'pointer', fontSize: 16, padding: '0 4px',
          }}>✕</button>
        </div>

        {/* Input */}
        <div style={{ padding: '16px 20px 0' }}>
          <textarea
            ref={inputRef}
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={disconnected
              ? 'Подключи infom: запусти python infom_api.py'
              : 'Задай вопрос графу знаний... (Enter — отправить)'}
            disabled={disconnected}
            rows={2}
            style={{
              width: '100%', background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(79,195,247,0.2)',
              borderRadius: 8, color: '#e8e8ff',
              fontFamily: 'monospace', fontSize: 14,
              padding: '10px 14px', resize: 'none',
              outline: 'none', boxSizing: 'border-box',
              transition: 'border-color 0.2s',
            }}
          />
        </div>

        {/* Mode selector */}
        <div style={{ padding: '10px 20px', display: 'flex', gap: 8, alignItems: 'center' }}>
          {MODES.map(m => (
            <button key={m} onClick={() => setMode(m)} style={{
              padding: '4px 12px', borderRadius: 20, fontSize: 10,
              fontFamily: 'monospace', letterSpacing: 1, cursor: 'pointer',
              background: mode === m ? 'rgba(79,195,247,0.18)' : 'transparent',
              color: mode === m ? '#4fc3f7' : '#556',
              border: `1px solid ${mode === m ? '#4fc3f766' : '#2a2a40'}`,
              transition: 'all 0.15s',
            }}>
              {m.toUpperCase()}
            </button>
          ))}
          <span style={{ fontSize: 10, opacity: 0.3, marginLeft: 4 }}>
            {MODE_DESC[mode]}
          </span>
          <button onClick={submit} disabled={!text.trim() || loading || disconnected}
            style={{
              marginLeft: 'auto', padding: '6px 18px', borderRadius: 8,
              fontFamily: 'monospace', fontSize: 11, cursor: 'pointer',
              background: (!text.trim() || loading || disconnected)
                ? 'rgba(79,195,247,0.05)' : 'rgba(79,195,247,0.2)',
              color: (!text.trim() || loading || disconnected) ? '#334' : '#4fc3f7',
              border: '1px solid #4fc3f744', transition: 'all 0.15s',
            }}>
            {loading ? '◌ запрос...' : 'СПРОСИТЬ ↵'}
          </button>
        </div>

        {/* Answer */}
        {(loading || answer) && (
          <div style={{
            margin: '0 20px 20px',
            background: 'rgba(255,255,255,0.02)',
            border: `1px solid ${answer?.error ? '#ff6b6b33' : archetypeColor + '33'}`,
            borderRadius: 8, overflow: 'hidden',
          }}>
            {/* Archetype header */}
            {answer?.archetypeHint && !answer.error && (
              <div style={{
                padding: '8px 14px',
                borderBottom: `1px solid ${archetypeColor}22`,
                display: 'flex', alignItems: 'center', gap: 8,
                background: archetypeColor + '0a',
              }}>
                <div style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: archetypeColor,
                  boxShadow: `0 0 8px ${archetypeColor}`,
                }} />
                <span style={{ fontSize: 10, color: archetypeColor, letterSpacing: 1 }}>
                  АРХЕТИП: {answer.archetypeHint}
                </span>
                {communities.length > 0 && (
                  <span style={{ fontSize: 10, opacity: 0.4, marginLeft: 'auto' }}>
                    {communities.length} сообществ · modularity {answer.modularity?.toFixed?.(2) ?? '—'}
                  </span>
                )}
              </div>
            )}

            {/* Loading spinner */}
            {loading && (
              <div style={{ padding: '20px', textAlign: 'center', opacity: 0.4 }}>
                <div style={{
                  display: 'inline-block', fontSize: 20,
                  animation: 'spin 1s linear infinite',
                }}>⬡</div>
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
              </div>
            )}

            {/* Answer text with typewriter */}
            {answer && (
              <div style={{
                padding: '14px', fontSize: 13, lineHeight: 1.7,
                color: answer.error ? '#ff9090' : '#ccd',
                maxHeight: 260, overflowY: 'auto',
                whiteSpace: 'pre-wrap',
              }}>
                {displayed}
                {displayed.length < (answer.result?.length ?? 0) && (
                  <span style={{ opacity: 0.6, animation: 'blink 0.8s step-end infinite' }}>▌</span>
                )}
                <style>{`@keyframes blink { 50% { opacity: 0; } }`}</style>
              </div>
            )}

            {/* Community pills */}
            {answer && !answer.error && communities.length > 0 && (
              <div style={{
                padding: '8px 14px 12px', display: 'flex', gap: 6, flexWrap: 'wrap',
                borderTop: '1px solid rgba(255,255,255,0.04)',
              }}>
                {communities.slice(0, 6).map((c, i) => (
                  <div key={i} style={{
                    fontSize: 9, padding: '2px 8px', borderRadius: 10,
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    color: '#889',
                    opacity: COMMUNITY_TO_ARCHETYPE[i % 4] === answer.archetypeHint ? 1 : 0.5,
                  }}>
                    {shapeSymbol(c.n_nodes)} {c.label || `Сообщество ${i+1}`}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Footer hint */}
        {!answer && !loading && (
          <div style={{
            padding: '12px 20px',
            fontSize: 10, opacity: 0.2, textAlign: 'center', letterSpacing: 1,
          }}>
            Enter — отправить · Escape — закрыть · Shift+Enter — новая строка
          </div>
        )}
      </div>
    </div>
  );
}
