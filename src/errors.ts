export class ClosedError extends Error {
	constructor() {
		super('stream closed')
	}
}
