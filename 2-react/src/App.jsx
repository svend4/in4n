import { useRef, useState, useEffect, useCallback } from 'react';
import { ForceGraph3D } from 'react-force-graph';
import * as THREE from 'three';
import { GRAPH_DATA, GROUP_COLORS, TIME_ERAS } from './data.js';
import InfoPanel from './components/InfoPanel.jsx';
import TerrainOverlay from './components/TerrainOverlay.jsx';
import SemanticZoom from './components/SemanticZoom.jsx';

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

  const travelerRef     = useRef({ from: GRAPH_DATA.nodes[0].id, to: GRAPH_DATA.nodes[1].id, t: 0, plannedPath: [] });
  const travelerMeshRef = useRef(null);

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

  // ── Traveler mesh ──
  useEffect(() => {
    if (!fgRef.current) return;
    const scene = fgRef.current.scene?.();
    if (!scene) return;
    const mesh  = new THREE.Mesh(
      new THREE.SphereGeometry(4, 12, 12),
      new THREE.MeshBasicMaterial({ color: '#ffffff' })
    );
    mesh.add(new THREE.PointLight('#4fc3f7', 2, 80));
    scene.add(mesh);
    travelerMeshRef.current = mesh;
    return () => { scene.remove(mesh); };
  }, []);

  // ── Animation: traveler + terrain projection + semantic zoom ──
  useEffect(() => {
    let raf;
    const SPEED = 0.012;

    function tick() {
      const tr   = travelerRef.current;
      const mesh = travelerMeshRef.current;
      const fg   = fgRef.current;
      if (!mesh || !fg) { raf = requestAnimationFrame(tick); return; }

      tr.t += SPEED;
      if (tr.t >= 1) {
        tr.t   = 0;
        tr.from = tr.to;
        if (tr.plannedPath.length > 1 && tr.plannedPath[0] === tr.from) {
          tr.plannedPath.shift();
          tr.to = tr.plannedPath[0];
        } else {
          const nbs = filteredLinks
            .filter(l => {
              const s = typeof l.source === 'object' ? l.source.id : l.source;
              const t = typeof l.target === 'object' ? l.target.id : l.target;
              return s === tr.from || t === tr.from;
            })
            .map(l => {
              const s = typeof l.source === 'object' ? l.source.id : l.source;
              const t = typeof l.target === 'object' ? l.target.id : l.target;
              return s === tr.from ? t : s;
            });
          if (nbs.length) tr.to = nbs[Math.floor(Math.random() * nbs.length)];
        }
        setCurrentNodeId(tr.from);
      }

      const gd    = fg.graphData();
      const nodeA = gd.nodes.find(n => n.id === tr.from);
      const nodeB = gd.nodes.find(n => n.id === tr.to);
      if (nodeA && nodeB && nodeA.x !== undefined) {
        mesh.position.set(
          nodeA.x + (nodeB.x - nodeA.x) * tr.t,
          nodeA.y + (nodeB.y - nodeA.y) * tr.t,
          nodeA.z + (nodeB.z - nodeA.z) * tr.t,
        );
      }

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

        // Semantic zoom: find closest node to camera within threshold
        const closest = projected.reduce((best, p) =>
          p.distToCamera < (best?.distToCamera ?? Infinity) ? p : best, null);
        setNearNode(closest && closest.distToCamera < ZOOM_THRESHOLD ? closest : null);
      }

      raf = requestAnimationFrame(tick);
    }

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [filteredLinks, size]);

  // ── Click: set traveler target + fly camera ──
  const handleNodeClick = useCallback(node => {
    const tr   = travelerRef.current;
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
