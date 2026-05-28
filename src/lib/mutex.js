/**
 * Tiny single-resource mutex (Promise-chained).
 *
 * Use when you need to serialize an async section that touches shared
 * mutable state. JS is single-threaded but `await` can interleave; a mutex
 * keeps a critical section atomic across awaits.
 *
 *   const mu = new Mutex();
 *   await mu.run(async () => { ...critical work... });
 */

'use strict';

class Mutex {
  constructor() {
    this._tail = Promise.resolve();
  }

  /** Run `fn` exclusively. Returns whatever fn returns. */
  run(fn) {
    const next = this._tail.then(fn, fn);
    // Swallow rejection on the chain so one error doesn't deadlock the queue.
    this._tail = next.catch(() => {});
    return next;
  }
}

module.exports = { Mutex };
