import type { SessionCookie, SessionMap } from '$lib/server/types';
import { error } from '@sveltejs/kit';

export function removeExpiredSessions(sessionMap: SessionMap) {
	const currentTime = Date.now();
	for (const [sessionId, session] of sessionMap) {
		if (session.expiresAt.getTime() < currentTime) {
			sessionMap.delete(sessionId);
		}
	}
}

export function parseSessionCookie(sessionCookie: string): SessionCookie {
	const parsedCookie: SessionCookie = JSON.parse(sessionCookie);
	const { sessionId, expiresAt } = parsedCookie;

	return { sessionId, expiresAt: expiresAt ? new Date(expiresAt) : undefined };
}

export function validateSessionCookie(
	map: SessionMap,
	cookieData: SessionCookie,
) {
	if (!cookieData.sessionId || !cookieData.expiresAt) {
		return false;
	}

	const sessionData = map.get(cookieData.sessionId);
	if (!sessionData) {
		return false;
	}

	const currentTime = new Date();
	if (
		cookieData.expiresAt.getTime() !== sessionData.expiresAt.getTime() ||
		sessionData.expiresAt < currentTime
	) {
		return false;
	}

	return true;
}

export function* generateChunks(
	buffer: Uint8Array,
	{
		baseChunkSizeBytes = 128,
		maxChunkSizeKB = 6 * 1024,
		largeFileThresholdMB = 10 * 1024 * 1024,
	} = {},
) {
	if (buffer.length === 0) {
		throw error(400, 'Buffer is empty. Cannot generate chunks.');
	}

	let currentChunkSize = baseChunkSizeBytes;
	if (buffer.length > largeFileThresholdMB) {
		currentChunkSize = Math.min(maxChunkSizeKB, Math.ceil(buffer.length / 100));
	}

	for (
		let currentOffset = 0;
		currentOffset < buffer.length;
		currentOffset += currentChunkSize
	) {
		yield buffer.slice(currentOffset, currentOffset + currentChunkSize);
	}
}

export function generateReadableStream(
	buffer: Uint8Array,
	{ timeoutDurationMs = 1 } = {},
): ReadableStream<Uint8Array> {
	return new ReadableStream({
		start(controller) {
			const generator = generateChunks(buffer);

			const push = () => {
				const { value, done } = generator.next();
				if (done) {
					controller.close();
				} else {
					controller.enqueue(value);
					setTimeout(push, timeoutDurationMs);
				}
			};

			push();
		},
	});
}
