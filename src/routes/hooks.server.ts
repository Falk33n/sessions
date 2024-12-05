import { NODE_ENV } from '$env/static/private';
import { error, type Cookies, type Handle } from '@sveltejs/kit';
import { v4 as uuidv4 } from 'uuid';

const SESSION_EXPIRATION_SECONDS = 60 * 10;
const INTERVAL_DURATION_MILLISECONDS = 1000 * 60;

type SessionData<T = ReadableStream<Uint8Array> | string | null> = {
	expiresAt: number;
	data?: T;
};

const sessionMap = new Map<string, SessionData>();

function deleteExpiredSessions() {
	const CURRENT_TIME_SECONDS = Math.floor(Date.now() / 1000);
	for (const [sessionId, session] of sessionMap) {
		if (session.expiresAt < CURRENT_TIME_SECONDS) {
			sessionMap.delete(sessionId);
		}
	}
}

setInterval(() => {
	deleteExpiredSessions();
}, INTERVAL_DURATION_MILLISECONDS);

type ParsedCookieData = {
	sessionId: string;
	expiresAt?: number;
};

function parseSessionCookie(sessionCookie: string) {
	const parsedCookie: ParsedCookieData = JSON.parse(sessionCookie);
	const { sessionId, expiresAt } = parsedCookie;
	return { sessionId, expiresAt };
}

type CookieProps = {
	cookies: Cookies;
	sessionId: string;
	expiresAt: number;
};

function validateSessionCookie({ cookies, sessionId, expiresAt }: CookieProps) {
	if (sessionMap.has(sessionId)) {
		const storedSession = sessionMap.get(sessionId);
		if (storedSession && expiresAt !== storedSession.expiresAt) {
			sessionMap.delete(sessionId);
			cookies.delete('sc', {
				path: '/',
			});
			throw error(401, 'Unauthorized');
		}
	}
}

type SessionRequestData = {
	sessionData?: ReadableStream<Uint8Array> | string;
};

async function parseRequest(request: Request) {
	const sessionRequest: SessionRequestData = {};

	if (request.method === 'POST') {
		if (request.body) {
			sessionRequest.sessionData = request.body;
		} else {
			const data: SessionRequestData = await request.json();
			sessionRequest.sessionData = data.sessionData;
		}
	}

	return { sessionRequest };
}

type CreateSessionData = {
	sessionId: string;
	sessionRequest: SessionRequestData;
};

type LocalsSessionData = NonNullable<App.Locals['sessionData']>;

function createSessionData({ sessionId, sessionRequest }: CreateSessionData) {
	const CURRENT_TIME_SECONDS = Math.floor(Date.now() / 1000);
	const SESSION_LIFECYCLE = CURRENT_TIME_SECONDS + SESSION_EXPIRATION_SECONDS;
	const SESSION_EXPIRATION_DATE = new Date(SESSION_LIFECYCLE * 1000);

	const sessionData: LocalsSessionData = {
		sessionId,
		expiresAt: SESSION_LIFECYCLE,
		data: sessionRequest.sessionData,
	};

	return {
		sessionData,
		SESSION_EXPIRATION_DATE,
	};
}

type SetSessionData = {
	cookies: Cookies;
	sessionId: string;
	SESSION_EXPIRATION_DATE: Date;
	locals: App.Locals;
	sessionData: LocalsSessionData;
};

function setSessionData({
	cookies,
	sessionId,
	SESSION_EXPIRATION_DATE,
	locals,
	sessionData,
}: SetSessionData) {
	cookies.set('sc', sessionId, {
		secure: NODE_ENV === 'production',
		httpOnly: true,
		sameSite: 'strict',
		expires: SESSION_EXPIRATION_DATE,
		path: '/',
	});
	sessionMap.set(sessionId, sessionData);
	locals.sessionData = sessionData;
}

export const handle: Handle = async ({ event, resolve }) => {
	const { cookies, request, locals } = event;
	const sessionCookie = cookies.get('sc');

	let sessionId: string | undefined;
	let expiresAt: number | undefined;

	if (sessionCookie) {
		const parsedCookie = parseSessionCookie(sessionCookie);
		sessionId = parsedCookie.sessionId;
		expiresAt = parsedCookie.expiresAt;

		if (expiresAt) {
			validateSessionCookie({ cookies, sessionId, expiresAt });
		}
	} else {
		sessionId = uuidv4();
	}

	const { sessionRequest } = await parseRequest(request);

	const { sessionData, SESSION_EXPIRATION_DATE } = createSessionData({
		sessionId,
		sessionRequest,
	});

	setSessionData({
		cookies,
		sessionId,
		SESSION_EXPIRATION_DATE,
		locals,
		sessionData,
	});

	return await resolve(event);
};
