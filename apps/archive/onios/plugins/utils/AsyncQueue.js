/**
 * AsyncQueue — A simple file/path-based execution queue to prevent
 * parallel reads/writes from stepping on each other (e.g., when sub-agents
 * write to the same memories.json concurrently).
 */

export class AsyncQueue {
    constructor() {
        // Map of path -> Promise
        this._queues = new Map();
    }

    /**
     * Enqueue an async operation for a specific key (e.g. file path).
     * @param {string} key - The identifier to queue operations for.
     * @param {function} asyncFn - A function returning a Promise.
     * @returns {Promise<any>}
     */
    enqueue(key, asyncFn) {
        if (!this._queues.has(key)) {
            // No existing queue for this key, start a new one
            this._queues.set(key, Promise.resolve());
        }

        // Add to the chain
        const chain = this._queues.get(key)
            .then(asyncFn)
            .catch((err) => {
                // If the user function throws, we still want the queue to continue
                // for subsequent operations
                throw err;
            });

        // The latest promise in the chain is exactly what we just built
        // We set that as the new tail. However, to prevent memory leaks,
        // we append a finally block that cleans up the map if this is the
        // last operation in the queue.
        const tail = chain.finally(() => {
            if (this._queues.get(key) === tail) {
                this._queues.delete(key);
            }
        });

        this._queues.set(key, tail);

        // Return the raw chain so the caller can catch errors
        return chain;
    }
}
