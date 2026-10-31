import type { Locale } from '../config/site';
import { site } from '../config/site';

export const localeTag: Record<Locale, string> = {
  zh: 'zh-CN',
  en: 'en-US',
  es: 'es-419',
};

export const localeLabel: Record<Locale, string> = {
  zh: '中文',
  en: 'English',
  es: 'Español',
};

type Dict = {
  home: string;
  industries: string;
  regions: string;
  date: string;
  missingRegions: string;
  supplement: string;
  regionCoverage: string;
  dayTotal: string;
  dayTotal: string;
  archive: string;
  status: string;
  search: string;
  searchPlaceholder: string;
  searchHint: string;
  results: string;
  noResults: string;
  loadingIndex: string;
  loadMore: string;
  whyItMatters: string;
  sources: string;
  viewSource: string;
  tags: string;
  publishedAt: string;
  originalLang: string;
  latest: string;
  today: string;
  noUpdate: string;
  noUpdateHint: string;
  noIndustry: string;
  noIndustryHint: string;
  noRegion: string;
  noRegionHint: string;
  archiveTitle: string;
  archiveDesc: string;
  statusTitle: string;
  statusDesc: string;
  language: string;
  theme: string;
  themeLight: string;
  themeDark: string;
  items: string;
  related: string;
  backHome: string;
  industryLabel: string;
  allTags: string;
  publishedCount: string;
  lastRun: string;
  fetched: string;
  publishedItems: string;
  rejectedItems: string;
  failedSources: string;
  noRuns: string;
  cost: string;
  duration: string;
  filterClear: string;
  shareHint: string;
  viewAll: string;
  collected: string;
  runs: string;
  total: string;
  dedup: string;
  gate: string;
};

