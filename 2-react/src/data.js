// Semantic concept graph — nodes + links
// level 3 = archetype (cluster attractor)
// level 2 = strategy (high-connectivity hub)
// level 1 = detail (leaf concept)

export const GRAPH_DATA = {
  nodes: [
    // ── Level 3: Archetypes ────────────────────────────────────
    { id: 'Бытие',     group: 'time',  val: 36, level: 3 },
    { id: 'Поток',     group: 'space', val: 34, level: 3 },
    { id: 'Познание',  group: 'mind',  val: 38, level: 3 },
    { id: 'Структура', group: 'form',  val: 34, level: 3 },

    // ── Level 2: Strategies ───────────────────────────────────
    { id: 'Время',        group: 'time',  val: 18, level: 2 },
    { id: 'Пространство', group: 'space', val: 16, level: 2 },
    { id: 'Смысл',        group: 'mind',  val: 20, level: 2 },
    { id: 'Форма',        group: 'form',  val: 12, level: 2 },

    // ── Level 1: Details ──────────────────────────────────────
    { id: 'Движение', group: 'space', val: 12, level: 1 },
    { id: 'Память',   group: 'mind',  val: 14, level: 1 },
    { id: 'Связь',    group: 'form',  val: 13, level: 1 },
    { id: 'Поиск',    group: 'time',  val: 10, level: 1 },
    { id: 'Знание',   group: 'mind',  val: 16, level: 1 },
    { id: 'Вопрос',   group: 'time',  val: 11, level: 1 },
    { id: 'Граница',  group: 'form',  val: 10, level: 1 },
    { id: 'Путь',     group: 'space', val: 14, level: 1 },
    { id: 'Слово',    group: 'mind',  val: 12, level: 1 },
    { id: 'Образ',    group: 'form',  val: 13, level: 1 },
    { id: 'Число',    group: 'time',  val: 10, level: 1 },
  ],
  links: [
    // Archetype ↔ Strategy (cluster backbone)
    { source: 'Бытие',     target: 'Время',        value: 5 },
    { source: 'Бытие',     target: 'Поиск',        value: 4 },
    { source: 'Бытие',     target: 'Вопрос',       value: 4 },
    { source: 'Поток',     target: 'Пространство', value: 5 },
    { source: 'Поток',     target: 'Движение',     value: 4 },
    { source: 'Поток',     target: 'Путь',         value: 4 },
    { source: 'Познание',  target: 'Смысл',        value: 5 },
    { source: 'Познание',  target: 'Память',       value: 4 },
    { source: 'Познание',  target: 'Знание',       value: 4 },
    { source: 'Познание',  target: 'Слово',        value: 3 },
    { source: 'Структура', target: 'Форма',        value: 5 },
    { source: 'Структура', target: 'Граница',      value: 4 },
    { source: 'Структура', target: 'Образ',        value: 4 },
    { source: 'Структура', target: 'Число',        value: 3 },

    // Cross-archetype bridges (inter-cluster)
    { source: 'Бытие',    target: 'Поток',    value: 3 },
    { source: 'Поток',    target: 'Познание', value: 2 },
    { source: 'Познание', target: 'Структура', value: 3 },
    { source: 'Структура', target: 'Бытие',   value: 2 },

    // Strategy ↔ Detail (original graph)
    { source: 'Время',        target: 'Пространство', value: 3 },
    { source: 'Время',        target: 'Движение',     value: 2 },
    { source: 'Время',        target: 'Память',       value: 3 },
    { source: 'Время',        target: 'Вопрос',       value: 2 },
    { source: 'Время',        target: 'Число',        value: 2 },
    { source: 'Пространство', target: 'Движение',     value: 3 },
    { source: 'Пространство', target: 'Форма',        value: 2 },
    { source: 'Пространство', target: 'Граница',      value: 2 },
    { source: 'Пространство', target: 'Путь',         value: 3 },
    { source: 'Движение',     target: 'Смысл',        value: 2 },
    { source: 'Движение',     target: 'Связь',        value: 2 },
    { source: 'Движение',     target: 'Путь',         value: 3 },
    { source: 'Память',       target: 'Смысл',        value: 3 },
    { source: 'Память',       target: 'Знание',       value: 3 },
    { source: 'Память',       target: 'Слово',        value: 2 },
    { source: 'Смысл',        target: 'Поиск',        value: 2 },
    { source: 'Смысл',        target: 'Знание',       value: 3 },
    { source: 'Смысл',        target: 'Слово',        value: 3 },
    { source: 'Смысл',        target: 'Образ',        value: 2 },
    { source: 'Форма',        target: 'Связь',        value: 2 },
    { source: 'Форма',        target: 'Граница',      value: 3 },
    { source: 'Форма',        target: 'Образ',        value: 3 },
    { source: 'Связь',        target: 'Поиск',        value: 2 },
    { source: 'Связь',        target: 'Путь',         value: 2 },
    { source: 'Поиск',        target: 'Вопрос',       value: 3 },
    { source: 'Знание',       target: 'Вопрос',       value: 2 },
    { source: 'Знание',       target: 'Число',        value: 2 },
    { source: 'Образ',        target: 'Форма',        value: 2 },
    { source: 'Число',        target: 'Форма',        value: 2 },
    { source: 'Путь',         target: 'Граница',      value: 2 },
  ],
};

export const GROUP_COLORS = {
  time:  '#ff6b9d',
  space: '#4fc3f7',
  mind:  '#c792ea',
  form:  '#80cbc4',
};

// Archetype node ids per group
export const ARCHETYPES = {
  time:  'Бытие',
  space: 'Поток',
  mind:  'Познание',
  form:  'Структура',
};

// Temporal snapshots — which links existed at a given era
export const TIME_ERAS = [
  { year: 1, label: 'Начало',    activeGroups: ['time'] },
  { year: 2, label: 'Разворот',  activeGroups: ['time', 'space'] },
  { year: 3, label: 'Движение',  activeGroups: ['time', 'space', 'form'] },
  { year: 4, label: 'Полнота',   activeGroups: ['time', 'space', 'mind', 'form'] },
];
