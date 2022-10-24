import { Buffer } from './buffer'

interface Window {
	offset: number
	length: number
}

export class CircularBuffer {
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

	read(data: Int8Array): number {
		const len = Math.min(this._window.length, data.byteLength)
			
		const isFragmented = (this._window.offset + len) > this.capacity
		if(isFragmented) {
			const partialLen = this.capacity - this._window.offset

			data.set(new Int8Array(this._buffer, this._window.offset, partialLen))
			data.set(new Int8Array(this._buffer, 0, len - partialLen), partialLen)
		} else {
			data.set(new Int8Array(this._buffer, this._window.offset, len))
		}
			
		this._window.offset = (this._window.offset + len) % this.capacity
		this._window.length -= len
		return len
	}

	write(data: Int8Array): number {
		if(data.length >= this.capacity) {
			new Int8Array(this._buffer).set(data.subarray(data.length - this._buffer.byteLength))
			this._window = { offset: 0, length: this.capacity }

			return data.length
		}
		
		const offsetNext = this._window.offset + this._window.length
		const beg = offsetNext % this.capacity
		
		const isFragmented = offsetNext > this.capacity
		const needFragment = !isFragmented && ((offsetNext + data.length) > this.capacity)
		if(needFragment) {
			const partialLen = this.capacity - beg

			new Int8Array(this._buffer).set(data.subarray(0, partialLen), beg)
			new Int8Array(this._buffer).set(data.subarray(partialLen))
		} else {
			new Int8Array(this._buffer).set(data, beg)
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
	write(data: Int8Array): number {
		const space = this.capacity - this._window.length
		if(space === 0) {
			return 0
		} else if(space < data.byteLength) {
			return this.write(data.subarray(0, space))
		}
		
		const offsetNext = this._window.offset + this._window.length
		const beg = offsetNext % this.capacity
		
		const isFragmented = offsetNext > this.capacity
		const needFragment = !isFragmented && ((offsetNext + data.length) > this.capacity)
		if(needFragment) {
			const partialLen = this.capacity - beg

			new Int8Array(this._buffer).set(data.subarray(0, partialLen), beg)
			new Int8Array(this._buffer).set(data.subarray(partialLen))
		} else {
			new Int8Array(this._buffer).set(data, beg)
		}

		this._window.length += data.length
		return data.byteLength
	}
}
