import './styles.css';
import { Restaurant } from './sim/restaurant.js';
import { RestaurantView } from './ui/view.js';
import { renderFields, readSettings, clearErrorOnInput } from './ui/settings-form.js';

const restaurant = new Restaurant();
const view = new RestaurantView();
const $ = (id) => document.getElementById(id);

renderFields();
clearErrorOnInput();
view.reset();

// Batch bursts of events into one render per animation frame
let frame = 0;
restaurant.events.on('change', () => {
  if (!frame) frame = requestAnimationFrame(() => {
    frame = 0;
    view.render(restaurant.snapshot());
  });
});

// Keep the clock ticking between events
setInterval(() => {
  if (restaurant.running) view.renderClock(restaurant.snapshot());
}, 250);

const sec = (ms) => `${(ms / 1000).toFixed(1)} s`;
const messages = {
  started: () => ['Doors open. Simulation started', 'system'],
  'customer:arrived': ({ customer }) => [`Customer C${customer.id} joined the order line`],
  'order:taking': ({ customer }) => [`Order Taker is taking customer C${customer.id}'s order`],
  'order:placed': ({ ticket }) => [`Ticket #${ticket.number} sent to the kitchen; C${ticket.customer.id} waits in the serving line`],
  'order:cooking': ({ ticket }) => [`Cook started order #${ticket.number}`],
  'order:ready': ({ ticket }) => [`Order #${ticket.number} is ready`],
  'order:announced': ({ ticket }) => [`📣 Now serving order #${ticket.number}!`, 'announce'],
  'customer:served': ({ customer, ticket }) => [
    `C${customer.id} picked up order #${ticket.number} after ${sec(customer.servedAt - customer.arrivedAt)} and went to eat`,
    'served',
  ],
  stopped: ({ reason }) => [reason === 'time-up' ? "Time's up. Simulation stopped" : 'Simulation stopped', 'system'],
  error: ({ error }) => [`Error: ${error.message}`, 'error'],
};
restaurant.events.on('*', ({ type, ...payload }) => {
  const make = messages[type];
  if (!make) return;
  const [text, kind] = make(payload);
  view.log(restaurant.snapshot()?.elapsed ?? 0, text, kind);
});

$('settings').addEventListener('submit', (e) => {
  e.preventDefault();
  const config = readSettings();
  if (!config) return;
  view.reset();
  restaurant.start(config);
});
$('stop').addEventListener('click', () => restaurant.stop());
