import { ClosedError } from './errors'
import { Buffer } from './buffer'

export interface Reader {
	tryRead(dst: Int8Array): number

	read(dst: Int8Array): Promise<number>
}

export interface Writer {
	tryWrite(src: Int8Array): number

	write(src: Int8Array): Promise<void>
}

interface WriteTaskResult {
	cnt: number,
	done: boolean
}

interface ReadTask {
	abort(err: Error): void
	write(src: Int8Array): number
}

interface WriteTask {
	abort(err: Error): void
	read(dst: Int8Array): WriteTaskResult
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
			task?.abort(new ClosedError())
		}

		this.#readTask = undefined
		this.#writeTasks = []
	}

	tryRead(dst: Int8Array): number {
		this.#throwIfClosed()

		let cntAll = this.#buffer.read(dst)
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

	async read(dst: Int8Array): Promise<number> {
		this.#throwIfClosed()

		{
			const cnt = this.tryRead(dst)
			if(cnt > 0) {
				return cnt
			}
		}

		return new Promise<number>((resolve, reject) => {
			this.#readTask = {
				abort: (err: Error) => reject(err),
				write: (src: Int8Array): number => {
					const cnt = Math.min(dst.byteLength, src.byteLength)					
					dst.set(src.subarray(0, cnt))

					resolve(cnt)

					return cnt
				},
			}
		})
	}

	tryWrite(src: Int8Array): number {
		this.#throwIfClosed()

		if(this.#readTask) {
			const cnt = this.#readTask.write(src)
			this.#readTask = undefined

			if(cnt === src.byteLength) {
				return cnt
			}
			
			src = src.subarray(cnt)
			return this.#buffer.write(src) + cnt
		} else {
			return this.#buffer.write(src)
		}		
	}

	async write(src: Int8Array): Promise<void> {
		this.#throwIfClosed()

		{
			const cnt = this.tryWrite(src)
			if(cnt === src.byteLength) {
				return
			}

			src = src.subarray(cnt)
		}

		return new Promise<void>((resolve, reject) => {
			this.#writeTasks.push({
				abort: (err: Error) => reject(err),
				read: (dst: Int8Array): WriteTaskResult => {
					const cnt = Math.min(dst.byteLength, src.byteLength)
					dst.set(src.subarray(0, cnt))
					src = src.subarray(cnt)

					const done = dst.byteLength >= src.byteLength
					if(done) {
						resolve()
					}

					return { cnt, done }
				},
				flush: (): WriteTaskResult => {
					const cnt = this.#buffer.write(src)
					src = src.subarray(cnt)

					const done = src.byteLength === 0
					if(done) {
						resolve()
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

