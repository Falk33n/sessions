import type {
	ParsedFileRequest,
	SessionData,
	SessionMap,
} from '$lib/server/types';
import {
	generateReadableStream,
	parseSessionCookie,
	removeExpiredSessions,
	validateSessionCookie,
} from '$lib/server/utils';
import { error, json, type RequestHandler } from '@sveltejs/kit';
import { v4 as uuidv4 } from 'uuid';

const sessionMap: SessionMap = new Map<string, SessionData>();

const SESSION_CLEANUP_INTERVAL_MS = 60 * 1000;
setInterval(() => {
	removeExpiredSessions(sessionMap);
}, SESSION_CLEANUP_INTERVAL_MS);

async function parseRequest(request: Request): Promise<ParsedFileRequest> {
	const contentType = request.headers.get('Content-Type');
	if (!contentType || !contentType.includes('multipart/form-data')) {
		return { buffer: null, fileName: null };
	}

	const formData = await request.formData();
	const file = formData.get('file') as Blob | null;

	if (!file) {
		return { buffer: null, fileName: null };
	}

	return {
		buffer: new Uint8Array(await file.arrayBuffer()),
		fileName: request.headers.get('X-File-Name') || 'unnamed-file',
	};
}

export const POST: RequestHandler = async ({ cookies, request }) => {
	const { buffer, fileName } = await parseRequest(request);

	if (!buffer || !fileName) {
		const missingField = !buffer ? 'file' : 'file name';
		throw error(400, `Missing ${missingField}.`);
	}

	if (buffer.length === 0) {
		throw error(400, 'File is empty.');
	}

	const SESSION_EXPIRATION_DURATION_MS = 10 * 60 * 1000;
	const SESSION_EXPIRATION_DATE = new Date(
		Date.now() + SESSION_EXPIRATION_DURATION_MS,
	);

	const sessionCookie = cookies.get('sc');
	let sessionId: string | undefined;
	let sessionData: SessionData | undefined;

	if (sessionCookie) {
		const parsedCookie = parseSessionCookie(sessionCookie);
		sessionId = parsedCookie.sessionId;

		if (sessionId && validateSessionCookie(sessionMap, parsedCookie)) {
			sessionData = sessionMap.get(sessionId);
		} else if (sessionId) {
			sessionMap.delete(sessionId);
			cookies.delete('sc', { path: '/' });
			sessionId = undefined;
		}
	}

	const responseMessage = !sessionId ? 'Created Session.' : 'Updated Session.';

	if (!sessionId) {
		sessionId = uuidv4();
	}

	if (!sessionData) {
		sessionData = {
			expiresAt: SESSION_EXPIRATION_DATE,
			files: [],
		};
	} else {
		sessionData.expiresAt = SESSION_EXPIRATION_DATE;

		const fileExists = sessionData.files.some((file) => file.name === fileName);
		if (fileExists) {
			throw error(
				409,
				'A file with the same name already exists in this session.',
			);
		}
	}

	sessionData.files.push({ name: fileName, data: buffer });

	sessionMap.set(sessionId, sessionData);

	const cookieData = JSON.stringify({
		sessionId,
		expiresAt: SESSION_EXPIRATION_DATE.toISOString(),
	});

	const COOKIE_OPTIONS = {
		secure: true,
		httpOnly: true,
		sameSite: 'strict' as const,
		expires: SESSION_EXPIRATION_DATE,
		path: '/',
	};

	cookies.set('sc', cookieData, COOKIE_OPTIONS);

	function logAllSessions(sessionMap: SessionMap): void {
		console.log('Logging all sessions and their files:');
		for (const [sessionId, sessionData] of sessionMap.entries()) {
			console.log(`Session ID: ${sessionId}`);
			console.log(`Expires At: ${sessionData.expiresAt.toISOString()}`);
			console.log('Files:');
			sessionData.files.forEach((file, index) => {
				console.log(`  ${index + 1}. File Name: ${file.name}`);
			});
			console.log('--------------------------------');
		}
	}
	logAllSessions(sessionMap);

	return json(responseMessage, {
		status: 200,
	});
};

export const GET: RequestHandler = async ({ url, cookies }) => {
	const sessionCookie = cookies.get('sc');
	if (!sessionCookie) {
		throw error(403, 'Forbidden.');
	}

	const parsedCookie = parseSessionCookie(sessionCookie);
	const sessionId = parsedCookie.sessionId;

	if (!sessionId || !validateSessionCookie(sessionMap, parsedCookie)) {
		if (sessionId) sessionMap.delete(sessionId);
		cookies.delete('sc', { path: '/' });
		throw error(403, 'Forbidden.');
	}

	const sessionData = sessionMap.get(sessionId);
	if (!sessionData) {
		throw error(404, 'Session not found.');
	}

	const fileName = url.searchParams.get('file');
	if (!fileName) {
		throw error(400, 'File name is required.');
	}

	const file = sessionData.files.find((f) => f.name === fileName);
	if (!file) {
		throw error(404, 'File not found.');
	}

	const readableStream = generateReadableStream(file.data);
	return new Response(readableStream, {
		status: 200,
		headers: { 'Content-Type': 'text/event-stream' },
	});
};
