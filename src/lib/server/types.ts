type UploadedFile = { name: string; data: Uint8Array };

export type SessionData<T = UploadedFile[]> = {
	expiresAt: Date;
	files: T;
};

export type SessionMap = Map<string, SessionData<UploadedFile[]>>;

export type SessionCookie = {
	sessionId?: string;
	expiresAt?: Date;
};

export type UploadedFilePayload = {
	files?: UploadedFile[] | null;
};

export type ParsedFileRequest = {
	buffer: Uint8Array | null;
	fileName: string | null;
};
