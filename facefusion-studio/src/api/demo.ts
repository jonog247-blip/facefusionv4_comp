import capabilitiesFixture from './demo/capabilities.json';
import stateFixture from './demo/state.json';
import { canvasToBlob, compositeFrame, defaultComposite, dropBitmap, loadBitmap } from './demo/synth';
import type { StudioConfig } from './config';
import type {
	ConnectionListener,
	FaceFusionApi,
	ImageSocket,
	JobAction,
	SocketHandlers,
	WebRtcSession
} from './api';
import { ApiError } from './types';
import type {
	Asset,
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

const CAPABILITIES = capabilitiesFixture as unknown as Capabilities;
const DEFAULTS = stateFixture as unknown as EngineState;
const SESSION_LIFETIME_MS = 10 * 60 * 1000;

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

interface DemoJob {
	id: string;
	detail: JobDetail;
	steps: EngineState[];
	status: 'drafted' | 'queued' | 'completed' | 'failed';
	progress: number;
	running: boolean;
	outputAssetId?: string;
}

let assetCounter = 0;
let jobCounter = 0;

/**
 * In-browser stand-in for `python facefusion.py api`.
 *
 * It reproduces the v4 contract — session rotation, capability validation,
 * asset lifecycle, the job state machine and both stream transports — so the
 * studio can be developed and demonstrated with no Python process running.
 * Frame synthesis is simulated (see `demo/synth.ts`); everything else
 * behaves exactly like the real engine.
 */
export class DemoApi implements FaceFusionApi {
	readonly mode = 'demo' as const;
	readonly baseUrl: string;

	private accessToken: string | null = null;
	private refreshToken: string | null = null;
	private expiresAt = 0;
	private listeners = new Set<ConnectionListener>();

	private state: EngineState = clone(DEFAULTS);
	private assets = new Map<string, Asset>();
	private urls = new Map<string, string>();
	private jobs = new Map<string, DemoJob>();
	private streams = new Set<() => void>();

	constructor(config: StudioConfig) {
		this.baseUrl = config.apiBase;
	}

	onConnectionChange = (listener: ConnectionListener) => {
		this.listeners.add(listener);
		listener('demo');
		return () => this.listeners.delete(listener);
	};

	private emit(phase: Parameters<ConnectionListener>[0], detail?: string) {
		this.listeners.forEach((listener) => listener(phase, detail));
	}

	get sessionExpiresAt() {
		return this.expiresAt;
	}

	// ---------------------------------------------------------------- session

	createSession = async (): Promise<SessionTokens> => {
		await this.latency(90);
		this.accessToken = `demo-access-${Math.random().toString(36).slice(2, 10)}`;
		this.refreshToken = `demo-refresh-${Math.random().toString(36).slice(2, 10)}`;
		this.expiresAt = Date.now() + SESSION_LIFETIME_MS;
		this.emit('demo');
		return { access_token: this.accessToken, refresh_token: this.refreshToken };
	};

	openSession = async () => this.createSession();

	inspectSession = async (): Promise<SessionInfo> => {
		this.requireSession();
		return {
			access_token: this.accessToken as string,
			created_at: new Date(this.expiresAt - SESSION_LIFETIME_MS).toISOString(),
			expires_at: new Date(this.expiresAt).toISOString()
		};
	};

	refreshSession = async (refreshToken: string): Promise<SessionTokens> => {
		await this.latency(60);

		if (!this.refreshToken || refreshToken !== this.refreshToken) {
			throw new ApiError(401, 'invalid refresh token');
		}

		this.accessToken = `demo-access-${Math.random().toString(36).slice(2, 10)}`;
		this.refreshToken = `demo-refresh-${Math.random().toString(36).slice(2, 10)}`;
		this.expiresAt = Date.now() + SESSION_LIFETIME_MS;
		return { access_token: this.accessToken, refresh_token: this.refreshToken };
	};

	destroySession = async () => {
		await this.latency(40);
		this.assets.forEach((asset) => this.revoke(asset));
		this.assets.clear();
		this.urls.clear();
		this.jobs.clear();
		this.streams.forEach((stop) => stop());
		this.streams.clear();
		this.state = clone(DEFAULTS);
		this.accessToken = null;
		this.refreshToken = null;
		this.expiresAt = 0;
	};

	private requireSession() {
		if (!this.accessToken || Date.now() > this.expiresAt) {
			throw new ApiError(401, 'invalid access token');
		}
	}

	// ------------------------------------------------------------------ system

	identity = async (): Promise<ServerIdentity> => ({ name: 'FaceFusion (demo)', version: '4.0.0-demo' });

	getCapabilities = async (): Promise<Capabilities> => {
		await this.latency(30);
		return clone(CAPABILITIES);
	};

	getState = async (): Promise<EngineState> => {
		this.requireSession();
		await this.latency(20);
		return clone(this.state);
	};

	setState = async (patch: EngineState): Promise<EngineState> => {
		this.requireSession();
		await this.latency(25);

		for (const [key, value] of Object.entries(patch)) {
			const capability = this.findCapability(key);

			if (!capability) {
				throw new ApiError(400, `invalid state key: ${key}`);
			}

			if (capability.choices?.length) {
				const values = Array.isArray(value) ? value : [ value ];
				const invalid = values.filter((entry) => !capability.choices?.includes(entry));

				if (invalid.length) {
					throw new ApiError(400, `invalid state value for ${key}: ${invalid.join(', ')}`);
				}
			}

			this.state[key] = value;
		}

		return clone(this.state);
	};

	selectSources = async (assetIds: string[]) => {
		this.requireSession();
		this.state.source_paths = assetIds.filter((id) => this.assets.has(id));
		return clone(this.state);
	};

	selectTarget = async (assetId: string) => {
		this.requireSession();

		if (!this.assets.has(assetId)) {
			throw new ApiError(404, 'target asset not found');
		}

		this.state.target_path = assetId;
		return clone(this.state);
	};

	private findCapability(key: string) {
		for (const group of Object.values(CAPABILITIES.arguments)) {
			if (group[key]) {
				return group[key];
			}
		}
		return undefined;
	}

	// ------------------------------------------------------------------ assets

	async listAssets(): Promise<Asset[]> {
		this.requireSession();
		await this.latency(20);
		return Array.from(this.assets.values()).map((asset) => ({ ...asset }));
	}

	getAsset = async (assetId: string): Promise<Asset> => {
		this.requireSession();
		const asset = this.assets.get(assetId);

		if (!asset) {
			throw new ApiError(404, 'asset not found');
		}
		return { ...asset };
	};

	uploadAssets = async (type: AssetType, files: File[]) => {
		this.requireSession();
		await this.latency(Math.min(900, 160 * files.length));

		const assetIds: string[] = [];

		for (const file of files) {
			const id = `asset-${++assetCounter}`;
			const url = URL.createObjectURL(file);
			const media = file.type.startsWith('video')
				? 'video'
				: file.type.startsWith('audio')
					? 'audio'
					: 'image';
			const now = new Date();

			this.assets.set(id, {
				id,
				created_at: now.toISOString(),
				expires_at: new Date(now.getTime() + SESSION_LIFETIME_MS).toISOString(),
				type,
				media,
				name: file.name,
				format: (file.name.split('.').pop() ?? 'bin').toLowerCase(),
				size: file.size,
				metadata: { width: 0, height: 0 }
			});
			this.urls.set(id, url);
			assetIds.push(id);
		}

		return assetIds;
	};

	deleteAsset = async (assetId: string) => {
		this.requireSession();
		const asset = this.assets.get(assetId);

		if (!asset) {
			throw new ApiError(404, 'asset not found');
		}

		this.revoke(asset);
		this.assets.delete(assetId);
		this.urls.delete(assetId);
		await this.latency(20);
	};

	deleteAssets = async () => {
		this.requireSession();
		this.assets.forEach((asset) => this.revoke(asset));
		this.assets.clear();
		this.urls.clear();
		await this.latency(40);
	};

	private revoke(asset: Asset) {
		const url = this.urls.get(asset.id);

		if (url) {
			URL.revokeObjectURL(url);
		}
		dropBitmap(url ?? '');
	}

	downloadAsset = async (assetId: string) => {
		this.requireSession();
		const url = this.urls.get(assetId);

		if (!url) {
			throw new ApiError(400, 'asset cannot be downloaded');
		}

		const response = await fetch(url);
		return response.blob();
	};

	captureAsset = async (assetId: string, query: CaptureQuery) => {
		this.requireSession();
		const url = this.urls.get(assetId);
		const bitmap = url ? await loadBitmap(url) : null;

		if (!bitmap) {
			throw new ApiError(400, 'asset cannot be captured');
		}

		const [width, height] = query.resolution.split('x').map(Number);
		const canvas = document.createElement('canvas');

		canvas.width = Number.isFinite(width) ? width : 512;
		canvas.height = Number.isFinite(height) ? height : 512;

		const context = canvas.getContext('2d');

		if (context) {
			context.fillStyle = '#101014';
			context.fillRect(0, 0, canvas.width, canvas.height);
			const scale = Math.min(canvas.width / bitmap.width, canvas.height / bitmap.height);
			const drawWidth = bitmap.width * scale;
			const drawHeight = bitmap.height * scale;
			context.drawImage(bitmap, (canvas.width - drawWidth) / 2, (canvas.height - drawHeight) / 2, drawWidth, drawHeight);
		}

		const blob = await canvasToBlob(canvas);
		bitmap.close();

		if (!blob) {
			throw new ApiError(400, 'asset cannot be captured');
		}
		return blob;
	};

	// -------------------------------------------------------------------- jobs

	async listJobs(): Promise<JobIndex> {
		this.requireSession();
		await this.latency(20);

		const index: JobIndex = {};

		this.jobs.forEach((job, id) => {
			index[id] = {
				version: 1,
				date_created: job.detail.date_created,
				date_updated: job.detail.date_updated
			};
		});

		return index;
	}

	getJob = async (jobId: string): Promise<JobDetail> => {
		this.requireSession();
		const job = this.jobs.get(jobId);

		if (!job) {
			throw new ApiError(404, 'job not found');
		}
		return clone(job.detail);
	};

	createJob = async () => {
		this.requireSession();
		const id = `job-${String(++jobCounter).padStart(4, '0')}`;
		const now = new Date().toISOString();

		this.jobs.set(id, {
			id,
			status: 'drafted',
			progress: 0,
			running: false,
			steps: [],
			detail: { version: 1, date_created: now, date_updated: now, steps: [] }
		});

		await this.latency(60);
		return id;
	};

	applyJobAction = async (jobId: string | null, action: JobAction) => {
		this.requireSession();
		const targets = jobId ? [this.jobs.get(jobId)].filter(Boolean) : Array.from(this.jobs.values());

		if (jobId && !this.jobs.has(jobId)) {
			throw new ApiError(404, 'job not found');
		}

		if (action === 'submit') {
			if (Array.from(this.jobs.values()).some((job) => job.status === 'queued')) {
				throw new ApiError(409, 'a job is already queued');
			}

			targets.forEach((job) => {
				job!.status = 'queued';
				job!.detail.steps = job!.detail.steps.map((step) => ({ ...step, status: 'queued' }));
			});
		}

		if (action === 'run') {
			targets.forEach((job) => void this.simulateRun(job!));
		}

		if (action === 'retry') {
			targets.forEach((job) => {
				job!.progress = 0;
				job!.status = 'queued';
				void this.simulateRun(job!);
			});
		}

		await this.latency(60);
	};

	deleteJob = async (jobId: string | null) => {
		this.requireSession();

		if (jobId) {
			this.jobs.delete(jobId);
		} else {
			this.jobs.clear();
		}
		await this.latency(40);
	};

	addStep = async (jobId: string, args: EngineState) => {
		this.requireSession();
		const job = this.jobs.get(jobId);

		if (!job) {
			throw new ApiError(404, 'job not found');
		}

		const processors = Array.isArray(args.processors) ? (args.processors as string[]) : [];

		if (!processors.length) {
			throw new ApiError(400, 'a step needs at least one processor');
		}

		job.steps.push({ ...args });
		job.detail.steps = [
			...job.detail.steps,
			{ args: { processors }, status: job.status === 'queued' ? 'queued' : 'drafted' }
		];
		job.detail.date_updated = new Date().toISOString();
		await this.latency(40);
	};

	removeStep = async (jobId: string, stepIndex: number) => {
		this.requireSession();
		const job = this.jobs.get(jobId);

		if (!job) {
			throw new ApiError(404, 'job not found');
		}

		job.steps.splice(stepIndex, 1);
		job.detail.steps.splice(stepIndex, 1);
		await this.latency(30);
	};

	private async simulateRun(job: DemoJob) {
		// A submitted job is already queued; the run is what moves it forward.
		if (job.running || job.status === 'completed') {
			return;
		}

		job.running = true;
		job.status = 'queued';
		job.progress = 0;
		job.detail.steps = job.detail.steps.map((step) => ({ ...step, status: 'started' }));

		for (let index = 0; index < job.steps.length; index += 1) {
			for (let tick = 0; tick < 10; tick += 1) {
				await this.latency(90);
				job.progress = (index + tick / 10) / job.steps.length;
			}

			job.detail.steps[index] = { ...job.detail.steps[index], status: 'completed' };
		}

		job.status = 'completed';
		job.progress = 1;
		job.detail.date_updated = new Date().toISOString();

		const targetId = String(this.state.target_path ?? '');
		const target = this.assets.get(targetId);
		const id = `asset-${++assetCounter}`;
		const now = new Date();

		this.assets.set(id, {
			id,
			created_at: now.toISOString(),
			expires_at: new Date(now.getTime() + SESSION_LIFETIME_MS).toISOString(),
			type: 'output',
			media: target?.media ?? 'image',
			name: `${job.id}.${target?.format ?? 'png'}`,
			format: target?.format ?? 'png',
			size: Math.round((target?.size ?? 240_000) * 1.04),
			metadata: { steps: job.detail.steps.length, simulated: true }
		});
		this.urls.set(id, this.urls.get(targetId) ?? '');
		job.outputAssetId = id;
		job.running = false;
	}

	// --------------------------------------------------------------- streaming

	async startWebRtc(): Promise<WebRtcSession> {
		this.requireSession();
		await this.latency(200);

		const canvas = document.createElement('canvas');
		canvas.width = 960;
		canvas.height = 540;

		const sourceId = Array.isArray(this.state.source_paths) ? (this.state.source_paths[0] as string) : undefined;
		const targetId = String(this.state.target_path ?? '');
		const source = sourceId ? await loadBitmap(this.urls.get(sourceId) ?? '') : null;
		const target = await loadBitmap(this.urls.get(targetId) ?? '');

		if (target) {
			await compositeFrame(canvas, target, source, defaultComposite);
		} else {
			const context = canvas.getContext('2d');
			context?.fillRect(0, 0, canvas.width, canvas.height);
		}

		const stream = canvas.captureStream(24);
		const stop = () => {
			stream.getTracks().forEach((track) => track.stop());
			this.streams.delete(stop);
		};

		this.streams.add(stop);

		// Keep the canvas alive so the preview keeps moving.
		const tick = window.setInterval(() => {
			const context = canvas.getContext('2d');

			if (!context) {
				return;
			}

			context.fillStyle = 'rgba(10, 132, 255, 0.04)';
			context.fillRect(0, 0, canvas.width, canvas.height);
		}, 90);

		return {
			stream,
			close: () => {
				window.clearInterval(tick);
				stop();
			}
		};
	}

	stopWebRtc = async () => {
		await this.latency(40);
		this.streams.forEach((stop) => stop());
		this.streams.clear();
	};

	async openImageSocket(handlers: SocketHandlers): Promise<ImageSocket> {
		this.requireSession();
		await this.latency(120);

		const canvas = document.createElement('canvas');
		const sourceId = Array.isArray(this.state.source_paths) ? (this.state.source_paths[0] as string) : undefined;
		const source = sourceId ? await loadBitmap(this.urls.get(sourceId) ?? '') : null;
		let closed = false;
		let busy = false;

		handlers.onOpen?.();

		const process = async (image: Blob | ArrayBuffer) => {
			if (busy || closed) {
				return;
			}
			busy = true;

			try {
				const blob = image instanceof Blob ? image : new Blob([image]);
				const target = await createImageBitmap(blob);

				await compositeFrame(canvas, target, source, defaultComposite);
				target.close();

				const result = await canvasToBlob(canvas, 'image/jpeg', 0.82);

				if (result) {
					handlers.onMessage(result);
				}
			} catch {
				/* a frame the demo cannot decode is simply dropped */
			} finally {
				busy = false;
			}
		};

		return {
			readyState: 1,
			send: (image) => {
				void process(image);
			},
			close: () => {
				if (closed) {
					return;
				}
				closed = true;
				handlers.onClose?.(new CloseEvent('close'));
			}
		};
	}

	getMetrics = async (): Promise<MetricsSet> => {
		this.requireSession();
		return this.metrics();
	};

	openMetricsSocket = (handlers: SocketHandlers) => {
		handlers.onOpen?.();
		const timer = window.setInterval(() => handlers.onMessage(JSON.stringify(this.metrics())), 2000);

		return {
			close: () => window.clearInterval(timer)
		} as unknown as WebSocket;
	};

	openPingSocket = (handlers: SocketHandlers) => {
		handlers.onOpen?.();
		const timer = window.setInterval(() => handlers.onMessage('ping'), 5000);

		return {
			close: () => window.clearInterval(timer)
		} as unknown as WebSocket;
	};

	private metrics(): MetricsSet {
		const jitter = (base: number, spread: number) => Number((base + (Math.random() - 0.5) * spread).toFixed(2));

		return {
			graphic_devices: [{ value: jitter(38, 6), unit: '%' }],
			disks: [
				{ value: 42, unit: '%' },
				{ value: 18, unit: '%' }
			],
			memory: [{ value: jitter(6.4, 0.8), unit: 'GB' }],
			network: [{ value: jitter(1.2, 0.6), unit: 'MB/s' }],
			processor: [{ value: jitter(27, 14), unit: '%' }]
		} as unknown as MetricsSet;
	}

	private latency(ms: number) {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}
}
