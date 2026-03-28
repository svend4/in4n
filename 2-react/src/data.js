// Semantic concept graph — nodes + links

export const GRAPH_DATA = {
  nodes: [
    { id: 'Время',        group: 'time',    val: 18 },
    { id: 'Пространство', group: 'space',   val: 16 },
    { id: 'Движение',     group: 'space',   val: 12 },
    { id: 'Память',       group: 'mind',    val: 14 },
    { id: 'Смысл',        group: 'mind',    val: 20 },
    { id: 'Форма',        group: 'form',    val: 12 },
    { id: 'Связь',        group: 'form',    val: 13 },
    { id: 'Поиск',        group: 'time',    val: 10 },
    { id: 'Знание',       group: 'mind',    val: 16 },
    { id: 'Вопрос',       group: 'time',    val: 11 },
    { id: 'Граница',      group: 'form',    val: 10 },
    { id: 'Путь',         group: 'space',   val: 14 },
    { id: 'Слово',        group: 'mind',    val: 12 },
    { id: 'Образ',        group: 'form',    val: 13 },
    { id: 'Число',        group: 'time',    val: 10 },
  ],
  links: [
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

// Temporal snapshots — which links existed at a given era
export const TIME_ERAS = [
  { year: 1, label: 'Начало',    activeGroups: ['time'] },
  { year: 2, label: 'Разворот',  activeGroups: ['time', 'space'] },
  { year: 3, label: 'Движение',  activeGroups: ['time', 'space', 'form'] },
  { year: 4, label: 'Полнота',   activeGroups: ['time', 'space', 'mind', 'form'] },
];
