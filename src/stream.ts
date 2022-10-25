import { Reader, Writer, Buffer } from './types'
import { ClosedError } from './errors'

interface WriteTaskResult {
	cnt: number,
	done: boolean
}

interface ReadTask {
	abort(): void
	write(src: Uint8Array): number
}

interface WriteTask {
	abort(): void
	read(dst: Uint8Array): WriteTaskResult
	flush(): WriteTaskResult
}

export class Stream implements Reader, Writer {
	constructor(buffer: Buffer) {
		this.#buffer = buffer
	}

	get isClosed(): boolean {
		return this.#isClosed
	}

	close(): void {
		if(this.#isClosed) {
			return
		}
		
		this.#isClosed = true

		const tasks = [this.#readTask, ...this.#writeTasks]
		for(const task of tasks) {
			task?.abort()
		}

		this.#readTask = undefined
		this.#writeTasks = []
	}

	readSync(dst: Uint8Array): number|null {
		if(this.isClosed) {
			return null
		}

		let cntAll = this.#buffer.readSync(dst)
		dst = dst.subarray(cntAll)

		let completed = 0
		for(const task of this.#writeTasks) {
			const { cnt, done } = task.read(dst)
			dst = dst.subarray(cnt)
			cntAll += cnt

			if(done) {
				completed++
			}

			if(dst.byteLength === 0) {
				break
			}
		}

		for(const task of this.#writeTasks.slice(completed)) {
			const { done } = task.flush()
			if(done) {
				completed++
				continue
			}

			break
		}

		this.#writeTasks = this.#writeTasks.slice(completed)

		return cntAll
	}

	async read(dst: Uint8Array): Promise<number | null> {
		const cnt = this.readSync(dst)
		if(cnt !== 0) {
			return cnt
		}

		return ((cntSum: number) => new Promise<number|null>((resolve, reject) => {
			this.#readTask = {
				abort: () => resolve(null),
				write: (src: Uint8Array): number => {
					const cnt = Math.min(dst.byteLength, src.byteLength)					
					dst.set(src.subarray(0, cnt))
					
					cntSum += cnt
					resolve(cntSum)

					return cnt
				},
			}
		}))(cnt)
	}

	writeSync(src: Uint8Array): number {
		this.#throwIfClosed()

		if(this.#readTask) {
			const cnt = this.#readTask.write(src)
			this.#readTask = undefined

			if(cnt === src.byteLength) {
				return cnt
			}
			
			src = src.subarray(cnt)
			return this.#buffer.writeSync(src) + cnt
		} else {
			return this.#buffer.writeSync(src)
		}		
	}

	async write(src: Uint8Array): Promise<number> {
		let cntSum = this.writeSync(src)
		if(cntSum === src.byteLength) {
			return cntSum
		}

		src = src.subarray(cntSum)

		return new Promise<number>((resolve, reject) => {
			this.#writeTasks.push({
				abort: () => reject(new ClosedError()),
				read: (dst: Uint8Array): WriteTaskResult => {
					const cnt = Math.min(dst.byteLength, src.byteLength)
					dst.set(src.subarray(0, cnt))
					src = src.subarray(cnt)

					cntSum += cnt

					const done = dst.byteLength >= src.byteLength
					if(done) {
						resolve(cntSum)
					}

					return { cnt, done }
				},
				flush: (): WriteTaskResult => {
					const cnt = this.#buffer.writeSync(src)
					src = src.subarray(cnt)

					cntSum += cnt

					const done = src.byteLength === 0
					if(done) {
						resolve(cntSum)
					}

					return { cnt, done }
				},
			})
		})
	}

	#throwIfClosed() {
		if(this.#isClosed) {
			throw new ClosedError()
		}
	}

	#isClosed = false
	#buffer: Buffer

	#readTask?: ReadTask
	#writeTasks: WriteTask[] = []
}

