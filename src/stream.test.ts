import { ClosedError } from './errors'
import { StrictCircularBuffer } from './circular-buffer'
import { Stream } from './stream'

describe('stream', () => {
	test('read write', async () => {
		const s = new Stream(new StrictCircularBuffer(5))

		// [*42, 32, 28, _, _]
		await s.write(Uint8Array.from([42, 32, 28]))

		{
			// [(42, 32), *28, _, _]
			const data = new Uint8Array(2)
			await expect(s.read(data)).resolves.toBe(2)
			expect(data).toStrictEqual(Uint8Array.from([42, 32]))
		}

		{
			// [_, _, (28), _, _]
			const data = new Uint8Array(2)
			await expect(s.read(data)).resolves.toBe(1)
			expect(data[0]).toBe(28)
		}
	})

	test('read blocked until write if buffer is empty', async () => {
		const s = new Stream(new StrictCircularBuffer(5))

		let i = 0
		setTimeout( () => {
			i++
			// [*42, 32, 28, _, _]
			s.write(Uint8Array.from([42, 32, 28]))			
		}, 1)

		// [(42, 32), *28, _, _]
		const data = new Uint8Array(2)
		await expect(s.read(data)).resolves.toBe(2)
		expect(data).toStrictEqual(Uint8Array.from([42, 32]))
		expect(i).toBe(1)
	})

	test('write blocked until read if buffer is full', async () => {
		const s = new Stream(new StrictCircularBuffer(5))

		// [*42, 32, 28, 31, 17]
		await s.write(Uint8Array.from([42, 32, 28, 31, 17]))
		
		const data = new Uint8Array(2)
		let read: Promise<number|null> = Promise.resolve(-1)

		let i = 0
		setTimeout(() => {
			i++
			read = s.read(data)
		}, 1)

		// [*42, 32, 28, 31, 17]
		// [ 41, 53]
		await s.write(Uint8Array.from([41, 53]))
		expect(i).toBe(1)

		//    [(42, 32), *28, 31, 17]
		// -> [ 41, 53 , *28, 31, 17]
		await expect(read).resolves.toBe(2)
		expect(data).toStrictEqual(Uint8Array.from([42, 32]))

		{
			// [41, 53), (28, 31, 17]
			const data = new Uint8Array(5)
			await expect(s.read(data)).resolves.toBe(5)
			expect(data).toStrictEqual(Uint8Array.from([28, 31, 17, 41, 53]))
		}
	})

	it('returns null on read if stream is closed', async () => {
		const s = new Stream(new StrictCircularBuffer(5))
		s.close()
		expect(s.isClosed).toBe(true)

		await expect(s.read(new Uint8Array(42))).resolves.toBe(null)
	})

	it('throws ClosedError on write if stream is closed', async () => {
		const s = new Stream(new StrictCircularBuffer(5))
		s.close()
		expect(s.isClosed).toBe(true)

		await expect(s.write(new Uint8Array(42))).rejects.toThrowError(ClosedError)
	})

	test('blocked read is unblocked if stream is closed', async () => {
		const s = new Stream(new StrictCircularBuffer(5))

		let i = 0
		setTimeout(() => {
			i++
			s.close()
		}, 1)

		await expect(s.read(new Uint8Array(42))).resolves.toBe(null)
		expect(i).toBe(1)
	})

	test('blocked write is unblocked if stream is closed', async () => {
		const s = new Stream(new StrictCircularBuffer(5))
		await s.write(Uint8Array.from([42, 32, 28, 31, 17]))

		let i = 0
		setTimeout(() => {
			i++
			s.close()
		}, 1)

		await expect(s.write(new Uint8Array(42))).rejects.toThrowError(ClosedError)
		expect(i).toBe(1)
	})

	test('flush multiple hanging write', async () => {
		const s = new Stream(new StrictCircularBuffer(5))

		// [*42, 32, 28, 31, 17]
		await s.write(Uint8Array.from([42, 32, 28, 31, 17]))

		// [*42, 32, 28, 31, 17]
		// [ 41, 53, 21]
		const hangingWrite = Promise.all([
			s.write(Uint8Array.from([41])),
			s.write(Uint8Array.from([53])),
			s.write(Uint8Array.from([21])),
		])

		//    [(42, 32), *28, 31, 17]
		// -> [ 41, 53 , *28, 31, 17]
		//               [21]
		await s.read(new Uint8Array(2))

		{
			//    [ 41, 53), (28, 31, 17]
			// -> [   _,  _, *21,  _,  _]
			const data = new Uint8Array(5)
			await expect(s.read(data)).resolves.toBe(5)
			expect(data).toStrictEqual(Uint8Array.from([28, 31, 17, 41, 53]))
		}
		
		{
			// [_, _, (21), _, _]
			const data = new Uint8Array(3)
			await expect(s.read(data)).resolves.toBe(1)
			expect(data[0]).toBe(21)
		}

		await hangingWrite
	})

	test('hanging read is resolved on the first write, regardless of size', async () => {
		const s = new Stream(new StrictCircularBuffer(5))
		
		const data = Uint8Array.from([0xAB, 0xCD, 0xEF])
		const hangingRead = s.read(data)

		await Promise.all([
			s.write(Uint8Array.from([42, 32])),
			s.write(Uint8Array.from([28])),
		])

		expect(hangingRead).resolves.toBe(2)
		expect(data).toStrictEqual(Uint8Array.from([42, 32, 0xEF]))
	})

	test('read multiple hanging write at once', async () => {
		const s = new Stream(new StrictCircularBuffer(5))

		// [*42, 32, 28, 31, 17]
		await s.write(Uint8Array.from([42, 32, 28, 31, 17]))

		// [*42, 32, 28, 31, 17]
		// [ 41, 53, 21]
		const hangingWrite = Promise.all([
			s.write(Uint8Array.from([41])),
			s.write(Uint8Array.from([53])),
			s.write(Uint8Array.from([21])),
		])
		
		{
			//    [(42, 32 ,  28, 31, 17]
			//    [ 41, 53),  21]
			// -> [  _,   _, *21,  _,  _]
			const data = new Uint8Array(7)
			await expect(s.read(data)).resolves.toBe(7)
			expect(data).toStrictEqual(Uint8Array.from([42, 32, 28, 31, 17, 41, 53]))
		}
		
		{
			// [_, _, (21), _, _]
			const data = new Uint8Array(3)
			await expect(s.read(data)).resolves.toBe(1)
			expect(data[0]).toBe(21)
		}

		await hangingWrite
	})

	test('partial write', async () => {
		const s = new Stream(new StrictCircularBuffer(5))

		// [*42, 32, 28, _, _]
		await s.write(Uint8Array.from([42, 32, 28]))
		
		// [*42, 32, 28, 31, 17]
		// [ 41, 53, 21]
		const hangingWrite = Promise.all([
			// 21 may be written first if partial write does not performed.
			s.write(Uint8Array.from([31, 17, 41, 53])),
			s.write(Uint8Array.from([21])),
		])

		{
			//    [(42, 32, 28, 31, 17)]
			//    [ 41, 53, 21]
			// -> [*41, 53, 21,  _,  _ ]
			const data = new Uint8Array(5)
			await expect(s.read(data)).resolves.toBe(5)
			expect(data).toStrictEqual(Uint8Array.from([42, 32, 28, 31, 17]))
		}

		{
			// [(41, 53, 21), _, _]
			const data = new Uint8Array(3)
			await expect(s.read(data)).resolves.toBe(3)
			expect(data).toStrictEqual(Uint8Array.from([41, 53, 21]))
		}

		await hangingWrite
	})

	it('can be closed multiple times', () => {
		const s = new Stream(new StrictCircularBuffer(5))
		
		s.close()
		expect(s.isClosed).toBe(true)
		
		s.close()
		expect(s.isClosed).toBe(true)
	})
})
