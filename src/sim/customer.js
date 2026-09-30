export class Customer {
  constructor(id, arrivedAt) {
    this.id = id;
    this.arrivedAt = arrivedAt;
    this.ticket = null;
    this.servedAt = null;
  }

  // Customer holds their ticket and waits in the serving line until it's handed over
  waitForOrder(ticket, clock) {
    this.ticket = ticket;
    return ticket.served.then(() => {
      this.servedAt = clock.now();
      return this;
    });
  }
}
