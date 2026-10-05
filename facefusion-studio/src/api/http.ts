import type {
	Asset,
	AssetList,
	AssetType,
	CaptureQuery,
	Capabilities,
	EngineState,
	JobDetail,
	JobIndex,
	MetricsSet,
	ServerIdentity,
	SessionInfo,
	SessionTokens
} from './types';
import { ApiError } from './types';
import { jobStatuses, type StudioConfig } from './config';
import type {
	ConnectionListener,
	ConnectionPhase,
	FaceFusionApi,
	ImageSocket,
	JobAction,
	SocketHandlers,
	StepAction,
	WebRtcSession
} from './api';

const SESSION_LIFETIME_MS = 10 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 120_000;
const ICE_GATHER_TIMEOUT_MS = 2500;

/**
 * Talks to an unmodified `python facefusion.py api` server.
 *
 * Responsibilities that live here rather than in React: bearer-token
 * injection, the 10 minute session rotation, transparent recovery when the
 * server drops a session (401 / 426) and the WebRTC handshake, which has to
 * wait for full ICE gathering because the engine has no trickle channel.
 */
export class HttpApi implements FaceFusionApi {
	readonly mode = 'live' as const;
	readonly baseUrl: string;

	private accessToken: string | null = null;
	private refreshToken: string | null = null;
	private sessionCreatedAt = 0;
	private refreshTimer: ReturnType<typeof setTimeout> | null = null;
	private listeners = new Set<ConnectionListener>();
	private recovery: Promise<void> | null = null;
	private webRtc: RTCPeerConnection | null = null;

	private config: StudioConfig;

	constructor(config: StudioConfig) {
		this.config = config;
		this.baseUrl = config.apiBase.replace(/\/+$/, '');
	}

	onConnectionChange = (listener: ConnectionListener) => {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	};

	private emit(phase: ConnectionPhase, detail?: string) {
		this.listeners.forEach((listener) => listener(phase, detail));
	}

	// ---------------------------------------------------------------- session

	private scheduleRefresh() {
		if (this.refreshTimer) {
			clearTimeout(this.refreshTimer);
		}

		const delay = SESSION_LIFETIME_MS * this.config.refreshRatio;
		this.refreshTimer = setTimeout(() => {
			void this.rotateSession();
		}, delay);
	}

	private async rotateSession() {
		if (!this.refreshToken) {
			await this.openSession();
			return;
		}

		try {
			const tokens = await this.refreshSession(this.refreshToken);
			this.accessToken = tokens.access_token;
			this.refreshToken = tokens.refresh_token;
			this.sessionCreatedAt = Date.now();
			this.emit('live');
		} catch (error) {
			if (error instanceof ApiError && error.isSessionLost) {
				await this.openSession();
			} else {
				this.emit('offline', error instanceof Error ? error.message : String(error));
			}
		} finally {
			this.scheduleRefresh();
		}
	}

	/** Opens a brand new session and re-arms the rotation timer. */
	async openSession(): Promise<SessionTokens> {
		const tokens = await this.createSession();
		this.accessToken = tokens.access_token;
		this.refreshToken = tokens.refresh_token;
		this.sessionCreatedAt = Date.now();
		this.scheduleRefresh();
		this.emit('live');
		return tokens;
	}

	createSession = async (): Promise<SessionTokens> => {
		const body: Record<string, string> = {};
		if (this.config.apiKey) {
			body.api_key = this.config.apiKey;
		}

		return this.request<SessionTokens>({
			method: 'POST',
			path: '/session',
			body,
			auth: false
		});
	};

	inspectSession = () => this.request<SessionInfo>({ path: '/session' });

	refreshSession = (refreshToken: string) =>
		this.request<SessionTokens>({
			method: 'PUT',
			path: '/session',
			body: { refresh_token: refreshToken },
			auth: false
		});

	destroySession = async () => {
		if (this.refreshTimer) {
			clearTimeout(this.refreshTimer);
			this.refreshTimer = null;
		}

		try {
			await this.request<void>({ method: 'DELETE', path: '/session' });
		} catch {
			/* the session is going away regardless */
		}

		this.accessToken = null;
		this.refreshToken = null;
	};

	get sessionExpiresAt() {
		return this.sessionCreatedAt ? this.sessionCreatedAt + SESSION_LIFETIME_MS : 0;
	}

	// ------------------------------------------------------------------- core

	identity = () => this.request<ServerIdentity>({ path: '/', auth: false });

	getCapabilities = () => this.request<Capabilities>({ path: '/capabilities', auth: false });

	getState = () => this.request<EngineState>({ path: '/state' });

	setState = (patch: EngineState) => this.request<EngineState>({ method: 'PUT', path: '/state', body: patch });

	selectSources = (assetIds: string[]) =>
		this.request<EngineState>({
			method: 'PUT',
			path: '/state?action=select&type=source',
			body: { asset_ids: assetIds }
		});

