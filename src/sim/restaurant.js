// Composition root: builds the queues and actors for one simulation run, tracks where every
// customer is, and publishes changes. The UI only talks to this class.
import { RealClock, isCancelled } from './clock.js';
import { WaitQueue } from './wait-queue.js';
import { EventBus } from './events.js';
import { CustomerArrivals, OrderTaker, Cook, Server } from './actors.js';

const DINING_SHOWN = 12;

export class Restaurant {
  constructor({ createClock = (speed) => new RealClock({ speed }), onListenerError } = {}) {
    this.createClock = createClock;
    this.events = new EventBus({ onListenerError }); // public: the UI subscribes here
    this.session = null;
  }

  get running() {
    return Boolean(this.session?.running);
  }

  // config values in ms: arrivalInterval, prepTime, takeTime, deliverTime, duration (or null), speed
  start(config) {
    if (this.running) this.stop('restart');

    const clock = this.createClock(config.speed ?? 1);
    const bus = new EventBus(); // private to this run, so a stopped run can't leak events
    const orderLine = new WaitQueue();
    const kitchen = new WaitQueue();
    const pickup = new WaitQueue();

    const session = {
      running: true,
      config,
      clock,
      queues: [orderLine, kitchen, pickup],
      orderLine,
      kitchen,
      servingLine: new Map(), // ticket number -> customer
      readyShelf: new Map(), // cooked, waiting for the Server to call them
      dining: [],
      stats: { arrived: 0, served: 0, totalWaitMs: 0, longestLine: 0 },
      stoppedAt: null,
      stopReason: null,
    };
    session.arrivals = new CustomerArrivals({ clock, events: bus, orderLine, interval: config.arrivalInterval });
    session.taker = new OrderTaker({ clock, events: bus, orderLine, kitchen, pickup, takeTime: config.takeTime });
    session.cook = new Cook({ clock, events: bus, kitchen, prepTime: config.prepTime });
    session.server = new Server({ clock, events: bus, pickup, deliverTime: config.deliverTime });
    this.session = session;

    bus.on('customer:arrived', () => {
      session.stats.arrived++;
      session.stats.longestLine = Math.max(session.stats.longestLine, orderLine.size);
    });
    bus.on('order:ready', ({ ticket }) => session.readyShelf.set(ticket.number, ticket));
    bus.on('order:announced', ({ ticket }) => session.readyShelf.delete(ticket.number));
    // Once the ticket is written, the customer moves to the serving line and waits on it
    bus.on('order:placed', ({ ticket }) => {
      const customer = ticket.customer;
      session.servingLine.set(ticket.number, customer);
      customer
        .waitForOrder(ticket, clock)
        .then(() => {
          if (this.session !== session) return;
          session.servingLine.delete(ticket.number);
          session.dining.push(customer);
          if (session.dining.length > DINING_SHOWN) session.dining.shift();
          session.stats.served++;
          session.stats.totalWaitMs += customer.servedAt - customer.arrivedAt;
          this.publish('customer:served', { customer, ticket });
        });
    });
    bus.on('*', ({ type, ...payload }) => {
      if (type !== 'customer:served') this.publish(type, payload);
    });

    const onError = (err) => {
      if (!isCancelled(err)) this.publish('error', { error: err });
    };
    [session.arrivals, session.taker, session.cook, session.server].forEach((actor) => actor.run().catch(onError));
    if (config.duration) clock.delay(config.duration).then(() => this.stop('time-up'), onError);

    this.publish('started', { config });
  }

  // reason: 'user' | 'time-up' | 'restart'
  stop(reason = 'user') {
    const session = this.session;
    if (!session?.running) return;
    session.stoppedAt = session.clock.now();
    session.stopReason = reason;
    session.running = false;
    session.clock.cancelAll();
    session.queues.forEach((q) => q.close());
    this.publish('stopped', { reason });
  }

  publish(type, payload = {}) {
    this.events.emit(type, payload);
    this.events.emit('change', { cause: type });
  }

  // Plain-data view of the whole restaurant for rendering
  snapshot() {
    const s = this.session;
    if (!s) return null;
    const { stats } = s;
    return {
      running: s.running,
      stopReason: s.stopReason,
      elapsed: s.running ? s.clock.now() : s.stoppedAt,
      duration: s.config.duration,
      orderLine: s.orderLine.toArray(),
      taking: s.taker.current ? { customer: s.taker.current, orderNumber: s.taker.lastNumber + 1 } : null,
      preparing: s.cook.current,
      kitchenQueue: s.kitchen.toArray(),
      readyShelf: [...s.readyShelf.values()],
      handingOver: s.server.current,
      announced: s.server.lastAnnounced,
      servingLine: [...s.servingLine.values()],
      dining: [...s.dining],
      stats: {
        arrived: stats.arrived,
        served: stats.served,
        averageWaitMs: stats.served ? stats.totalWaitMs / stats.served : null,
        longestLine: stats.longestLine,
      },
    };
  }
}
