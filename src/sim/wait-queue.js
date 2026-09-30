import { CancelledError } from './clock.js';

// FIFO queue whose take() returns a Promise that resolves once an item is available.
// Used for the order line (customers) and the kitchen and pickup queues (tickets).
export class WaitQueue {
  constructor() {
    this.items = [];
    this.waiters = [];
  }

  get size() {
    return this.items.length;
  }

  toArray() {
    return [...this.items];
  }

  push(item) {
    const waiter = this.waiters.shift();
    if (waiter) waiter.resolve(item);
    else this.items.push(item);
  }

  take() {
    if (this.items.length) return Promise.resolve(this.items.shift());
    return new Promise((resolve, reject) => this.waiters.push({ resolve, reject }));
  }

  // Rejects anyone still waiting, so their loops end when the simulation stops
  close() {
    this.waiters.forEach((w) => w.reject(new CancelledError()));
    this.waiters = [];
  }
}
