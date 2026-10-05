/**
 * Wire types for the FaceFusion v4 API.
 *
 * These mirror `facefusion/apis/**` on the `v4-challenge` branch:
 *  - `GET /`                    → ServerIdentity
 *  - `GET /capabilities`        → Capabilities
 *  - `GET|PUT|DELETE /session`  → SessionTokens / SessionInfo
 *  - `GET|PUT /state`           → EngineState
 *  - `GET|POST|DELETE /assets`  → AssetList / AssetIds
 *  - `GET|PATCH|DELETE /jobs`   → JobIndex / JobDetail
 *  - `POST|DELETE /stream`      → raw SDP
 *  - `GET /metrics`             → MetricsSet
 */

export type AssetType = 'source' | 'target' | 'output';
export type AssetMedia = 'audio' | 'image' | 'video';
export type StepStatus = 'drafted' | 'queued' | 'started' | 'completed' | 'failed';
export type JobStatus = 'drafted' | 'queued' | 'completed' | 'failed';

export interface ServerIdentity {
	name: string;
	version: string;
}

export interface SessionTokens {
	access_token: string;
	refresh_token: string;
}

export interface SessionInfo {
	access_token: string;
	created_at: string;
	expires_at: string;
}

/** One option as advertised by `GET /capabilities`. */
export interface Capability {
	default?: unknown;
	choices?: unknown[];
	groups: string[];
}

export interface Capabilities {
	formats: {
		audio: string[];
		image: string[];
		video: string[];
	};
	arguments: Record<string, Record<string, Capability>>;
}

export type EngineState = Record<string, unknown>;

export interface Asset {
	id: string;
	created_at: string;
	expires_at: string;
	type: AssetType;
	media: AssetMedia;
	name: string;
	format: string;
	size: number;
	metadata: Record<string, unknown> | null;
}

export interface AssetList {
	assets: Asset[];
}

export interface AssetIds {
	asset_ids: string[];
}

export interface JobStep {
	args: { processors: string[] };
	status: StepStatus;
}

export interface JobDetail {
	version: number;
	date_created: string;
	date_updated: string;
	steps: JobStep[];
}

export interface JobIndexEntry {
	version: number;
	date_created: string;
	date_updated: string;
}

export type JobIndex = Record<string, JobIndexEntry>;

export interface JobCreated {
	job_id: string;
}

export interface ApiMessage {
	message: string;
}

export interface MetricValue {
	value: number;
	unit: string;
}

export interface MetricsSet {
	graphic_devices: MetricValue[] | Record<string, MetricValue>;
	disks: MetricValue[] | Record<string, MetricValue>;
	memory: MetricValue[] | Record<string, MetricValue>;
	network: MetricValue[] | Record<string, MetricValue>;
	processor: MetricValue[] | Record<string, MetricValue>;
}

export type StreamSubject = 'frame' | 'face';

export interface CaptureQuery {
	resolution: string;
	subject: StreamSubject;
	frameIndex?: number[];
}

/** Error shape thrown by the transport, normalised from the Starlette responses. */
export class ApiError extends Error {
	readonly status: number;
	readonly payload: unknown;

	constructor(status: number, message: string, payload?: unknown) {
		super(message);
		this.name = 'ApiError';
		this.status = status;
		this.payload = payload;
	}

	/** The session is gone and cannot be refreshed — a new one has to be opened. */
	get isSessionLost() {
		return this.status === 401 || this.status === 426;
	}

	get isConflict() {
		return this.status === 409;
	}

	get isOffline() {
		return this.status === 0;
	}
}
