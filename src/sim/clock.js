// Time source for the simulation. Actors only ever call now() and delay(), so the
// real clock can be swapped for a virtual one in tests (dependency inversion).

export class CancelledError extends Error {
  constructor() {
    super('Simulation stopped');
    this.name = 'CancelledError';
  }
}

export const isCancelled = (err) => err instanceof CancelledError;

export class RealClock {
  // speed > 1 runs the simulation faster than real time
  constructor({ speed = 1 } = {}) {
    this.speed = speed;
    this.origin = performance.now();
    this.pending = new Set();
  }

  // Simulated milliseconds since the clock was created
  now() {
    return (performance.now() - this.origin) * this.speed;
  }

  delay(ms) {
    return new Promise((resolve, reject) => {
      const timer = { reject };
      timer.id = setTimeout(() => {
        this.pending.delete(timer);
        resolve();
      }, ms / this.speed);
      this.pending.add(timer);
    });
  }

  // Rejects every pending delay so all actor loops stop
  cancelAll() {
    for (const timer of this.pending) {
      clearTimeout(timer.id);
      timer.reject(new CancelledError());
    }
    this.pending.clear();
  }
}

// Virtual clock for tests: time only moves when advance() is called
export class FakeClock {
  constructor() {
    this.time = 0;
    this.timers = [];
    this.seq = 0;
  }

  now() {
    return this.time;
  }

  delay(ms) {
    return new Promise((resolve, reject) => {
      this.timers.push({ at: this.time + ms, seq: this.seq++, resolve, reject });
    });
  }

  cancelAll() {
    const timers = this.timers;
    this.timers = [];
    timers.forEach((t) => t.reject(new CancelledError()));
  }

  advance(ms) {
    return this.advanceTo(this.time + ms);
  }

  // Fires due timers one at a time, letting promise chains settle in between
  advanceTo(target) {
    return settle().then(() => {
      this.timers.sort((a, b) => a.at - b.at || a.seq - b.seq);
      const next = this.timers[0];
      if (!next || next.at > target) {
        this.time = target;
        return settle();
      }
      this.timers.shift();
      this.time = next.at;
      next.resolve();
      return this.advanceTo(target);
    });
  }
}

// A macrotask boundary: every queued promise reaction runs before it resolves
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
