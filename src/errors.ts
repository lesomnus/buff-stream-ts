export class ClosedError extends Error {
	constructor() {
		super('resource closed')
	}
}
