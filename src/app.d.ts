type FileMetaData = {
	name: string;
	type: string;
	size: number;
	content: string | ReadableStream<Uint8Array>;
};

declare global {
	namespace App {
		// interface Error {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}

		interface Locals<
			T = ReadableStream<Uint8Array> | FileMetaData | string | null,
		> {
			sessionData?: {
				sessionId: string;
				expiresAt: number;
				data?: T;
			};
		}
	}
}
export {};
