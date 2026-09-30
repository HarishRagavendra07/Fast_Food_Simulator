// Tests use a virtual clock, so simulated minutes run in milliseconds.
// Like the app, they use promise chains rather than async/await.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { FakeClock } from '../src/sim/clock.js';
import { Restaurant } from '../src/sim/restaurant.js';
import { OrderTicket } from '../src/sim/order-ticket.js';
import { WaitQueue } from '../src/sim/wait-queue.js';
import { validateSettings } from '../src/sim/config.js';
import { EventBus } from '../src/sim/events.js';

// arrivals every 3 s, taking 2 s, cooking 4 s, handing over 1 s
const CONFIG = { arrivalInterval: 3000, takeTime: 2000, prepTime: 4000, deliverTime: 1000, duration: null };

// subscribe(restaurant) runs before start(), so listeners also see the first arrival at 0 s
function setup(config = CONFIG, subscribe = () => {}, options = {}) {
  const clock = new FakeClock();
  const restaurant = new Restaurant({ createClock: () => clock, ...options });
  subscribe(restaurant);
  restaurant.start(config);
  const at = (ms) => clock.advanceTo(ms).then(() => restaurant.snapshot());
  return { clock, restaurant, at };
}

const ids = (customers) => customers.map((c) => c.id);
const numbers = (tickets) => tickets.map((t) => t.number);

// Expected timeline with CONFIG:
//   c1 arrives 0, order #1 written 2, cooked 2-6, handed over 6-7  -> waited 7 s
//   c2 arrives 3, order #2 written 5, cooked 6-10, handed over 10-11 -> waited 8 s
//   c3 arrives 6, order #3 written 8, cooked 10-14, handed over 14-15
test('customers flow through order line, counter, kitchen, pickup and dining', () => {
  const { restaurant, at } = setup();
  return at(0)
    .then((s) => {
      assert.deepEqual(s.taking && [s.taking.customer.id, s.taking.orderNumber], [1, 1]);
      assert.equal(s.orderLine.length, 0);
      return at(5000);
    })
    .then((s) => {
      assert.equal(s.preparing.number, 1, 'Cook is on order #1');
      assert.deepEqual(numbers(s.kitchenQueue), [2], 'order #2 waits in the kitchen');
      assert.deepEqual(ids(s.servingLine), [1, 2], 'both customers wait in the serving line');
      return at(6000);
    })
    .then((s) => {
      assert.equal(s.announced.number, 1, 'order #1 announced at the pickup counter');
      assert.equal(s.preparing.number, 2);
      return at(7000);
    })
    .then((s) => {
      assert.deepEqual(ids(s.dining), [1], 'customer 1 is in the dining area');
      assert.deepEqual(ids(s.servingLine), [2]);
      assert.equal(s.stats.served, 1);
      assert.equal(s.stats.averageWaitMs, 7000);
      return at(11000);
    })
    .then((s) => {
      assert.deepEqual(ids(s.dining), [1, 2]);
      assert.equal(s.stats.averageWaitMs, 7500, 'mean of 7 s and 8 s');
      restaurant.stop();
    });
});

test('customers arrive, and orders are completed, at a constant rate', () => {
  const readyTimes = [];
  const arrivalTimes = [];
  const { restaurant, at } = setup(CONFIG, (r) => {
    r.events.on('order:ready', () => readyTimes.push(r.snapshot().elapsed));
    r.events.on('customer:arrived', () => arrivalTimes.push(r.snapshot().elapsed));
  });
  return at(30000).then(() => {
    assert.deepEqual(arrivalTimes.slice(0, 5), [0, 3000, 6000, 9000, 12000]);
    // The cook is the bottleneck, so orders come out exactly 4 s apart
    const gaps = readyTimes.slice(1).map((t, i) => t - readyTimes[i]);
    assert.ok(gaps.length >= 5);
    assert.ok(gaps.every((g) => g === 4000), `gaps: ${gaps}`);
    restaurant.stop();
  });
});

test('Stop halts everything immediately and nothing moves afterwards', () => {
  const { restaurant, at } = setup();
  let before;
  return at(9500)
    .then((s) => {
      restaurant.stop();
      before = restaurant.snapshot();
      assert.equal(before.running, false);
      assert.equal(before.stopReason, 'user');
      return at(60000);
    })
    .then((after) => {
      assert.equal(after.stats.arrived, before.stats.arrived);
      assert.equal(after.stats.served, before.stats.served);
      assert.equal(after.elapsed, 9500, 'the clock display freezes at the stop time');
    });
});

test('an optional run time stops the simulation by itself', () => {
  const { restaurant, at } = setup({ ...CONFIG, duration: 10000 });
  const reasons = [];
  restaurant.events.on('stopped', ({ reason }) => reasons.push(reason));
  return at(20000).then((s) => {
    assert.equal(s.running, false);
    assert.deepEqual(reasons, ['time-up']);
    assert.equal(s.elapsed, 10000);
    assert.equal(s.stats.arrived, 4, 'arrivals at 0, 3, 6 and 9 s');
  });
});

