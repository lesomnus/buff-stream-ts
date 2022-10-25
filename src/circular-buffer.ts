import { Buffer } from './types'

interface Window {
	offset: number
	length: number
}

export class CircularBuffer implements Buffer {
	constructor(capacity: number) {
		this._buffer = new ArrayBuffer(capacity)
		this._window = { offset: 0, length: 0 }
	}

	get capacity(): number {
		return this._buffer.byteLength
	}

	get length(): number {
		return this._window.length
	}

	readSync(data: Uint8Array): number {
		const len = Math.min(this._window.length, data.byteLength)
			
		const isFragmented = (this._window.offset + len) > this.capacity
		if(isFragmented) {
			const partialLen = this.capacity - this._window.offset

			data.set(new Uint8Array(this._buffer, this._window.offset, partialLen))
			data.set(new Uint8Array(this._buffer, 0, len - partialLen), partialLen)
		} else {
			data.set(new Uint8Array(this._buffer, this._window.offset, len))
		}
			
		this._window.offset = (this._window.offset + len) % this.capacity
		this._window.length -= len
		return len
	}

	writeSync(data: Uint8Array): number {
		if(data.length >= this.capacity) {
			new Uint8Array(this._buffer).set(data.subarray(data.length - this._buffer.byteLength))
			this._window = { offset: 0, length: this.capacity }

			return data.length
		}
		
		const offsetNext = this._window.offset + this._window.length
		const beg = offsetNext % this.capacity
		
		const isFragmented = offsetNext > this.capacity
		const needFragment = !isFragmented && ((offsetNext + data.length) > this.capacity)
		if(needFragment) {
			const partialLen = this.capacity - beg

			new Uint8Array(this._buffer).set(data.subarray(0, partialLen), beg)
			new Uint8Array(this._buffer).set(data.subarray(partialLen))
		} else {
			new Uint8Array(this._buffer).set(data, beg)
		}

		this._window.length += data.length
		if(this._window.length > this.capacity) {
			const over = this._window.length - this.capacity
			this._window = {
				offset: (this._window.offset + over) % this.capacity,
				length: this.capacity,
			}
		}
		
		return data.length
	}


	protected _buffer: ArrayBuffer
	protected _window: Window
}


export class StrictCircularBuffer extends CircularBuffer {
	writeSync(data: Uint8Array): number {
		const space = this.capacity - this._window.length
		if(space === 0) {
			return 0
		} else if(space < data.byteLength) {
			return this.writeSync(data.subarray(0, space))
		}
		
		const offsetNext = this._window.offset + this._window.length
		const beg = offsetNext % this.capacity
		
		const isFragmented = offsetNext > this.capacity
		const needFragment = !isFragmented && ((offsetNext + data.length) > this.capacity)
		if(needFragment) {
			const partialLen = this.capacity - beg

			new Uint8Array(this._buffer).set(data.subarray(0, partialLen), beg)
			new Uint8Array(this._buffer).set(data.subarray(partialLen))
		} else {
			new Uint8Array(this._buffer).set(data, beg)
		}

		this._window.length += data.length
		return data.byteLength
	}
}
