import { useRef, useState, useEffect, useCallback } from 'react';
import { ForceGraph3D } from 'react-force-graph';
import * as THREE from 'three';
import { GRAPH_DATA, GROUP_COLORS, TIME_ERAS } from './data.js';
import InfoPanel from './components/InfoPanel.jsx';
import TerrainOverlay from './components/TerrainOverlay.jsx';
import SemanticZoom from './components/SemanticZoom.jsx';
import AgentHUD from './components/AgentHUD.jsx';
import { useAudio } from './hooks/useAudio.js';

const AGENT_COLORS = ['#4fc3f7','#ff6b9d','#c792ea','#80cbc4','#ffd54f'];

// ─── Link counts (for 3D relief) ─────────────────────────────────────────────
const LINK_COUNTS = {};
GRAPH_DATA.links.forEach(l => {
  LINK_COUNTS[l.source] = (LINK_COUNTS[l.source] || 0) + 1;
  LINK_COUNTS[l.target] = (LINK_COUNTS[l.target] || 0) + 1;
});

// Node descriptions for semantic zoom
const NODE_DETAILS = new Map(GRAPH_DATA.nodes.map(n => [n.id, {
  linkCount:   LINK_COUNTS[n.id] || 0,
  relief:      (LINK_COUNTS[n.id] || 0) * 8,
  description: {
    'Время':        'Необратимое измерение бытия',
    'Пространство': 'Протяжённость и расположение',
    'Движение':     'Изменение положения во времени',
    'Память':       'Хранение прошлого опыта',
    'Смысл':        'Значение и интерпретация',
    'Форма':        'Структура и очертание',
    'Связь':        'Отношение между объектами',
    'Поиск':        'Направленное движение к цели',
    'Знание':       'Понятое и усвоенное',
    'Вопрос':       'Открытость к неизвестному',
    'Граница':      'Предел и различение',
    'Путь':         'Маршрут через пространство',
    'Слово':        'Единица языка и смысла',
    'Образ':        'Визуальное представление',
    'Число':        'Абстрактная величина',
  }[n.id] || '',
}]));

// ─── Semantic zoom threshold ──────────────────────────────────────────────────
const ZOOM_THRESHOLD = 80; // world units from camera to node center

// ─── BFS ─────────────────────────────────────────────────────────────────────
function bfsPath(links, start, end) {
  const adj = {};
  links.forEach(({ source, target }) => {
    const s = typeof source === 'object' ? source.id : source;
    const t = typeof target === 'object' ? target.id : target;
    (adj[s] ||= []).push(t);
    (adj[t] ||= []).push(s);
  });
  if (start === end) return [start];
  const visited = new Set([start]);
  const queue   = [[start, [start]]];
  while (queue.length) {
    const [cur, path] = queue.shift();
    for (const nb of (adj[cur] || [])) {
      if (nb === end) return [...path, nb];
      if (!visited.has(nb)) { visited.add(nb); queue.push([nb, [...path, nb]]); }
    }
  }
  return [start];
}

