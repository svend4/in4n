/**
 * useInfoM — React hook for InfoM GraphRAG API integration.
 *
 * Endpoints used:
 *   GET  /           → status + graph stats
 *   POST /query      → GraphRAG query (local | global | hybrid)
 *   POST /index      → index text into graph
 *   GET  /stats      → detailed stats (ASCII)
 *   POST /reset      → clear graph
 *   POST /build      → rebuild communities
 *
 * Community → archetype mapping (by index % 4):
 *   0 → Бытие     (time  / pink)
 *   1 → Поток     (space / blue)
 *   2 → Познание  (mind  / purple)
 *   3 → Структура (form  / teal)
 */
import { useState, useCallback, useRef } from 'react';

export const INFOM_DEFAULT_URL = 'http://localhost:8000';

// Community index → in4n archetype node id
export const COMMUNITY_TO_ARCHETYPE = ['Бытие', 'Поток', 'Познание', 'Структура'];

// Geometric shape symbols from pipeline.py
export const SHAPE_SYMBOLS = { 3:'△', 4:'□', 5:'⬠', 6:'⬡', 7:'☆', 8:'✳' };
export function shapeSymbol(n) { return n >= 9 ? '∿' : (SHAPE_SYMBOLS[n] ?? '◆'); }

// Parse infom stats text to extract community count & modularity
function parseStatsText(text) {
  const communities = [];
  const lines = text.split('\n');
  lines.forEach(line => {
    // match lines like: [hexagon    ] Neural Networks (Q6=hex_3, nodes=6)
    const m = line.match(/\[([^\]]+)\]\s+(.+?)\s+\(Q6=(\S+),\s*nodes=(\d+)\)/);
    if (m) communities.push({
      shape:   m[1].trim(),
      label:   m[2].trim(),
      hex_id:  m[3],
      n_nodes: parseInt(m[4]),
    });
  });
  return communities;
}

export function useInfoM(initialUrl = INFOM_DEFAULT_URL) {
  const [url,       setUrl]       = useState(initialUrl);
  const [status,    setStatus]    = useState('disconnected'); // disconnected|connecting|connected|error
  const [graphInfo, setGraphInfo] = useState(null);   // { nodes, edges, communities, modularity }
  const [communities, setCommunities] = useState([]); // parsed community objects
  const [lastAnswer,  setLastAnswer]  = useState(null);
  const [indexing,    setIndexing]    = useState(false);
  const abortRef = useRef(null);

  // ── Connect ──────────────────────────────────────────────────────────────
  const connect = useCallback(async (targetUrl) => {
    const u = targetUrl ?? url;
    setUrl(u);
    setStatus('connecting');
    try {
      abortRef.current?.abort();
      abortRef.current = new AbortController();
      const res  = await fetch(`${u}/`, { signal: abortRef.current.signal });
      const data = await res.json();
      setGraphInfo(data.graph);
      setStatus('connected');

      // Also fetch detailed stats to get community list
      try {
        const sr   = await fetch(`${u}/stats`);
        const sd   = await sr.json();
        const comms = parseStatsText(sd.result ?? '');
        setCommunities(comms);
      } catch { /* stats optional */ }

      return data;
    } catch (e) {
      if (e.name !== 'AbortError') setStatus('error');
      throw e;
    }
  }, [url]);

  const disconnect = useCallback(() => {
    abortRef.current?.abort();
    setStatus('disconnected');
    setGraphInfo(null);
    setCommunities([]);
    setLastAnswer(null);
  }, []);

  // ── Query ─────────────────────────────────────────────────────────────────
  const query = useCallback(async (question, mode = 'hybrid') => {
    const res = await fetch(`${url}/query`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ question, mode }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail ?? `HTTP ${res.status}`);
    }
    const data = await res.json();

    // Heuristic: find which archetype the answer relates to
    // by looking for concept keywords in result text
    const result = data.result ?? '';
    const archetypeHint = detectArchetype(question + ' ' + result);

    const answer = { question, mode, result, archetypeHint, ts: Date.now() };
    setLastAnswer(answer);

    // Refresh graph info
    try {
      const gr = await fetch(`${url}/`);
      const gd = await gr.json();
      setGraphInfo(gd.graph);
    } catch { /* non-critical */ }

    return answer;
  }, [url]);

  // ── Index text ────────────────────────────────────────────────────────────
  const indexText = useCallback(async (text, reset = false) => {
    setIndexing(true);
    try {
      const res  = await fetch(`${url}/index`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ text, reset }),
      });
      const data = await res.json();
      // Rebuild communities after indexing
      await fetch(`${url}/build`, { method: 'POST' });
      // Refresh
      const gr   = await fetch(`${url}/`);
      const gd   = await gr.json();
      setGraphInfo(gd.graph);
      try {
        const sr  = await fetch(`${url}/stats`);
        const sd  = await sr.json();
        setCommunities(parseStatsText(sd.result ?? ''));
      } catch { /* optional */ }
      return data.result;
    } finally {
      setIndexing(false);
    }
  }, [url]);

  const reset = useCallback(async () => {
    await fetch(`${url}/reset`, { method: 'POST' });
    setGraphInfo(null);
    setCommunities([]);
    setLastAnswer(null);
  }, [url]);

  return {
    url, setUrl,
    status, graphInfo, communities, lastAnswer, indexing,
    connect, disconnect, query, indexText, reset,
  };
}

// ── Archetype detection heuristic ─────────────────────────────────────────
// Maps keywords in query/answer to archetype groups
const ARCHETYPE_KEYWORDS = {
  Бытие:     ['время','история','хронология','дата','период','эпоха','начало','конец','прошлое','будущее','now','time','era'],
  Поток:     ['пространство','место','расположение','движение','путь','маршрут','навигация','space','path','location'],
  Познание:  ['знание','смысл','понимание','концепция','идея','мысль','анализ','memory','knowledge','mind','concept'],
  Структура: ['форма','структура','граница','число','связь','сеть','архитектура','form','structure','network','graph'],
};

export function detectArchetype(text) {
  const lower = text.toLowerCase();
  let best = null, bestCount = 0;
  for (const [arch, keywords] of Object.entries(ARCHETYPE_KEYWORDS)) {
    const count = keywords.reduce((n, kw) => n + (lower.includes(kw) ? 1 : 0), 0);
    if (count > bestCount) { bestCount = count; best = arch; }
  }
  return best ?? 'Познание'; // default to Познание
}