	selectTarget = (assetId: string) =>
		this.request<EngineState>({
			method: 'PUT',
			path: '/state?action=select&type=target',
			body: { asset_id: assetId }
		});

	// ----------------------------------------------------------------- assets

	async listAssets(): Promise<Asset[]> {
		const payload = await this.request<AssetList>({ path: '/assets' });
		return payload.assets ?? [];
	}

	getAsset = (assetId: string) => this.request<Asset>({ path: `/assets/${assetId}` });

	uploadAssets = async (type: AssetType, files: File[]) => {
		const form = new FormData();

		files.forEach((file) => form.append('file', file, file.name));

		const payload = await this.request<{ asset_ids: string[] }>({
			method: 'POST',
			path: `/assets?type=${type}`,
			form,
			auth: false
		});
		return payload.asset_ids;
	};

	deleteAsset = (assetId: string) => this.request<void>({ method: 'DELETE', path: `/assets/${assetId}` });

	deleteAssets = () => this.request<void>({ method: 'DELETE', path: '/assets' });

	downloadAsset = (assetId: string) =>
		this.request<Blob>({ path: `/assets/${assetId}?action=download`, blob: true });

	captureAsset = (assetId: string, query: CaptureQuery) => {
		const params = new URLSearchParams({
			action: 'capture',
			resolution: query.resolution,
			subject: query.subject
		});
		(query.frameIndex ?? []).forEach((index) => params.append('frame_index', String(index)));

		return this.request<Blob>({ path: `/assets/${assetId}?${params}`, blob: true });
	};

	// ------------------------------------------------------------------- jobs

	async listJobs(): Promise<JobIndex> {
		const responses = await Promise.all(
			jobStatuses.map((status) =>
				this.request<JobIndex>({ path: `/jobs?status=${status}` }).catch(() => ({}) as JobIndex)
			)
		);

		return responses.reduce<JobIndex>((all, entry) => ({ ...all, ...entry }), {});
	}

	getJob = (jobId: string) => this.request<JobDetail>({ path: `/jobs/${jobId}` });

	createJob = async () => {
		const payload = await this.request<{ job_id: string }>({ method: 'POST', path: '/jobs' });
		return payload.job_id;
	};

	applyJobAction = (jobId: string | null, action: JobAction) =>
		this.request<void>({
			method: 'PATCH',
			path: jobId ? `/jobs/${jobId}?action=${action}` : `/jobs?action=${action}`
		});

	deleteJob = (jobId: string | null) =>
		this.request<void>({ method: 'DELETE', path: jobId ? `/jobs/${jobId}` : '/jobs' });

	addStep = (jobId: string, args: EngineState, stepIndex?: number, action: StepAction = 'add') => {
		const actionQuery = action === 'add' ? '?action=add' : `?action=${action}`;
		const path = stepIndex === undefined ? `/jobs/${jobId}${actionQuery}` : `/jobs/${jobId}/${stepIndex}${actionQuery}`;
		return this.request<void>({ method: 'POST', path, body: args });
	};

	removeStep = (jobId: string, stepIndex: number) =>
		this.request<void>({ method: 'DELETE', path: `/jobs/${jobId}/${stepIndex}` });

	// --------------------------------------------------------------- streaming

	async startWebRtc(): Promise<WebRtcSession> {
		// The engine ships no STUN/TURN and no trickle ICE, so host candidates
		// have to be gathered before the offer leaves the browser.
		const peer = new RTCPeerConnection({ iceServers: [] });
		this.webRtc = peer;

		const remote = new MediaStream();

		peer.ontrack = (event) => {
			event.streams[0]?.getTracks().forEach((track) => {
				if (!remote.getTracks().includes(track)) {
					remote.addTrack(track);
				}
			});
		};

		peer.addTransceiver('video', { direction: 'recvonly' });
		peer.addTransceiver('audio', { direction: 'recvonly' });

		const offer = await peer.createOffer();
		await peer.setLocalDescription(offer);
		await this.waitForIce(peer);

		const answer = await this.request<Blob>({
			method: 'POST',
			path: '/stream',
			body: peer.localDescription?.sdp ?? offer.sdp ?? '',
			headers: { 'Content-Type': 'application/sdp' },
			blob: true
		});

		const payload = await answer.text();

		await peer.setRemoteDescription({ type: 'answer', sdp: payload });

		return {
			stream: remote,
			close: () => {
				peer.close();
				this.webRtc = null;
			}
		};
	}

	private waitForIce(peer: RTCPeerConnection) {
		if (peer.iceGatheringState === 'complete') {
			return Promise.resolve();
		}

		return new Promise<void>((resolve) => {
			const done = () => {
				peer.removeEventListener('icegatheringstatechange', onChange);
				clearTimeout(timer);
				resolve();
			};
			const onChange = () => {
				if (peer.iceGatheringState === 'complete') {
					done();
				}
			};
			const timer = setTimeout(done, ICE_GATHER_TIMEOUT_MS);

			peer.addEventListener('icegatheringstatechange', onChange);
		});
	}

