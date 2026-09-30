# Fast Food Simulator

A take-away restaurant simulated in the browser. Customers arrive at a steady rate and queue to order. An **Order Taker** writes tickets, a **Cook** prepares them one at a time, and a **Server** calls each order at the pickup counter. Customers wait in the serving line, collect their food and head to the dining area.

Everything is coordinated with **native JavaScript Promises**. There's no `async`/`await` and no simulation library.

## Features

**Core**
- Inputs for the **customer arrival interval** and the **order fulfilment interval** (Cook time), with a specific warning message for each kind of bad input (empty, not a number, negative, zero, too large).
- **Start** and **Stop** buttons. Stop halts everything immediately and freezes the clock.
- Text boxes for every area:
  - **Order line:** customers waiting to order
  - **Order counter:** the order number being taken
  - **Kitchen:** the order being prepared, the waiting orders in sequence, and how many are waiting
  - **Pickup counter:** the order available for pickup, and customers in the serving line

**Bonus**
- Configurable **order taking time** and **delivery time**.
- An optional **total run time**, after which the simulation stops by itself.
- An **animated view**: customers 🧑 and orders 🍔 glide between areas. The same element moves and is animated from its old position (the FLIP technique), and animation is skipped when *prefers-reduced-motion* is set.

**Extras**
- A warning when a stage is slower than arrivals, e.g. "the Cook needs 3 s per order, so the lines will keep growing".
- A speed control (1×, 2×, 5× or 10×), live stats (arrived, served, average wait, longest line) and an event log.
- Dark/light mode and a mobile layout.

## How it works

### The two order-ticket Promises

Each `OrderTicket` carries the two Promises the brief asks for:

| Promise | Resolved by | Awaited by |
| --- | --- | --- |
| `ticket.ready` | the Cook, when the food is done | the Server, before calling the order |
| `ticket.served` | the Server, when the order is handed over | the Customer, standing in the serving line |

### Actors as Promise loops

Each role is a small class with a `run()` loop built from chained Promises:

```js
// Cook: take the next ticket, cook it for a fixed time, mark it ready, repeat
return forever(() =>
  this.kitchen.take().then((ticket) => {
    this.current = ticket;
    return this.clock.delay(this.prepTime).then(() => ticket.markReady());
  })
);
```

`WaitQueue.take()` returns a Promise that resolves when the next customer or ticket is available, so each actor simply waits for work. **Stop** rejects every pending delay and queue wait with a `CancelledError`, which ends all the loops at once.

### SOLID

- **Single responsibility:** `CustomerArrivals`, `OrderTaker`, `Cook` and `Server` each do one job. `Restaurant` only wires them together and tracks state, the view only renders, and `validateSettings` only validates.
- **Open/closed:** a new role, such as a second Cook, can subscribe to the same queues and events without changing the existing ones.
- **Liskov substitution:** `RealClock` and `FakeClock` are interchangeable anywhere a clock is expected.
- **Interface segregation:** an actor only depends on the queues and clock methods it uses.
- **Dependency inversion:** actors receive their clock, queues and event bus instead of creating them. That's what lets the tests swap in a virtual clock and run minutes of restaurant time in milliseconds.

A failing UI listener can't break the simulation: `EventBus` catches listener errors and reports them separately. The error reporter is injectable too.

## Getting started

```bash
npm install
npm run dev     # http://localhost:5173
npm test        # 13 tests on a virtual clock (node:test)
npm run build   # static site in dist/
```

The tests include an exact order timeline worked out by hand, constant arrival and completion rates, Stop and run-time behaviour, the two ticket Promises, validation messages, and a check that the source contains no `async`/`await`.

## Deploying

`.github/workflows/deploy.yml` tests, builds and publishes to GitHub Pages on every push to `main`. One-time setup: **Settings → Pages → Source: GitHub Actions**.

## Project structure

```
src/sim/clock.js         RealClock, FakeClock (tests), CancelledError
src/sim/wait-queue.js    FIFO queue with Promise-based take()
src/sim/order-ticket.js  the two ticket Promises
src/sim/customer.js      Customer
src/sim/actors.js        CustomerArrivals, OrderTaker, Cook, Server
src/sim/restaurant.js    wires one run together, snapshot() for the UI
src/sim/events.js        EventBus
src/sim/config.js        settings validation and warnings
src/ui/                  view, FLIP token animation, settings form
test/                    simulation tests
```

Project idea from [florinpop17/app-ideas](https://github.com/florinpop17/app-ideas/blob/master/Projects/3-Advanced/FastFood-App.md).
