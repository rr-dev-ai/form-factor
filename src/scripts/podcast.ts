import {
  badgeDate,
  previousAvailableDate,
  nextTrack,
  shiftMonth,
  calendarCells,
  dayState,
  isCurrentView,
  onTrackStart,
  type Queue,
} from '../lib/podcast-queue.ts';

interface Item {
  slug: string;
  title: string;
  industry: string;
  duration: number;
  voice: string;
  url: string;
}
interface Day {
  date: string;
  count: number;
  label: string;
}

const root = document.querySelector<HTMLElement>('[data-podcast]');
if (root) init(root);

function init(root: HTMLElement) {
  const q = <T extends Element>(sel: string) => root.querySelector<T>(sel)!;
  const dates: Day[] = JSON.parse(document.querySelector('[data-dates]')?.textContent || '[]');
  const initial: Item[] = JSON.parse(document.querySelector('[data-initial]')?.textContent || '[]');
  const labels: Record<string, string> = JSON.parse(root.dataset.labels || '{}');
  const todayKey = root.dataset.today || '';
  const sliceBase = root.dataset.sliceBase || '';
  const localeTag = root.dataset.localeTag || 'en-US';

  const list = q<HTMLUListElement>('[data-list]');
  const empty = q<HTMLElement>('[data-empty]');
  const auto = q<HTMLInputElement>('[data-auto]');
  const chain = q<HTMLInputElement>('[data-chain]');
  const chainLabel = q<HTMLElement>('[data-chain-label]');
  const dateText = q<HTMLElement>('[data-date-text]');
  const dateCount = q<HTMLElement>('[data-date-count]');
  const dateToggle = q<HTMLButtonElement>('[data-date-toggle]');
  const prevDay = q<HTMLButtonElement>('[data-prev-day]');
  const nextDay = q<HTMLButtonElement>('[data-next-day]');
  const calendar = q<HTMLElement>('[data-calendar]');
  const monthLabel = q<HTMLElement>('[data-month-label]');
  const calGrid = q<HTMLElement>('[data-cal-grid]');
  const prevMonth = q<HTMLButtonElement>('[data-prev-month]');
  const nextMonth = q<HTMLButtonElement>('[data-next-month]');
  const bar = q<HTMLElement>('[data-bar]');
  const barToggle = q<HTMLButtonElement>('[data-bar-toggle]');
  const barTitle = q<HTMLElement>('[data-bar-title]');
  const barBadge = q<HTMLElement>('[data-bar-badge]');
  const barVoice = q<HTMLElement>('[data-bar-voice]');
  const barSeek = q<HTMLInputElement>('[data-bar-seek]');
  const barTime = q<HTMLElement>('[data-bar-time]');
  const audio = q<HTMLAudioElement>('[data-bar-audio]');

  const available = new Set(dates.map((d) => d.date));
  const dateKeys = dates.map((d) => d.date);
  const months = new Set(dateKeys.map((d) => d.slice(0, 7)));
  const cache = new Map<string, Item[]>();
  let viewDate = root.dataset.selected || '';
  if (viewDate) cache.set(viewDate, initial);
  let viewItems: Item[] = initial;
  let queue: Queue | null = null;
  let queueItems: Item[] = [];
  let queueItemsDate = '';
  let calMonth = (viewDate || todayKey).slice(0, 7);
  let total = 0;
  let hadError = false;

  const shortDate = (key: string) => `${Number(key.slice(5, 7))}/${Number(key.slice(8, 10))}`;
  const clock = (seconds: number) => {
    const s = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };
  const monthName = (key: string) => {
    const [y, m] = key.split('-').map(Number);
    return new Intl.DateTimeFormat(localeTag, { year: 'numeric', month: 'long', timeZone: 'UTC' })
      .format(new Date(Date.UTC(y, m - 1, 1)));
  };
  const labelFor = (key: string) => {
    const found = dates.find((d) => d.date === key);
    if (found) return found.label;
    const [y, m, d] = key.split('-').map(Number);
    return new Intl.DateTimeFormat(localeTag, { dateStyle: 'medium', timeZone: 'UTC' })
      .format(new Date(Date.UTC(y, m - 1, d)));
  };

  async function sliceFor(date: string): Promise<Item[]> {
    if (cache.has(date)) return cache.get(date)!;
    try {
      const res = await fetch(`${sliceBase}${date}.json`);
      if (!res.ok) return [];
      const data = (await res.json()) as { items?: Item[] };
      const items = data.items ?? [];
      cache.set(date, items);
      return items;
    } catch {
      return [];
    }
  }

  function updateBadge() {
    const badge = badgeDate(viewDate, queue?.date ?? null);
    barBadge.hidden = !badge;
    if (badge) {
      barBadge.textContent = shortDate(badge);
      barBadge.title = (labels.queueFrom || '{date}').replace('{date}', shortDate(badge));
    }
  }

  function updatePlayingMark() {
    root.querySelectorAll<HTMLElement>('.podcast-item').forEach((li) => {
      const active = !!queue && queue.date === viewDate && Number(li.dataset.index) === queue.index;
      const playing = active && !audio.paused;
      li.classList.toggle('is-playing', active);
      const icon = li.querySelector<HTMLElement>('.podcast-item-icon');
      if (icon) icon.textContent = playing ? '⏸' : '▶';
      li.querySelector('button')?.setAttribute('aria-label', playing ? labels.pause : labels.play);
    });
  }

  function renderList(items: Item[], dateOfRender: string) {
    list.replaceChildren();
    items.forEach((item, index) => {
      const li = document.createElement('li');
      li.className = 'podcast-item';
      li.dataset.index = String(index);

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'podcast-item-play';
      button.setAttribute('aria-label', labels.play || '');
      const icon = document.createElement('span');
      icon.className = 'podcast-item-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = '▶';
      button.append(icon);
      button.addEventListener('click', () => void startQueue(dateOfRender, index, items));

      const title = document.createElement('span');
      title.className = 'podcast-item-title';
      title.textContent = item.title;
      const voice = document.createElement('span');
      voice.className = 'podcast-item-voice';
      voice.textContent = item.voice;

      li.append(button, title, voice);
      list.append(li);
    });
    empty.hidden = items.length > 0;
    updatePlayingMark();
  }

  function renderProgress() {
    barSeek.value = total > 0 ? String(Math.round((audio.currentTime / total) * 1000)) : '0';
    barTime.textContent = `${clock(audio.currentTime)} / ${clock(total)}`;
  }

  function playAt(index: number, items: Item[]) {
    const item = items[index];
    if (!item) return;
    // 换条目就复位：一次瞬时 error 不能锁死后续所有条目的播放控制
    const state = onTrackStart(hadError);
    barToggle.disabled = state.disabled;
    if (state.audioError) root.dataset.audioError = 'true';
    else delete root.dataset.audioError;
    hadError = false;
    bar.hidden = false;
    barTitle.textContent = item.title;
    barTitle.title = item.title;
    barVoice.textContent = item.voice;
    total = item.duration;
    audio.src = item.url;
    renderProgress();
    updateBadge();
    updatePlayingMark();
    audio.play().catch(() => {
      hadError = true;
      root.dataset.audioError = 'true';
      barToggle.disabled = true;
    });
  }

  async function startQueue(date: string, index: number, items: Item[]) {
    queue = { date, index };
    queueItems = items;
    queueItemsDate = date;
    playAt(index, items);
  }

  async function advance() {
    if (!queue) return;
    const next = nextTrack(queue, queueItems.length, {
      autoContinue: auto.checked,
      chainPrevious: chain.checked && auto.checked,
      previousDate: previousAvailableDate(dateKeys, queue.date),
    });
    if (!next) {
      barToggle.textContent = '▶';
      updatePlayingMark();
      return;
    }
    if (next.date !== queueItemsDate) {
      queueItems = await sliceFor(next.date);
      queueItemsDate = next.date;
    }
    queue = next;
    if (queueItems.length === 0) return;
    playAt(next.index, queueItems);
  }

  function updateDateBar() {
    dateText.textContent = viewDate ? labelFor(viewDate) : labels.empty;
    dateCount.textContent = String(viewItems.length);
    const i = dateKeys.indexOf(viewDate);
    prevDay.disabled = i < 0 || i + 1 >= dateKeys.length;
    nextDay.disabled = i <= 0;
  }

  async function setView(date: string) {
    const requested = date;
    viewDate = date;
    // 队列不动：切日期只换视图，播放不中断
    const items = await sliceFor(date);
    // 快速连点 A→B 时，A 的响应晚到也不能覆盖 B 的列表/日期栏
    if (!isCurrentView(requested, viewDate)) return;
    viewItems = items;
    renderList(viewItems, requested);
    updateDateBar();
    updateBadge();
    calMonth = date.slice(0, 7);
    if (!calendar.hidden) renderCalendar();
  }

  function renderCalendar() {
    monthLabel.textContent = monthName(calMonth);
    prevMonth.disabled = !months.has(shiftMonth(calMonth, -1));
    nextMonth.disabled = !months.has(shiftMonth(calMonth, 1));
    calGrid.replaceChildren();

    const monday = Date.UTC(2024, 0, 1);
    const weekdayFmt = new Intl.DateTimeFormat(localeTag, { weekday: 'short', timeZone: 'UTC' });
    for (let i = 0; i < 7; i += 1) {
      const head = document.createElement('span');
      head.className = 'podcast-cal-weekday';
      head.textContent = weekdayFmt.format(new Date(monday + i * 86400000));
      calGrid.append(head);
    }

    for (const cell of calendarCells(calMonth)) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'podcast-cal-day';
      button.textContent = String(Number(cell.date.slice(8, 10)));
      button.dataset.date = cell.date;
      const state = dayState(cell.date, available, viewDate, todayKey);
      button.dataset.state = state;
      button.disabled = state === 'future' || state === 'disabled';
      if (!cell.inMonth) button.classList.add('is-outside');
      button.addEventListener('click', () => {
        closeCalendar();
        void setView(cell.date);
      });
      calGrid.append(button);
    }
  }

  function openCalendar() {
    calMonth = (viewDate || todayKey).slice(0, 7);
    renderCalendar();
    calendar.hidden = false;
    dateToggle.setAttribute('aria-expanded', 'true');
  }
  function closeCalendar() {
    calendar.hidden = true;
    dateToggle.setAttribute('aria-expanded', 'false');
  }

  dateToggle.addEventListener('click', () => {
    if (calendar.hidden) openCalendar();
    else closeCalendar();
  });
  prevMonth.addEventListener('click', () => {
    calMonth = shiftMonth(calMonth, -1);
    renderCalendar();
  });
  nextMonth.addEventListener('click', () => {
    calMonth = shiftMonth(calMonth, 1);
    renderCalendar();
  });
  prevDay.addEventListener('click', () => {
    const i = dateKeys.indexOf(viewDate);
    if (i >= 0 && i + 1 < dateKeys.length) void setView(dateKeys[i + 1]);
  });
  nextDay.addEventListener('click', () => {
    const i = dateKeys.indexOf(viewDate);
    if (i > 0) void setView(dateKeys[i - 1]);
  });

  document.addEventListener('click', (event) => {
    const target = event.target as Node;
    if (calendar.hidden) return;
    if (!calendar.contains(target) && !dateToggle.contains(target)) closeCalendar();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeCalendar();
  });

  auto.addEventListener('change', () => {
    chain.disabled = !auto.checked;
    chainLabel.classList.toggle('is-disabled', !auto.checked);
  });

  barToggle.addEventListener('click', () => {
    if (audio.paused) audio.play().catch(() => { hadError = true; barToggle.disabled = true; });
    else audio.pause();
  });
  barSeek.addEventListener('input', () => {
    if (total > 0) audio.currentTime = (Number(barSeek.value) / 1000) * total;
  });
  audio.addEventListener('loadedmetadata', () => {
    if (Number.isFinite(audio.duration) && audio.duration > 0) total = audio.duration;
    renderProgress();
  });
  audio.addEventListener('timeupdate', renderProgress);
  audio.addEventListener('play', () => {
    barToggle.textContent = '⏸';
    barToggle.setAttribute('aria-label', labels.pause || '');
    updatePlayingMark();
  });
  audio.addEventListener('pause', () => {
    barToggle.textContent = '▶';
    barToggle.setAttribute('aria-label', labels.play || '');
    updatePlayingMark();
  });
  audio.addEventListener('ended', () => void advance());
  audio.addEventListener('error', () => {
    hadError = true;
    root.dataset.audioError = 'true';
    barToggle.disabled = true;
  });

  updateDateBar();
  renderList(initial, viewDate);
  updateBadge();
}
