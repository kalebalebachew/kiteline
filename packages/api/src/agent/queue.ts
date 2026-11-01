/**
 * A push-based async iterable. The SDK reads user turns from one of these,
 * and every live subscriber gets its own to drain run events from.
 */
export class AsyncQueue<T> implements AsyncIterable<T> {
	private buffer: T[] = [];
	private waiters: ((result: IteratorResult<T>) => void)[] = [];
	private closed = false;

	push(value: T) {
		if (this.closed) return;
		const waiter = this.waiters.shift();
		if (waiter) waiter({ value, done: false });
		else this.buffer.push(value);
	}

	close() {
		if (this.closed) return;
		this.closed = true;
		for (const waiter of this.waiters.splice(0)) {
			waiter({ value: undefined, done: true });
		}
	}

	get isClosed() {
		return this.closed;
	}

	[Symbol.asyncIterator](): AsyncIterator<T> {
		return {
			next: () => {
				const value = this.buffer.shift();
				if (value !== undefined) return Promise.resolve({ value, done: false });
				if (this.closed) return Promise.resolve({ value: undefined, done: true });
				return new Promise((resolve) => this.waiters.push(resolve));
			},
			return: () => {
				this.close();
				return Promise.resolve({ value: undefined, done: true });
			},
		};
	}
}
