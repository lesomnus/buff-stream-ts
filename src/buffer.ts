export interface Buffer {
	readonly capacity: number
	readonly length: number

	read(data: ArrayBufferLike): number

	write(data: ArrayBufferLike): number
}