export const ui: Record<Locale, Dict> = {
  zh: {
    home: '首页',
    industries: '行业',
    regions: '区域',
    date: '日期',
    missingRegions: '缺 {n} 区',
    supplement: '补位',
    regionCoverage: '近 30 天区域覆盖',
    dayTotal: '合计',
    dayTotal: '合计',
    archive: '归档',
    status: '运行状态',
    search: '搜索',
    searchPlaceholder: '搜索标题、摘要或标签',
    searchHint: '支持中文与英文，索引在本地加载，不联网查询',
    results: '条结果',
    noResults: '没有找到相关内容',
    loadingIndex: '正在加载搜索索引…',
    loadMore: '加载更早的月份',
    whyItMatters: '为什么值得关注',
    sources: '来源',
    viewSource: '查看原文',
    tags: '标签',
    publishedAt: '发布时间',
    originalLang: '原文语言',
    latest: '最新',
    today: '今日',
    noUpdate: '今日无更新',
    noUpdateHint: '今日该行业没有通过质量门禁的内容，因此不发布。',
    noIndustry: '该行业暂无收录',
    noIndustryHint: '采集任务还没有在这个行业发布过内容，有合格条目后会出现在这里。',
    noRegion: '该区域暂无收录',
    noRegionHint: '采集任务还没有在这个区域发布过内容，有合格条目后会出现在这里。',
    archiveTitle: '归档',
    archiveDesc: '按日期查看每日收录的全部内容',
    statusTitle: '运行状态',
    statusDesc: '每日采集任务的执行结果与质量门禁通过情况',
    language: '语言',
    theme: '主题',
    themeLight: '浅色',
    themeDark: '深色',
    items: '条',
    related: '相关阅读',
    backHome: '返回首页',
    industryLabel: '行业',
    allTags: '全部标签',
    publishedCount: '条已发布',
    lastRun: '最近一次运行',
    fetched: '抓取',
    publishedItems: '发布',
    rejectedItems: '被门禁拦截',
    failedSources: '失败来源',
    noRuns: '暂无运行记录',
    cost: '成本',
    duration: '耗时',
    filterClear: '清除筛选',
    shareHint: '这个地址固定不变，可直接收藏或转发',
    viewAll: '全部',
    collected: '收录',
    runs: '运行记录',
    total: '累计',
    dedup: '去重',
    gate: '过审',
  },
  en: {
    home: 'Home',
    industries: 'Industries',
    regions: 'Regions',
    date: 'Date',
    missingRegions: '{n} missing',
    supplement: 'Fill-in',
    regionCoverage: 'Region coverage, last 30 days',
    dayTotal: 'Total',
    dayTotal: 'Total',
    archive: 'Archive',
    status: 'Status',
    search: 'Search',
    searchPlaceholder: 'Search titles, summaries or tags',
    searchHint: 'Runs entirely in your browser, no network queries',
    results: 'results',
    noResults: 'Nothing found',
    loadingIndex: 'Loading search index…',
    loadMore: 'Load earlier months',
    whyItMatters: 'Why it matters',
    sources: 'Sources',
    viewSource: 'Read original',
    tags: 'Tags',
    publishedAt: 'Published',
    originalLang: 'Original language',
    latest: 'Latest',
    today: 'Today',
    noUpdate: 'No update today',
    noUpdateHint: 'Nothing passed the quality gate for this industry today, so nothing was published.',
    noIndustry: 'Nothing in this sector yet',
    noIndustryHint: 'No item has passed the gate for this sector so far; qualifying ones will show up here.',
    noRegion: 'Nothing in this region yet',
    noRegionHint: 'No item has passed the gate for this region so far; qualifying ones will show up here.',
    archiveTitle: 'Archive',
    archiveDesc: 'Browse everything collected, by date',
    statusTitle: 'Status',
    statusDesc: 'Daily run results and quality gate outcomes',
    language: 'Language',
    theme: 'Theme',
    themeLight: 'Light',
    themeDark: 'Dark',
    items: 'items',
    related: 'Related',
    backHome: 'Back home',
    industryLabel: 'Industry',
    allTags: 'All tags',
    publishedCount: 'published',
    lastRun: 'Last run',
    fetched: 'Fetched',
    publishedItems: 'Published',
    rejectedItems: 'Blocked by gate',
    failedSources: 'Failed sources',
    noRuns: 'No runs recorded',
    cost: 'Cost',
    duration: 'Duration',
    filterClear: 'Clear filter',
    shareHint: 'This URL never changes — bookmark it or share it',
    viewAll: 'All',
    collected: 'Collected',
    runs: 'Runs',
    total: 'total',
    dedup: 'dedup',
    gate: 'gate',
  },
  es: {
    home: 'Inicio',
    industries: 'Sectores',
    regions: 'Regiones',
    date: 'Fecha',
    missingRegions: 'faltan {n}',
    supplement: 'Relleno',
    regionCoverage: 'Cobertura regional, últimos 30 días',
    dayTotal: 'Total',
    dayTotal: 'Total',
    archive: 'Archivo',
    status: 'Estado',
    search: 'Buscar',
    searchPlaceholder: 'Buscar en títulos, resúmenes o etiquetas',
    searchHint: 'Se ejecuta en tu navegador, sin consultas de red',
    results: 'resultados',
    noResults: 'Sin resultados',
    loadingIndex: 'Cargando índice de búsqueda…',
    loadMore: 'Cargar meses anteriores',
    whyItMatters: 'Por qué importa',
    sources: 'Fuentes',
    viewSource: 'Leer original',
    tags: 'Etiquetas',
    publishedAt: 'Publicado',
    originalLang: 'Idioma original',
    latest: 'Último',
    today: 'Hoy',
    noUpdate: 'Sin novedades hoy',
    noUpdateHint: 'Hoy ningún contenido superó el control de calidad en este sector, por eso no se publicó nada.',
    noIndustry: 'Sin contenido en este sector',
    noIndustryHint: 'Todavía no se ha publicado nada en este sector; los elementos válidos aparecerán aquí.',
    noRegion: 'Sin contenido en esta región',
    noRegionHint: 'Todavía no se ha publicado nada en esta región; los elementos válidos aparecerán aquí.',
    archiveTitle: 'Archivo',
    archiveDesc: 'Todo lo recopilado, por fecha',
    statusTitle: 'Estado',
    statusDesc: 'Resultados de las ejecuciones diarias y del control de calidad',
    language: 'Idioma',
    theme: 'Tema',
    themeLight: 'Claro',
    themeDark: 'Oscuro',
    items: 'elementos',
    related: 'Relacionado',
    backHome: 'Volver al inicio',
    industryLabel: 'Sector',
    allTags: 'Todas las etiquetas',
    publishedCount: 'publicados',
    lastRun: 'Última ejecución',
    fetched: 'Recopilados',
    publishedItems: 'Publicados',
    rejectedItems: 'Bloqueados',
    failedSources: 'Fuentes fallidas',
    noRuns: 'Sin registros',
    cost: 'Coste',
    duration: 'Duración',
    filterClear: 'Quitar filtro',
    shareHint: 'Esta dirección no cambia: guárdala o compártela',
    viewAll: 'Todo',
    collected: 'Recopilado',
    runs: 'Ejecuciones',
    total: 'total',
    dedup: 'depurado',
    gate: 'control',
  },
};

export function t(locale: Locale): Dict {
  return ui[locale];
}

export function formatDate(iso: string, locale: Locale, withTime = false): string {
  return new Intl.DateTimeFormat(localeTag[locale], {
    dateStyle: 'medium',
    ...(withTime ? { timeStyle: 'short' as const } : {}),
    timeZone: site.timeZone,
  }).format(new Date(iso));
}

export function formatDateKey(dateKey: string, locale: Locale): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Intl.DateTimeFormat(localeTag[locale], {
    dateStyle: 'full',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

export function formatNumber(n: number, locale: Locale): string {
  return new Intl.NumberFormat(localeTag[locale]).format(n);
}
