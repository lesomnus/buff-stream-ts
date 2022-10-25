export interface MustReaderSync {
	readSync(dst: Uint8Array): number
}

export interface ReaderSync {
	readSync(dst: Uint8Array): number | null
}

export interface WriterSync {
	writeSync(src: Uint8Array): number
}

export interface Reader extends ReaderSync {
	read(dst: Uint8Array): Promise<number | null>
}

export interface Writer extends WriterSync {
	write(src: Uint8Array): Promise<number>
}

export interface Buffer extends MustReaderSync, WriterSync {
	readonly capacity: number
	readonly length: number
}
