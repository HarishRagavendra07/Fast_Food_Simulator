// An order ticket carries the two promises the brief asks for:
//   ready  - the Server waits on this while the Cook prepares the order
//   served - the Customer waits on this while standing in the serving line
export class OrderTicket {
  constructor(number, customer, createdAt) {
    this.number = number;
    this.customer = customer;
    this.createdAt = createdAt;
    this.ready = new Promise((resolve) => {
      this.markReady = resolve;
    });
    this.served = new Promise((resolve) => {
      this.markServed = resolve;
    });
  }
}
