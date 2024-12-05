import { type Cookies, type Handle } from '@sveltejs/kit';
import { v4 as uuidv4 } from 'uuid';

const SESSION_EXPIRATION_SECONDS = 60 * 10;
const INTERVAL_DURATION_MILLISECONDS = 1000 * 60;

type SessionDataProps<T = ReadableStream<Uint8Array> | string | null> = {
	expiresAt: number;
	data?: T;
};

const sessionMap = new Map<string, SessionDataProps>();

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

type ParsedCookieDataProps = {
	sessionId: string;
	expiresAt?: number;
};

function parseSessionCookie(sessionCookie: string) {
	const parsedCookie: ParsedCookieDataProps = JSON.parse(sessionCookie);
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
			throw new Error('Unauthorized', { cause: { status: 401 } });
		}
	}
}

type SessionRequestDataProps = {
	sessionData?: ReadableStream<Uint8Array> | string;
};

async function parseRequest(request: Request) {
	const sessionRequest: SessionRequestDataProps = {};

	if (request.method === 'POST') {
		if (request.body) {
			sessionRequest.sessionData = request.body;
		} else {
			const data: SessionRequestDataProps = await request.json();
			sessionRequest.sessionData = data.sessionData;
		}
	}

	return { sessionRequest };
}

type CreateSessionDataProps = {
	sessionId: string;
	sessionRequest: SessionRequestDataProps;
};

type LocalsSessionData = NonNullable<App.Locals['sessionData']>;

function createSessionData({
	sessionId,
	sessionRequest,
}: CreateSessionDataProps) {
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
		SESSION_LIFECYCLE,
	};
}

type SetSessionDataProps = {
	cookies: Cookies;
	sessionId: string;
	SESSION_EXPIRATION_DATE: Date;
	SESSION_LIFECYCLE: number;
	locals: App.Locals;
	sessionData: SessionDataProps;
};

function setSessionData({
	cookies,
	sessionId,
	SESSION_EXPIRATION_DATE,
	SESSION_LIFECYCLE,
	locals,
	sessionData,
}: SetSessionDataProps) {
	const cookieValue = JSON.stringify({
		sessionId,
		expiresAt: SESSION_LIFECYCLE,
	});

	cookies.set('sc', cookieValue, {
		secure: true,
		httpOnly: true,
		sameSite: 'strict',
		expires: SESSION_EXPIRATION_DATE,
		path: '/',
	});

	sessionMap.set(sessionId, sessionData);

	locals.sessionData = {
		sessionId,
		expiresAt: SESSION_LIFECYCLE,
		data: sessionData.data,
	};
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

	const { sessionData, SESSION_EXPIRATION_DATE, SESSION_LIFECYCLE } =
		createSessionData({
			sessionId,
			sessionRequest,
		});

	setSessionData({
		cookies,
		sessionId,
		SESSION_EXPIRATION_DATE,
		SESSION_LIFECYCLE,
		locals,
		sessionData,
	});

	return await resolve(event);
};
