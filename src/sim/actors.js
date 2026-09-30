// The simulated staff and the customer arrivals. Each actor does one job (SRP) and
// receives the clock, queues and event bus it needs instead of creating them (DIP).
// Loops are plain promise chains: native Promises only, no async/await.
import { Customer } from './customer.js';
import { OrderTicket } from './order-ticket.js';

const forever = (step) => {
  const loop = () => step().then(loop);
  return loop();
};

// New customers join the order line at a constant rate
export class CustomerArrivals {
  constructor({ clock, events, orderLine, interval }) {
    Object.assign(this, { clock, events, orderLine, interval });
    this.count = 0;
  }

  run() {
    return forever(() => {
      const customer = new Customer(++this.count, this.clock.now());
      this.orderLine.push(customer);
      this.events.emit('customer:arrived', { customer });
      return this.clock.delay(this.interval);
    });
  }
}

// Takes the next customer's order and writes an order ticket
export class OrderTaker {
  constructor({ clock, events, orderLine, kitchen, pickup, takeTime }) {
    Object.assign(this, { clock, events, orderLine, kitchen, pickup, takeTime });
    this.current = null;
    this.lastNumber = 0;
  }

  run() {
    return forever(() =>
      this.orderLine.take().then((customer) => {
        this.current = customer;
        this.events.emit('order:taking', { customer });
        return this.clock.delay(this.takeTime).then(() => {
          const ticket = new OrderTicket(++this.lastNumber, customer, this.clock.now());
          this.current = null;
          this.kitchen.push(ticket); // for the Cook
          this.pickup.push(ticket); // for the Server, in the same order
          this.events.emit('order:placed', { ticket });
        });
      })
    );
  }
}

// Prepares tickets one at a time; each takes a fixed time, so orders finish at a constant rate
export class Cook {
  constructor({ clock, events, kitchen, prepTime }) {
    Object.assign(this, { clock, events, kitchen, prepTime });
    this.current = null;
  }

  run() {
    return forever(() =>
      this.kitchen.take().then((ticket) => {
        this.current = ticket;
        this.events.emit('order:cooking', { ticket });
        return this.clock.delay(this.prepTime).then(() => {
          this.current = null;
          ticket.markReady();
          this.events.emit('order:ready', { ticket });
        });
      })
    );
  }
}

// Waits on each ticket's "ready" promise, announces it at the pickup counter and hands it over
export class Server {
  constructor({ clock, events, pickup, deliverTime }) {
    Object.assign(this, { clock, events, pickup, deliverTime });
    this.current = null;
    this.lastAnnounced = null;
  }

  run() {
    return forever(() =>
      this.pickup.take().then((ticket) =>
        ticket.ready.then(() => {
          this.current = ticket;
          this.lastAnnounced = ticket;
          this.events.emit('order:announced', { ticket });
          return this.clock.delay(this.deliverTime).then(() => {
            this.current = null;
            ticket.markServed();
          });
        })
      )
    );
  }
}
