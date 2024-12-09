export type SessionDataProps<T = Uint8Array | null> = {
	expiresAt: number;
	data?: T;
};

export type SessionMapType = Map<string, SessionDataProps<Uint8Array | null>>;

export type CookieData = {
	sessionId?: string;
	expiresAt?: number;
};

export type SessionRequestPayload = {
	sessionData?: Uint8Array | null;
};