export default function App() {
  const fgRef = useRef();
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });

  const [era,           setEra]          = useState(TIME_ERAS.length);
  const [currentNodeId, setCurrentNodeId] = useState(GRAPH_DATA.nodes[0].id);
  const [targetNodeId,  setTargetNodeId]  = useState(null);
  const [travelPath,    setTravelPath]    = useState([GRAPH_DATA.nodes[0].id]);
  const [nodePositions, setNodePositions] = useState([]);
  const [nearNode,      setNearNode]      = useState(null);   // semantic zoom target

  // Multiple agents (index 0 = primary/player)
  const agentsRef = useRef(
    AGENT_COLORS.map((color, i) => ({
      color,
      from:  GRAPH_DATA.nodes[(i * 3) % GRAPH_DATA.nodes.length].id,
      to:    GRAPH_DATA.nodes[(i * 3 + 1) % GRAPH_DATA.nodes.length].id,
      t:     Math.random(),
      plannedPath: [],
      score: 0,
      speed: 0.008 + i * 0.002,
    }))
  );
  const travelerRef     = useRef(agentsRef.current[0]); // alias for compat
  const travelerMeshRef = useRef(null);
  const agentMeshesRef  = useRef([]);
  const [agentScores, setAgentScores] = useState(AGENT_COLORS.map(() => 0));

  const { playArrival, playScore } = useAudio();

  // ── Filtered graph by era ──
  const activeGroups = TIME_ERAS[Math.min(era, TIME_ERAS.length) - 1].activeGroups;
  const filteredNodes = GRAPH_DATA.nodes.filter(n => activeGroups.includes(n.group));
  const filteredIds   = new Set(filteredNodes.map(n => n.id));
  const filteredLinks = GRAPH_DATA.links.filter(l => {
    const s = typeof l.source === 'object' ? l.source.id : l.source;
    const t = typeof l.target === 'object' ? l.target.id : l.target;
    return filteredIds.has(s) && filteredIds.has(t);
  });

  // ── 3D relief: fz = link count × 8 (nodes float at different heights) ──
  const graphData = {
    nodes: filteredNodes.map(n => ({
      ...n,
      fz: (LINK_COUNTS[n.id] || 0) * 8,
    })),
    links: filteredLinks,
  };

  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // ── Custom node: transparent sphere + wireframe + height-based glow ──
  const nodeThreeObject = useCallback(node => {
    const grp    = new THREE.Group();
    const col    = GROUP_COLORS[node.group] || '#ffffff';
    const relief = (LINK_COUNTS[node.id] || 0) * 8;

    // Core sphere — size scales slightly with relief
    const r = node.val * 0.6 + relief * 0.05;
    grp.add(new THREE.Mesh(
      new THREE.SphereGeometry(r, 20, 20),
      new THREE.MeshPhongMaterial({
        color: col, emissive: col, emissiveIntensity: 0.35,
        transparent: true, opacity: 0.72,
      })
    ));

    // Wireframe shell
    grp.add(new THREE.Mesh(
      new THREE.SphereGeometry(r * 1.08, 8, 8),
      new THREE.MeshBasicMaterial({ color: col, wireframe: true, transparent: true, opacity: 0.12 })
    ));

    // Vertical "mountain pillar" — a thin cylinder from z=0 to node's relief height
    if (relief > 0) {
      const pillar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.8, 1.5, relief, 6),
        new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.18 })
      );
      pillar.position.set(0, 0, -relief / 2); // hang below the node
      grp.add(pillar);
    }

    return grp;
  }, []);

  // ── Agent meshes (one per agent) ──
  useEffect(() => {
    if (!fgRef.current) return;
    const scene = fgRef.current.scene?.();
    if (!scene) return;

    const meshes = AGENT_COLORS.map((col, i) => {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(i === 0 ? 5 : 3.5, 10, 10),
        new THREE.MeshBasicMaterial({ color: col })
      );
      mesh.add(new THREE.PointLight(col, i === 0 ? 2 : 1, 60));
      scene.add(mesh);
      return mesh;
    });

    agentMeshesRef.current = meshes;
    travelerMeshRef.current = meshes[0];
    return () => { meshes.forEach(m => scene.remove(m)); };
  }, []);

  // ── Animation: all agents + terrain + semantic zoom ──
  useEffect(() => {
    let raf;

    function getNeighbors(nodeId) {
      return filteredLinks
        .map(l => {
          const s = typeof l.source === 'object' ? l.source.id : l.source;
          const t = typeof l.target === 'object' ? l.target.id : l.target;
          if (s === nodeId) return t;
          if (t === nodeId) return s;
          return null;
        })
        .filter(Boolean);
    }

    function tick() {
      const fg = fgRef.current;
      if (!fg) { raf = requestAnimationFrame(tick); return; }

      const gd = fg.graphData();

      agentsRef.current.forEach((ag, ai) => {
        const mesh = agentMeshesRef.current[ai];
        ag.t += ag.speed;

        if (ag.t >= 1) {
          ag.t    = 0;
          ag.from = ag.to;

          // Sound on arrival (primary agent only, to avoid noise)
          if (ai === 0) {
            const arrivedNode = GRAPH_DATA.nodes.find(n => n.id === ag.from);
            if (arrivedNode) playArrival(arrivedNode.group);
            setCurrentNodeId(ag.from);
          }

          if (ag.plannedPath.length > 1 && ag.plannedPath[0] === ag.from) {
            ag.plannedPath.shift();
            ag.to = ag.plannedPath[0];
          } else {
            const nbs = getNeighbors(ag.from);
            if (nbs.length) ag.to = nbs[Math.floor(Math.random() * nbs.length)];
          }
        }

        if (mesh) {
          const nodeA = gd.nodes.find(n => n.id === ag.from);
          const nodeB = gd.nodes.find(n => n.id === ag.to);
          if (nodeA && nodeB && nodeA.x !== undefined) {
            mesh.position.set(
              nodeA.x + (nodeB.x - nodeA.x) * ag.t,
              nodeA.y + (nodeB.y - nodeA.y) * ag.t,
              nodeA.z + (nodeB.z - nodeA.z) * ag.t,
            );
          }
        }
      });

      // Terrain + semantic zoom (based on primary agent camera)
      const camera = fg.camera?.();
      if (camera) {
        const projected = gd.nodes.map(n => {
          if (n.x === undefined) return null;
          const world = new THREE.Vector3(n.x, n.y, n.z ?? 0);
          const dist  = camera.position.distanceTo(world);
          const v     = world.clone().project(camera);
          return {
            id: n.id, group: n.group,
            px: (v.x *  0.5 + 0.5) * size.w,
            py: (v.y * -0.5 + 0.5) * size.h,
            distToCamera: dist,
          };
        }).filter(Boolean);

        setNodePositions(projected);
        const closest = projected.reduce((best, p) =>
          p.distToCamera < (best?.distToCamera ?? Infinity) ? p : best, null);
        setNearNode(closest && closest.distToCamera < ZOOM_THRESHOLD ? closest : null);
      }

      raf = requestAnimationFrame(tick);
    }

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [filteredLinks, size, playArrival]);

  // ── Click: set primary agent target + fly camera ──
  const handleNodeClick = useCallback(node => {
    const tr   = agentsRef.current[0];
    const path = bfsPath(filteredLinks, tr.from, node.id);
    tr.plannedPath = path;
    setTargetNodeId(node.id);
    setTravelPath(path);
    if (fgRef.current) {
      fgRef.current.cameraPosition(
        { x: node.x * 1.4, y: node.y * 1.4, z: (node.z ?? 0) + 100 },
        node, 1500
      );
    }
  }, [filteredLinks]);

  const currentNode = GRAPH_DATA.nodes.find(n => n.id === currentNodeId);
  const targetNode  = GRAPH_DATA.nodes.find(n => n.id === targetNodeId);
  const agentHudData = AGENT_COLORS.map((color, i) => ({
    color,
    score: agentScores[i] || 0,
  }));

  return (
    <div style={{ position: 'relative', width: size.w, height: size.h }}>
      <ForceGraph3D
        ref={fgRef}
        graphData={graphData}
        width={size.w}
        height={size.h}
        backgroundColor="#070714"
        nodeLabel={node => `${node.id} (${LINK_COUNTS[node.id] || 0} связей)`}
        nodeThreeObject={nodeThreeObject}
        nodeThreeObjectExtend={false}
        linkColor={link => {
          const sid = typeof link.source === 'object' ? link.source.id : link.source;
          const col = GROUP_COLORS[(GRAPH_DATA.nodes.find(n => n.id === sid) || {}).group] || '#fff';
          return col + '88';
        }}
        linkWidth={link => (link.value || 1) * 0.5}
        linkDirectionalParticles={2}
        linkDirectionalParticleSpeed={0.004}
        linkDirectionalParticleWidth={1.5}
        onNodeClick={handleNodeClick}
        enableNodeDrag={false}
      />

      <TerrainOverlay nodePositions={nodePositions} width={size.w} height={size.h} opacity={0.14} />

      {/* Semantic zoom popup */}
      <SemanticZoom nearNode={nearNode} nodeDetails={NODE_DETAILS} />

      {/* Agent HUD */}
      <AgentHUD agents={agentHudData} gameMode={false} gameTarget={targetNodeId} currentNodeId={currentNodeId} />

      <InfoPanel
        currentNode={currentNode}
        targetNode={targetNode}
        path={travelPath}
        era={era}
        onEraChange={setEra}
        maxEra={TIME_ERAS.length}
      />
    </div>
  );
}
