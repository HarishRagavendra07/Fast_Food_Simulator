// Minimal publish/subscribe so the simulation never depends on the UI.

// A failing listener (e.g. a UI bug) must never break the simulation loop that emitted the
// event, so its error goes to onListenerError instead of being thrown into the caller.
const reportLater = (err) =>
  setTimeout(() => {
    throw err;
  });

export class EventBus {
  constructor({ onListenerError = reportLater } = {}) {
    this.handlers = new Map();
    this.onListenerError = onListenerError;
  }

  on(type, handler) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type).add(handler);
    return () => this.handlers.get(type).delete(handler);
  }

  // '*' handlers receive every event as { ...payload, type }
  emit(type, payload = {}) {
    this.handlers.get(type)?.forEach((h) => this.call(h, payload));
    this.handlers.get('*')?.forEach((h) => this.call(h, { ...payload, type }));
  }

  call(handler, payload) {
    try {
      handler(payload);
    } catch (err) {
      this.onListenerError(err);
    }
  }
}