	stopWebRtc = async () => {
		this.webRtc?.close();
		this.webRtc = null;

		try {
			await this.request<void>({ method: 'DELETE', path: '/stream' });
		} catch {
			/* nothing was open */
		}
	};

	async openImageSocket(handlers: SocketHandlers): Promise<ImageSocket> {
		const socket = this.openAuthenticatedSocket('/stream', handlers);

		await new Promise<void>((resolve, reject) => {
			const timer = setTimeout(() => reject(new ApiError(0, 'WebSocket handshake timed out')), 8000);
			socket.addEventListener('open', () => {
				clearTimeout(timer);
				resolve();
			});
			socket.addEventListener('error', () => {
				clearTimeout(timer);
				reject(new ApiError(0, 'WebSocket handshake failed'));
			});
		});

		return {
			readyState: socket.readyState,
			send: (image) => {
				if (socket.readyState === WebSocket.OPEN) {
					socket.send(image);
				}
			},
			close: () => socket.close()
		};
	}

	getMetrics = () => this.request<MetricsSet>({ path: '/metrics' });

	openMetricsSocket = (handlers: SocketHandlers) => this.openAuthenticatedSocket('/metrics', handlers);

	openPingSocket = (handlers: SocketHandlers) => this.openAuthenticatedSocket('/ping', handlers);

	private openAuthenticatedSocket(path: string, handlers: SocketHandlers) {
		const url = `${this.baseUrl.replace(/^http/, 'ws')}${path}`;

		if (!this.accessToken) {
			throw new ApiError(401, 'No session token for socket');
		}

		const socket = new WebSocket(url, [`access_token.${this.accessToken}`]);

		socket.addEventListener('message', (event) => handlers.onMessage(event.data as Blob | ArrayBuffer | string));
		socket.addEventListener('open', () => handlers.onOpen?.());
		socket.addEventListener('close', (event) => handlers.onClose?.(event));
		socket.addEventListener('error', (event) => handlers.onError?.(event));

		return socket;
	}

	// ---------------------------------------------------------------- request

	private async request<T>(options: {
		method?: string;
		path: string;
		body?: unknown;
		form?: FormData;
		headers?: Record<string, string>;
		auth?: boolean;
		blob?: boolean;
	}): Promise<T> {
		const needsAuth = options.auth !== false;
		const send = async (): Promise<T> => {
			const headers = new Headers(options.headers);

			if (needsAuth && this.accessToken) {
				headers.set('Authorization', `Bearer ${this.accessToken}`);
			}

			let body: BodyInit | undefined;

			if (options.form) {
				body = options.form;
			} else if (options.body !== undefined) {
				if (typeof options.body === 'string') {
					body = options.body;
				} else {
					headers.set('Content-Type', 'application/json');
					body = JSON.stringify(options.body);
				}
			}

			const controller = new AbortController();
			const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

			try {
				const response = await fetch(`${this.baseUrl}${options.path}`, {
					method: options.method ?? 'GET',
					headers,
					body,
					signal: controller.signal,
					credentials: 'omit'
				});

				if (!response.ok) {
					throw await HttpApi.toError(response);
				}

				if (response.status === 204 || response.status === 202) {
					return undefined as T;
				}

				const contentType = response.headers.get('content-type') ?? '';

				if (options.blob || !contentType.includes('application/json')) {
					return (await response.blob()) as T;
				}

				return (await response.json()) as T;
			} finally {
				clearTimeout(timer);
			}
		};

		try {
			return await send();
		} catch (error) {
			if (error instanceof ApiError && error.isSessionLost && needsAuth) {
				this.emit('session-lost', error.message);
				await this.recover();
				return await send();
			}

			if (error instanceof ApiError && error.status === 429) {
				this.emit('rate-limited', error.message);
			}

			throw error;
		}
	}

	/** Re-opens the session once, coalescing concurrent recoveries. */
	private recover(): Promise<void> {
		if (this.recovery) {
			return this.recovery;
		}

		this.recovery = (async () => {
			try {
				await this.openSession();
			} finally {
				this.recovery = null;
			}
		})();

		return this.recovery;
	}

	private static async toError(response: Response) {
		let payload: unknown = null;
		let message = response.statusText || `HTTP ${response.status}`;

		try {
			const text = await response.text();

			if (text) {
				try {
					payload = JSON.parse(text);
					if (payload && typeof payload === 'object' && 'message' in payload) {
						message = String((payload as { message: unknown }).message);
					}
				} catch {
					payload = text;
				}
			}
		} catch {
			/* keep the status line */
		}

		return new ApiError(response.status, message, payload);
	}
}
