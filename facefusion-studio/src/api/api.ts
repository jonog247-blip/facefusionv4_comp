import type {
	Asset,
	AssetType,
	Capabilities,
	CaptureQuery,
	EngineState,
	JobDetail,
	JobIndex,
	ServerIdentity,
	SessionInfo,
	SessionTokens,
	StepStatus,
	MetricsSet
} from './types';

export type StepAction = 'add' | 'insert' | 'remix';
export type JobAction = 'submit' | 'run' | 'retry';

export interface WebRtcSession {
	stream: MediaStream;
	close: () => void;
}

export interface ImageSocket {
	send: (image: Blob | ArrayBuffer) => void;
	close: () => void;
	readonly readyState: number;
}

export interface SocketHandlers {
	onMessage: (data: Blob | ArrayBuffer | string) => void;
	onOpen?: () => void;
	onClose?: (event: CloseEvent) => void;
	onError?: (event: Event) => void;
}

export type ConnectionPhase =
	| 'idle'
	| 'probing'
	| 'live'
	| 'demo'
	| 'offline'
	| 'session-lost'
	| 'rate-limited';

export type ConnectionListener = (phase: ConnectionPhase, detail?: string) => void;

/**
 * The complete FaceFusion v4 surface consumed by the studio. Both the real
 * HTTP transport and the in-browser demo backend implement it, so every
 * feature — jobs, streaming, assets, state — is exercised identically.
 */
export interface FaceFusionApi {
	readonly mode: 'live' | 'demo';
	readonly baseUrl: string;
	/** Epoch millis at which the current session lapses (0 when unknown). */
	readonly sessionExpiresAt: number;

	onConnectionChange: (listener: ConnectionListener) => () => void;

	identity: () => Promise<ServerIdentity>;

	/** Opens a session and (re)arms the rotation timer. */
	openSession: () => Promise<SessionTokens>;
	createSession: () => Promise<SessionTokens>;
	inspectSession: () => Promise<SessionInfo>;
	refreshSession: (refreshToken: string) => Promise<SessionTokens>;
	destroySession: () => Promise<void>;

	getCapabilities: () => Promise<Capabilities>;
	getState: () => Promise<EngineState>;
	setState: (patch: EngineState) => Promise<EngineState>;
	selectSources: (assetIds: string[]) => Promise<EngineState>;
	selectTarget: (assetId: string) => Promise<EngineState>;

	listAssets: () => Promise<Asset[]>;
	getAsset: (assetId: string) => Promise<Asset>;
	uploadAssets: (type: AssetType, files: File[]) => Promise<string[]>;
	deleteAsset: (assetId: string) => Promise<void>;
	deleteAssets: () => Promise<void>;
	downloadAsset: (assetId: string) => Promise<Blob>;
	captureAsset: (assetId: string, query: CaptureQuery) => Promise<Blob>;

	listJobs: () => Promise<JobIndex>;
	getJob: (jobId: string) => Promise<JobDetail>;
	createJob: () => Promise<string>;
	applyJobAction: (jobId: string | null, action: JobAction) => Promise<void>;
	deleteJob: (jobId: string | null) => Promise<void>;
	addStep: (jobId: string, args: EngineState, stepIndex?: number, action?: StepAction) => Promise<void>;
	removeStep: (jobId: string, stepIndex: number) => Promise<void>;

	startWebRtc: () => Promise<WebRtcSession>;
	stopWebRtc: () => Promise<void>;
	openImageSocket: (handlers: SocketHandlers) => Promise<ImageSocket>;
	openMetricsSocket: (handlers: SocketHandlers) => WebSocket;
	openPingSocket: (handlers: SocketHandlers) => WebSocket;
	getMetrics: () => Promise<MetricsSet>;
}

export type { StepStatus };
