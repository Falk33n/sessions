import type { SessionDataProps, SessionMapType } from '$lib/server/types';
import {
	deleteExpiredSessions,
	generateReadableStream,
	parseCookie,
	validateSessionCookie,
} from '$lib/server/utils';
import { error, json, type RequestHandler } from '@sveltejs/kit';
import { v4 as uuidv4 } from 'uuid';

const sessionMap: SessionMapType = new Map<string, SessionDataProps>();

const INTERVAL_DURATION_MS = 1000 * 60;

setInterval(() => {
	deleteExpiredSessions(sessionMap);
}, INTERVAL_DURATION_MS);

async function parseRequest(
	request: Request,
): Promise<{ buffer: Uint8Array | null }> {
	const contentType = request.headers.get('Content-Type');
	if (!contentType?.includes('multipart/form-data')) {
		return { buffer: null };
	}

	const formData = await request.formData();
	const file = formData.get('file');
	if (!file || !(file instanceof Blob)) {
		return { buffer: null };
	}

	const arrayBuffer = await file.arrayBuffer();
	const buffer = new Uint8Array(arrayBuffer);

	return { buffer };
}

export const POST: RequestHandler = async ({ cookies, request }) => {
	const { buffer } = await parseRequest(request);
	if (!buffer) {
		throw error(500, 'Something went wrong');
	}

	const CURRENT_TIME_SECONDS = Math.floor(Date.now() / 1000);
	const SESSION_EXPIRATION_SECONDS = 60 * 10;
	const SESSION_LIFECYCLE = CURRENT_TIME_SECONDS + SESSION_EXPIRATION_SECONDS;
	const SESSION_EXPIRATION_DATE = new Date(SESSION_LIFECYCLE * 1000);

	let sessionId: string | undefined;
	let sessionData: SessionDataProps | undefined;

	const sessionCookie = cookies.get('sc');

	if (sessionCookie) {
		const parsedCookie = parseCookie(sessionCookie);
		sessionId = parsedCookie.sessionId;
		const isCookieValid = validateSessionCookie(sessionMap, parsedCookie);

		if (!isCookieValid) {
			if (sessionId) sessionMap.delete(sessionId);
			cookies.delete('sc', { path: '/' });
			sessionData = undefined;
			sessionId = undefined;
			throw error(403, 'Forbidden');
		} else if (sessionId) {
			sessionData = sessionMap.get(sessionId);
		}
	}

	let responseMessage: string | undefined;
	if (!sessionId) {
		sessionId = uuidv4();
		responseMessage = 'Created session';
	}

	sessionData = {
		expiresAt: SESSION_LIFECYCLE,
		data: buffer,
	};

	const cookieData = JSON.stringify({
		sessionId,
		expiresAt: SESSION_LIFECYCLE,
	});
	cookies.set('sc', cookieData, {
		secure: true,
		httpOnly: true,
		sameSite: 'strict',
		expires: SESSION_EXPIRATION_DATE,
		path: '/',
	});
	sessionMap.set(sessionId, {
		...sessionData,
	});

	return json(responseMessage ?? 'Updated session', { status: 200 });
};

export const GET: RequestHandler = async ({ cookies }) => {
	const sessionCookie = cookies.get('sc');
	if (!sessionCookie) {
		throw error(403, 'Forbidden');
	}

	const parsedCookie = parseCookie(sessionCookie);
	const sessionId = parsedCookie.sessionId;
	const isCookieValid = validateSessionCookie(sessionMap, parsedCookie);

	if (!isCookieValid || !sessionId) {
		if (sessionId) sessionMap.delete(sessionId);
		cookies.delete('sc', { path: '/' });
		throw error(403, 'Forbidden');
	}

	const sessionData = sessionMap.get(sessionId);
	if (!sessionData || !sessionData.data) {
		throw error(404, 'Not found');
	}

	const readableStream = generateReadableStream(sessionData.data);
	return new Response(readableStream, {
		status: 200,
		statusText: 'OK',
		headers: { 'Content-Type': 'text/event-stream' },
	});
};
