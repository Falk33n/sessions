declare global {
	namespace App {
		// interface Error {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}

		interface Locals<T = ReadableStream<Uint8Array> | string | null> {
			sessionData?: {
				sessionId: string;
				expiresAt: number;
				data?: T;
			};
		}
	}
}
export {};