test('lines grow when customers arrive faster than the cook can work', () => {
  const { restaurant, at } = setup({ ...CONFIG, arrivalInterval: 1000, takeTime: 0 });
  return at(20000).then((s) => {
    assert.ok(s.kitchenQueue.length > 10, `kitchen queue ${s.kitchenQueue.length}`);
    assert.ok(s.servingLine.length > 10);
    restaurant.stop();
  });
});

test('the Server never hands over an order before the Cook has finished it', () => {
  const { restaurant, at } = setup({ ...CONFIG, deliverTime: 0 });
  const log = [];
  restaurant.events.on('order:ready', ({ ticket }) => log.push(`ready #${ticket.number}`));
  restaurant.events.on('order:announced', ({ ticket }) => log.push(`announced #${ticket.number}`));
  return at(16000).then(() => {
    assert.deepEqual(log.slice(0, 6), ['ready #1', 'announced #1', 'ready #2', 'announced #2', 'ready #3', 'announced #3']);
    restaurant.stop();
  });
});

test('an order ticket carries two separate promises: ready (for the Server) and served (for the Customer)', () => {
  const ticket = new OrderTicket(7, { id: 1 }, 0);
  const seen = [];
  ticket.ready.then(() => seen.push('ready'));
  ticket.served.then(() => seen.push('served'));
  ticket.markReady();
  return Promise.resolve()
    .then(() => assert.deepEqual(seen, ['ready']))
    .then(() => ticket.markServed())
    .then(() => assert.deepEqual(seen, ['ready', 'served']));
});

test('WaitQueue hands items to waiting takers in FIFO order', () => {
  const q = new WaitQueue();
  const got = [];
  const first = q.take().then((x) => got.push(x));
  const second = q.take().then((x) => got.push(x));
  q.push('a');
  q.push('b');
  q.push('c');
  return Promise.all([first, second]).then(() => {
    assert.deepEqual(got, ['a', 'b']);
    assert.deepEqual(q.toArray(), ['c']);
  });
});

test('settings validation gives specific messages', () => {
  const ok = { arrivalInterval: '3', prepTime: '4', takeTime: '2', deliverTime: '1', duration: '' };
  const { config, errors } = validateSettings(ok);
  assert.deepEqual(errors, {});
  assert.deepEqual(config, { arrivalInterval: 3000, prepTime: 4000, takeTime: 2000, deliverTime: 1000, duration: null });

  const bad = validateSettings({ ...ok, arrivalInterval: '', prepTime: 'abc', takeTime: '-1', duration: '0' });
  assert.equal(bad.config, null);
  assert.equal(bad.errors.arrivalInterval, 'Enter the customer arrival interval in seconds, e.g. 3.');
  assert.equal(bad.errors.prepTime, '“abc” isn\'t a number. Enter the order fulfilment interval in seconds, e.g. 4.');
  assert.equal(bad.errors.takeTime, "The order taking time can't be negative.");
  assert.equal(bad.errors.duration, 'The simulation run time must be more than 0 seconds.');
  assert.equal(validateSettings({ ...ok, prepTime: '0' }).errors.prepTime, 'The order fulfilment interval must be more than 0 seconds.');
  assert.equal(validateSettings({ ...ok, arrivalInterval: '9999' }).errors.arrivalInterval, 'The customer arrival interval must be 600 seconds or less.');
  assert.deepEqual(validateSettings({ ...ok, takeTime: '0', deliverTime: '0' }).errors, {}, 'staff steps may take 0 s');
});

test('warns (without blocking) when a stage is slower than arrivals', () => {
  const { config, warnings } = validateSettings({ arrivalInterval: '2', prepTime: '5', takeTime: '1', deliverTime: '1', duration: '' });
  assert.ok(config);
  assert.deepEqual(warnings, ['Customers arrive every 2 s, but the Cook needs 5 s per order, so the lines will keep growing.']);
});

test('source code uses native Promises only: no async/await anywhere', () => {
  const files = ['src/sim', 'src/ui', 'src', 'test'].flatMap((dir) =>
    readdirSync(dir).filter((f) => f.endsWith('.js')).map((f) => `${dir}/${f}`)
  );
  assert.ok(files.length > 5);
  for (const file of files) {
    const code = readFileSync(file, 'utf8').replace(/\/\/.*$/gm, '').replace(/(['"`]).*?\1/g, '');
    assert.doesNotMatch(code, /\basync\b|\bawait\b/, `${file} uses async/await`);
  }
});

test("wildcard listeners get the event's real type, even if the payload has a type field", () => {
  const bus = new EventBus();
  const seen = [];
  bus.on('*', (e) => seen.push(e.type));
  bus.emit('change', { type: 'customer:arrived', cause: 'x' });
  assert.deepEqual(seen, ['change']);
});

test('a throwing listener cannot stop the simulation', () => {
  const uncaught = [];
  const { restaurant, at } = setup(
    CONFIG,
    (r) =>
      r.events.on('*', () => {
        throw new Error('UI bug');
      }),
    { onListenerError: (err) => uncaught.push(err.message) }
  );
  return at(12000).then((s) => {
    restaurant.stop();
    assert.equal(s.stats.arrived, 5, 'arrivals kept going');
    assert.ok(s.stats.served >= 1, 'orders kept flowing');
    assert.ok(uncaught.length > 0 && uncaught.every((m) => m === 'UI bug'), 'errors still surface');
  });
});
