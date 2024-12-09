import type { CookieData, SessionMapType } from '$lib/server/types';

export function deleteExpiredSessions(map: SessionMapType) {
	const CURRENT_TIME_SECONDS = Math.floor(Date.now() / 1000);
	for (const [sessionId, session] of map) {
		if (session.expiresAt < CURRENT_TIME_SECONDS) {
			map.delete(sessionId);
		}
	}
}

export function parseCookie(sessionCookie: string) {
	const parsedCookie: CookieData = JSON.parse(sessionCookie);
	const { sessionId, expiresAt } = parsedCookie;
	return { sessionId, expiresAt };
}

export function validateSessionCookie(
	map: SessionMapType,
	cookieData: CookieData,
) {
	if (
		!cookieData.sessionId ||
		!cookieData.expiresAt ||
		!map.has(cookieData.sessionId)
	) {
		return false;
	}

	const sessionData = map.get(cookieData.sessionId);
	if (!sessionData || cookieData.expiresAt !== sessionData.expiresAt) {
		return false;
	}

	const CURRENT_TIME_SECONDS = Math.floor(Date.now() / 1000);
	if (sessionData.expiresAt < CURRENT_TIME_SECONDS) {
		return false;
	}

	return true;
}

export function* generateChunks(buffer: Uint8Array) {
	const BASE_CHUNK_SIZE_BYTES = 128;
	const MAX_CHUNK_SIZE_KB = 6 * 1024;
	const LARGE_FILE_THRESHOLD_MB = 10 * 1024 * 1024;

	let chunkSize = BASE_CHUNK_SIZE_BYTES;
	if (buffer.length > LARGE_FILE_THRESHOLD_MB) {
		chunkSize = Math.min(MAX_CHUNK_SIZE_KB, Math.ceil(buffer.length / 100));
	}

	for (let offset = 0; offset < buffer.length; offset += chunkSize) {
		yield buffer.slice(offset, offset + chunkSize);
	}
}

export function generateReadableStream(buffer: Uint8Array) {
	return new ReadableStream({
		start(controller) {
			const generator = generateChunks(buffer);
			const push = () => {
				const next = generator.next();
				if (next.done) {
					controller.close();
				} else {
					const TIMEOUT_DURATION_MS = 1;
					controller.enqueue(next.value);
					setTimeout(push, TIMEOUT_DURATION_MS);
				}
			};
			push();
		},
	});
}
