import { CircularBuffer, StrictCircularBuffer } from './circular-buffer'

interface TestSuite {
	name: string
	make: (capacity: number)=> CircularBuffer
}

describe.each<TestSuite>([
	{
		name: 'CircularBuffer',
		make: (c: number) => new CircularBuffer(c),
	},
	{
		name: 'StrictCircularBuffer',
		make: (c: number) => new StrictCircularBuffer(c),
	},
])('$name', ({ make }) => {
	test('read write', () => {
		const b = make(5)
		
		// [*42, 32, 28, _, _]
		expect(b.write(Int8Array.from([42, 32, 28]))).toBe(3)
		expect(b.length).toBe(3)

		{
			// [(42, 32), *28, _, _]
			const data = new Int8Array(2)
			expect(b.read(data)).toBe(2)
			expect(b.length).toBe(1)
			expect(data).toStrictEqual(Int8Array.from([42, 32]))
		}

		
		{
			// [_, _, (28), _, _]
			const data = new Int8Array(2)
			expect(b.read(data)).toBe(1)
			expect(b.length).toBe(0)
			expect(data[0]).toBe(28)
		}
	})

	test('read write fragmented', () => {
		const b = make(5)

		// [(42, 32), *28, _, _]
		expect(b.write(Int8Array.from([42, 32, 28]))).toBe(3)
		expect(b.read(new Int8Array(2))).toBe(2)
		expect(b.length).toBe(1)

		// [41, 53, *28, 31, 17]
		expect(b.write(Int8Array.from([31, 17, 41, 53]))).toBe(4)
		expect(b.length).toBe(5)

		// [41, 53), (28, 31, 17]
		const data = new Int8Array(5)
		expect(b.read(data)).toBe(5)
		expect(b.length).toBe(0)
		expect(data).toStrictEqual(Int8Array.from([28, 31, 17, 41, 53]))
	})

	test('write more on fragmented', () => {
		const b = make(5)

		// [(42, 32, 28), *31, _]
		expect(b.write(Int8Array.from([42, 32, 28, 31]))).toBe(4)
		expect(b.read(new Int8Array(3))).toBe(3)
		expect(b.length).toBe(1)

		// [41, _, _, *31, 17]
		expect(b.write(Int8Array.from([17, 41]))).toBe(2)
		expect(b.length).toBe(3)

		
		// [41, 53, _, *31, 17]
		expect(b.write(Int8Array.from([53]))).toBe(1)
		expect(b.length).toBe(4)

		const data = new Int8Array(4)
		expect(b.read(data)).toBe(4)
		expect(b.length).toBe(0)
		expect(data).toStrictEqual(Int8Array.from([31, 17, 41, 53]))
	})

	test('read write at the edge', () => {
		const b = make(5)

		// [(42, 32, 28, 31), *17]
		expect(b.write(Int8Array.from([42, 32, 28, 31, 17]))).toBe(5)
		expect(b.read(new Int8Array(4))).toBe(4)
		expect(b.length).toBe(1)

		// [41, 53, _, _, *17]
		expect(b.write(Int8Array.from([41, 53]))).toBe(2)
		expect(b.length).toBe(3)
		
		{
			// [41, 53, _, _, (17)]
			const data = new Int8Array(1)
			expect(b.read(data)).toBe(1)
			expect(b.length).toBe(2)
			expect(data).toStrictEqual(Int8Array.from([17]))
		}
		
		{
			// [(41, 53), _, _, _]
			const data = new Int8Array(5)
			expect(b.read(data)).toBe(2)
			expect(b.length).toBe(0)
			expect(data.subarray(0, 2)).toStrictEqual(Int8Array.from([41, 53]))
		}
	})

	it('can be read using span that is larger than buffer\'s capacity', () => {
		const b = make(5)
		expect(b.capacity).toBe(5)

		// [*42, 32, 28, 31, 17]
		expect(b.write(Int8Array.from([42, 32, 28, 31, 17]))).toBe(5)
		expect(b.length).toBe(5)
		
		// [(42, 32, 28, 31, 17)]
		const data = new Int8Array(523)
		expect(b.read(data)).toBe(5)
		expect(b.length).toBe(0)
	})

	it('read nothing if buffer is empty', () => {
		const b = make(5)
		
		expect(b.read(new Int8Array(5))).toBe(0)

		expect(b.write(Int8Array.from([42]))).toBe(1)
		expect(b.read(new Int8Array(1))).toBe(1)
		expect(b.length).toBe(0)

		expect(b.read(new Int8Array(5))).toBe(0)
	})
})

