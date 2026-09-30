// Renders a Restaurant snapshot into the page: the brief's text boxes, the animated floor,
// the stats and the event log. Knows nothing about how the simulation works internally.
import { TokenRenderer } from './flip.js';

const $ = (id) => document.getElementById(id);
const MAX_TOKENS = 14;
const MAX_LOG = 80;
const FACES = ['🧑', '👩', '👨', '🧒', '👵', '👴', '🧔', '👱‍♀️', '👩‍🦱', '🧑‍🦰'];

export const formatClock = (ms) => {
  const total = Math.floor(ms / 1000);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};
const seconds = (ms) => `${(ms / 1000).toFixed(1)} s`;
const orderNo = (ticket) => (ticket ? `#${ticket.number}` : '—');

const customerToken = (customer, extra = '') => ({
  key: `c${customer.id}`,
  className: `token customer ${extra}`,
  title: customer.ticket ? `Customer ${customer.id}, order #${customer.ticket.number}` : `Customer ${customer.id}`,
  html: `<span class="face">${FACES[customer.id % FACES.length]}</span><b>${
    customer.ticket ? `#${customer.ticket.number}` : `C${customer.id}`
  }</b>`,
});
const orderToken = (ticket, extra = '') => ({
  key: `o${ticket.number}`,
  className: `token order ${extra}`,
  title: `Order #${ticket.number}`,
  html: `<span class="face">🍔</span><b>#${ticket.number}</b>`,
});

// Show the first few tokens and a "+N" chip, so long lines stay readable
function capped(key, tokens) {
  if (tokens.length <= MAX_TOKENS) return tokens;
  const extra = tokens.length - (MAX_TOKENS - 1);
  return [...tokens.slice(0, MAX_TOKENS - 1), { key: `more-${key}`, className: 'token more', html: `+${extra}` }];
}

export class RestaurantView {
  constructor() {
    this.tokens = new TokenRenderer();
  }

  reset() {
    this.tokens.clear();
    $('log').replaceChildren();
    this.render(null);
  }

  render(s) {
    const set = (id, value) => {
      const el = $(id);
      if (el.value !== String(value)) el.value = value;
    };

    // Brief's text boxes
    set('line-count', s ? s.orderLine.length : 0);
    set('taking-number', s?.taking ? `#${s.taking.orderNumber}` : '—');
    set('preparing-number', orderNo(s?.preparing));
    set('kitchen-list', s?.kitchenQueue.length ? s.kitchenQueue.map((t) => `#${t.number}`).join(', ') : '—');
    set('kitchen-count', s ? s.kitchenQueue.length : 0);
    set('pickup-number', orderNo(s?.announced));
    set('serving-count', s ? s.servingLine.length : 0);

    this.renderStatus(s);
    if (!s) return;

    this.tokens.render([
      [$('stage-line'), capped('line', s.orderLine.map((c) => customerToken(c)))],
      [$('stage-counter'), s.taking ? [customerToken(s.taking.customer, 'at-counter')] : []],
      [$('stage-stove'), s.preparing ? [orderToken(s.preparing, 'cooking')] : []],
      [$('stage-kitchen'), capped('kitchen', s.kitchenQueue.map((t) => orderToken(t)))],
      [$('stage-pickup'), [...s.readyShelf.map((t) => orderToken(t, 'ready')), ...(s.handingOver ? [orderToken(s.handingOver, 'ready called')] : [])]],
      [$('stage-serving'), capped('serving', s.servingLine.map((c) => customerToken(c)))],
      [$('stage-dining'), s.dining.map((c) => customerToken(c, 'eating'))],
    ]);
  }

  renderStatus(s) {
    const state = $('state');
    const [label, cls] = !s
      ? ['Ready', 'idle']
      : s.running
        ? ['Running', 'running']
        : s.stopReason === 'time-up'
          ? ["Stopped: time's up", 'stopped']
          : ['Stopped', 'stopped'];
    state.textContent = label;
    state.className = `pill ${cls}`;
    this.renderClock(s);
    $('stat-arrived').textContent = s ? s.stats.arrived : 0;
    $('stat-served').textContent = s ? s.stats.served : 0;
    $('stat-wait').textContent = s?.stats.averageWaitMs != null ? seconds(s.stats.averageWaitMs) : '–';
    $('stat-longest').textContent = s ? s.stats.longestLine : 0;
    $('start').disabled = Boolean(s?.running);
    $('stop').disabled = !s?.running;
  }

  renderClock(s) {
    $('elapsed').textContent = formatClock(s ? s.elapsed : 0);
    $('remaining').textContent =
      s?.running && s.duration ? ` · ${formatClock(Math.max(0, s.duration - s.elapsed))} left` : '';
  }

  log(elapsed, message, kind = '') {
    const item = document.createElement('li');
    item.className = kind;
    item.innerHTML = `<time>${formatClock(elapsed)}</time>`;
    item.append(` ${message}`);
    const log = $('log');
    log.prepend(item);
    while (log.children.length > MAX_LOG) log.lastChild.remove();
  }
}