describe('CircularBuffer', () => {
	test('overwrite old data', () => {
		const b = new CircularBuffer(5)

		// [(42, 32), *28, 31, _]
		expect(b.write(Int8Array.from([42, 32, 28, 31]))).toBe(4)
		expect(b.read(new Int8Array(2))).toBe(2)
		expect(b.length).toBe(2)

		// [41, 53, 21, *31, 17]
		expect(b.write(Int8Array.from([17, 41, 53, 21]))).toBe(4)
		expect(b.length).toBe(5)

		{
			// [41, 53, 21, (31), *17]
			const data = new Int8Array(1)
			expect(b.read(data)).toBe(1)
			expect(b.length).toBe(4)
			expect(data).toStrictEqual(Int8Array.from([31]))
		}
		

		{
			// [41), 53, 21, _, (17]
			const data = new Int8Array(2)
			expect(b.read(data)).toBe(2)
			expect(b.length).toBe(2)
			expect(data).toStrictEqual(Int8Array.from([17, 41]))
		}
	})

	test('overwrite at the edge', () => {
		const b = new CircularBuffer(5)

		// [*42, 32, 28, 31, 17]
		expect(b.write(Int8Array.from([42, 32, 28, 31, 17]))).toBe(5)
		expect(b.length).toBe(5)
		
		// [41, 53, *28, 31, 17]
		expect(b.write(Int8Array.from([41, 53]))).toBe(2)
		expect(b.length).toBe(5)
		

		{
			// [41, 53, (28, 31), *17]
			const data = new Int8Array(2)
			expect(b.read(data)).toBe(2)
			expect(b.length).toBe(3)
			expect(data).toStrictEqual(Int8Array.from([28, 31]))
		}
		
		// [*41, 53, 21, 37, 91]
		expect(b.write(Int8Array.from([21, 37, 91]))).toBe(3)
		expect(b.length).toBe(5)
		
		{
			// [(41, 53, 21), *37, 91]
			const data = new Int8Array(3)
			expect(b.read(data)).toBe(3)
			expect(b.length).toBe(2)
			expect(data).toStrictEqual(Int8Array.from([41, 53, 21]))
		}
	})

	test('write more than capacity', () => {
		const b = new CircularBuffer(5)

		// Note that this is an illustration.
		//    [*42, 32, 28, 31, 17]
		// -> [41, 53, *28, 31, 17]
		// Implementation reset the window if size of input is greater than
		// its capacity, so:
		// -> [*28, 31, 17, 41, 53]
		expect(b.write(Int8Array.from([42, 32, 28, 31, 17, 41, 53]))).toBe(7)
		expect(b.length).toBe(5)

		// [(28, 31), *17, 41, 53]
		const data = new Int8Array(2)
		expect(b.read(data)).toBe(2)
		expect(b.length).toBe(3)
		expect(data).toStrictEqual(Int8Array.from([28, 31]))
	})
})

describe('StrictCircularBuffer', () => {
	it('returns written number of bytes if trying to write more than its capacity', () => {
		const b = new StrictCircularBuffer(5)
		expect(b.capacity).toBe(5)

		// [*42, 32, 28, 31, 17]
		expect(b.write(Int8Array.from([42, 32, 28, 31, 17, 41, 53]))).toBe(5)
		expect(b.length).toBe(5)

		// [(42, 32), *28, 31, 17]
		const data = new Int8Array(2)
		expect(b.read(data)).toBe(2)
		expect(data).toStrictEqual(Int8Array.from([42, 32]))
	})
})
