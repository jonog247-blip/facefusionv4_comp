import { create } from 'zustand';
import { createTransport } from '../api';
import type { ConnectionPhase, FaceFusionApi, ImageSocket } from '../api';
import { ApiError, type Asset, type AssetType, type Capabilities, type EngineState, type JobDetail, type MetricsSet } from '../api/types';
import { observeImage } from '../vision/faceLandmarker';
import type { AngleBucket, Pose } from '../vision/pose';
import { bucketForYaw } from '../vision/pose';
import {
	routeSource,
	summariseCoverage,
	type AngleEntry,
	type RouteDecision,
	type RouteStrategy
} from '../vision/poseRouter';
import { loadConfig, saveConfig } from '../api/config';

export interface LogEntry {
	id: number;
	at: number;
	level: 'info' | 'warn' | 'error' | 'success';
	message: string;
}

export interface TargetInsight {
	samples: number;
	faces: number;
	meanYaw: number;
	dominant: AngleBucket;
	coverage: number;
	gaps: AngleBucket[];
	yaws: number[];
}

export type StreamMode = 'off' | 'webrtc' | 'socket';
export type StreamStatus = 'idle' | 'connecting' | 'live' | 'error';

const emptyInsight = (): TargetInsight => ({
	samples: 0,
	faces: 0,
	meanYaw: 0,
	dominant: 'front',
	coverage: 0,
	gaps: [],
	yaws: []
});

interface StudioStore {
	api: FaceFusionApi | null;
	phase: ConnectionPhase;
	statusDetail: string;
	mode: 'live' | 'demo' | 'boot';
	serverName: string;
	serverVersion: string;
	sessionExpiresAt: number;

	capabilities: Capabilities | null;
	state: EngineState | null;
	assets: Asset[];
	jobs: Record<string, { version: number; date_created: string; date_updated: string }>;
	jobDetails: Record<string, JobDetail>;
	activeJobId: string | null;
	jobBusy: boolean;

	angles: AngleEntry[];
	selectedAngleId: string | null;
	routeStrategy: RouteStrategy;
	autoRoute: boolean;
	route: RouteDecision | null;
	insight: TargetInsight;
	livePose: Pose | null;
	landmarkerDetail: string;

	streamMode: StreamMode;
	streamStatus: StreamStatus;
	streamMessage: string;
	mediaStream: MediaStream | null;
	processedFrameUrl: string | null;
	metrics: MetricsSet | null;

	selectedSourceIds: string[];
	selectedTargetId: string | null;

	log: LogEntry[];

	bootstrap: () => Promise<void>;
	connectSockets: () => void;
	pollJob: (jobId: string) => void;
	reconnect: (apiBase?: string) => Promise<void>;
	refresh: () => Promise<void>;
	refreshAssets: () => Promise<void>;
	refreshJobs: () => Promise<void>;
	patchState: (patch: EngineState) => Promise<void>;
	setProcessors: (processors: string[]) => Promise<void>;

	upload: (type: AssetType, files: File[]) => Promise<string[]>;
	removeAsset: (assetId: string) => Promise<void>;
	clearAssets: () => Promise<void>;
	selectSources: (assetIds: string[]) => Promise<void>;
	selectTarget: (assetId: string) => Promise<void>;

	addAngleFiles: (files: File[]) => Promise<void>;
	updateAnglePose: (id: string, pose: Pose) => void;
	removeAngle: (id: string) => Promise<void>;
	clearAngles: () => void;
	setSelectedAngle: (id: string | null) => void;
	setRouteStrategy: (strategy: RouteStrategy) => void;
	setAutoRoute: (enabled: boolean) => void;
	reportTargetPose: (pose: Pose | null) => void;
	resetInsight: () => void;
	applyRouting: () => Promise<RouteDecision | null>;

	runJob: (steps: EngineState[]) => Promise<void>;
	retryJob: (jobId: string) => Promise<void>;
	deleteJob: (jobId: string | null) => Promise<void>;
	setActiveJob: (jobId: string | null) => void;

	startWebRtc: () => Promise<void>;
	startImageStream: (source: HTMLVideoElement | null) => Promise<void>;
	stopStream: () => Promise<void>;

	pushLog: (level: LogEntry['level'], message: string) => void;
	dismissLog: (id: number) => void;
}

let logId = 0;
let booting = false;
let lastRoutedYaw: number | null = null;
let lastRouteAt = 0;
let metricsSocket: WebSocket | null = null;
let pingSocket: WebSocket | null = null;
let imageSocket: ImageSocket | null = null;
let mediaStream: MediaStream | null = null;
let streamTimer: ReturnType<typeof setInterval> | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;

const friendlyError = (error: unknown) => {
	if (error instanceof ApiError) {
		return error.isOffline ? 'FaceFusion server unreachable' : `${error.message} (${error.status})`;
	}
	return error instanceof Error ? error.message : String(error);
};

export const useStudio = create<StudioStore>((set, get) => ({
	api: null,
	phase: 'idle',
	statusDetail: '',
	mode: 'boot',
	serverName: 'FaceFusion',
	serverVersion: '',
	sessionExpiresAt: 0,

	capabilities: null,
	state: null,
	assets: [],
	jobs: {},
	jobDetails: {},
	activeJobId: null,
	jobBusy: false,

	angles: [],
	selectedAngleId: null,
	routeStrategy: 'nearest',
	autoRoute: true,
	route: null,
	insight: emptyInsight(),
	livePose: null,
	landmarkerDetail: '',

	streamMode: 'off',
	streamStatus: 'idle',
	streamMessage: '',
	mediaStream: null,
	processedFrameUrl: null,
	metrics: null,

	selectedSourceIds: [],
	selectedTargetId: null,

	log: [],

	pushLog: (level, message) =>
		set((state) => ({
			log: [{ id: ++logId, at: Date.now(), level, message }, ...state.log].slice(0, 60)
		})),

	dismissLog: (id) => set((state) => ({ log: state.log.filter((entry) => entry.id !== id) })),

	bootstrap: async () => {
		if (booting) {
			return;
		}
		booting = true;

		set({ phase: 'probing', statusDetail: 'Contacting FaceFusion API…' });
		get().pushLog('info', 'Booting session…');

		const probe = await createTransport();

		probe.api.onConnectionChange((phase, detail) => {
			set({ phase, statusDetail: detail ?? '', sessionExpiresAt: probe.api.sessionExpiresAt });

			if (phase === 'session-lost') {
				get().pushLog('warn', 'Session expired on the server — reopening');
			}
		});

		if (probe.fallback) {
			get().pushLog('warn', `Demo backend active — ${probe.reason ?? 'server unreachable'}`);
		} else {
			get().pushLog('success', `Connected to ${probe.serverName} ${probe.serverVersion}`);
		}

		set({
			api: probe.api,
			mode: probe.fallback ? 'demo' : 'live',
			serverName: probe.serverName ?? 'FaceFusion',
			serverVersion: probe.serverVersion ?? '',
			phase: probe.fallback ? 'demo' : 'live',
			statusDetail: probe.fallback ? (probe.reason ?? '') : ''
		});

		await probe.api.openSession();
		set({ sessionExpiresAt: probe.api.sessionExpiresAt });

		if (probe.api.mode === 'live') {
			// The server is the authority on when the session actually lapses.
			try {
				const info = await probe.api.inspectSession();
				const expires = Date.parse(info.expires_at);

				if (Number.isFinite(expires)) {
					set({ sessionExpiresAt: expires });
				}
			} catch {
				/* the local estimate stays in place */
			}
		}

		await get().refresh();
		get().connectSockets();
		booting = false;
	},

	reconnect: async (apiBase) => {
		if (apiBase !== undefined) {
			saveConfig({ apiBase });
		}

		set({ assets: [], jobs: {}, jobDetails: {}, state: null, capabilities: null, angles: [] });
		await get().bootstrap();
	},

	connectSockets: () => {
		const api = get().api;

		if (!api) {
			return;
		}

		metricsSocket?.close?.();
		pingSocket?.close?.();

		try {
			metricsSocket = api.openMetricsSocket({
				onMessage: (data) => {
					try {
						const parsed = typeof data === 'string' ? JSON.parse(data) : data;
						set({ metrics: parsed as MetricsSet });
					} catch {
						/* ignore malformed metric frames */
					}
				},
				onClose: () => {
					metricsSocket = null;
				}
			});
		} catch {
			/* the socket needs a live session; the HTTP fallback is polled instead */
		}

		try {
			// WS /ping holds the socket open without extending the session; a
			// drop here is the earliest sign that the server went away.
			pingSocket = api.openPingSocket({
				onMessage: () => {
					if (get().phase !== 'live') {
						set({ phase: 'live' });
					}
				},
				onClose: () => {
					pingSocket = null;
					if (get().phase === 'live') {
						set({ phase: 'idle', statusDetail: 'ping socket closed' });
					}
				}
			});
		} catch {
			/* the transport falls back to request-time errors */
		}
	},

	refresh: async () => {
		const api = get().api;

		if (!api) {
			return;
		}

		try {
			const [capabilities, state] = await Promise.all([api.getCapabilities(), api.getState()]);
			set({ capabilities, state });
			await Promise.all([get().refreshAssets(), get().refreshJobs()]);
			get().pushLog('success', 'Capabilities and state synchronised');
		} catch (error) {
			get().pushLog('error', friendlyError(error));
		}
	},

	refreshAssets: async () => {
		const api = get().api;

		if (!api) {
			return;
		}

		try {
			const assets = await api.listAssets();
			const current = get().selectedTargetId;
			const stillValid = assets.some((asset) => asset.id === current && asset.type === 'target');
			const newestTarget = [...assets]
				.filter((asset) => asset.type === 'target')
				.sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0];

			set({ assets, selectedTargetId: stillValid ? current : (newestTarget?.id ?? null) });
		} catch (error) {
			get().pushLog('error', friendlyError(error));
		}
	},

	refreshJobs: async () => {
		const api = get().api;

		if (!api) {
			return;
		}

		try {
			const jobs = await api.listJobs();
			set({ jobs });

			const active = get().activeJobId;
			if (active && jobs[active]) {
				set({ jobDetails: { ...get().jobDetails, [active]: await api.getJob(active) } });
			}
		} catch (error) {
			get().pushLog('error', friendlyError(error));
		}
	},

	patchState: async (patch) => {
		const api = get().api;

		if (!api) {
			return;
		}

		const previous = get().state;
		set({ state: { ...(previous ?? {}), ...patch } });

		try {
			const state = await api.setState(patch);
			set({ state });
		} catch (error) {
			set({ state: previous });
			get().pushLog('error', friendlyError(error));
		}
	},

	setProcessors: async (processors) => {
		await get().patchState({ processors });
		get().pushLog('info', `Processors: ${processors.join(', ') || 'none'}`);
	},

	upload: async (type, files) => {
		const api = get().api;

		if (!api || !files.length) {
			return [];
		}

		try {
			const assetIds = await api.uploadAssets(type, files);
			get().pushLog('success', `Uploaded ${files.length} ${type} asset${files.length > 1 ? 's' : ''}`);
			await get().refreshAssets();
			return assetIds;
		} catch (error) {
			get().pushLog('error', friendlyError(error));
			return [];
		}
	},

	removeAsset: async (assetId) => {
		const api = get().api;

		if (!api) {
			return;
		}

		try {
			await api.deleteAsset(assetId);
			set({ angles: get().angles.filter((angle) => angle.assetId !== assetId) });
			await get().refreshAssets();
		} catch (error) {
			get().pushLog('error', friendlyError(error));
		}
	},

	clearAssets: async () => {
		const api = get().api;

		if (!api) {
			return;
		}

		try {
			await api.deleteAssets();
			set({ angles: [], route: null, insight: emptyInsight(), selectedSourceIds: [] });
			await get().refreshAssets();
		} catch (error) {
			get().pushLog('error', friendlyError(error));
		}
	},

	selectSources: async (assetIds) => {
		const api = get().api;

		if (!api) {
			return;
		}

		try {
			const state = await api.selectSources(assetIds);
			set({ state, selectedSourceIds: assetIds });
		} catch (error) {
			get().pushLog('error', friendlyError(error));
		}
	},

	selectTarget: async (assetId) => {
		const api = get().api;

		if (!api) {
			return;
		}

		try {
			const state = await api.selectTarget(assetId);
			set({ state, selectedTargetId: assetId, insight: emptyInsight() });
			get().pushLog('info', 'Target selected — pose histogram cleared');
		} catch (error) {
			get().pushLog('error', friendlyError(error));
		}
	},

	addAngleFiles: async (files) => {
		const api = get().api;

		if (!api || !files.length) {
			return;
		}

		const created: AngleEntry[] = [];

		for (const file of files) {
			const previewUrl = URL.createObjectURL(file);

			try {
				const assetIds = await api.uploadAssets('source', [file]);
				const assetId = assetIds?.[0] ?? '';
				const image = new Image();
				image.src = previewUrl;
				await image.decode().catch(() => undefined);

				const observation = await observeImage(image);
				const pose: Pose = observation?.pose ?? { yaw: 0, pitch: 0, roll: 0, source: 'manual' };

				created.push({
					id: `angle-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
					assetId,
					name: file.name,
					previewUrl,
					pose,
					bucket: bucketForYaw(pose.yaw),
					origin: observation ? 'auto' : 'manual',
					file
				});
			} catch (error) {
				URL.revokeObjectURL(previewUrl);
				get().pushLog('error', `${file.name}: ${friendlyError(error)}`);
			}
		}

		const angles = [...get().angles, ...created];

		set({ angles, selectedAngleId: created[0]?.id ?? get().selectedAngleId });
		get().pushLog(
			'success',
			`${created.length} angle${created.length > 1 ? 's' : ''} analysed — ${
				created.filter((angle) => angle.origin === 'auto').length
			} from the face landmarker`
		);

		await get().refreshAssets();
		await get().applyRouting();
	},

	updateAnglePose: (id, pose) => {
		set({
			angles: get().angles.map((angle) =>
				angle.id === id
					? { ...angle, pose: { ...pose, source: 'manual' }, bucket: bucketForYaw(pose.yaw), origin: 'manual' }
					: angle
			)
		});
		void get().applyRouting();
	},

	removeAngle: async (id) => {
		const entry = get().angles.find((angle) => angle.id === id);
		const angles = get().angles.filter((angle) => angle.id !== id);

		set({ angles, selectedAngleId: get().selectedAngleId === id ? null : get().selectedAngleId });

		if (entry?.assetId) {
			await get().removeAsset(entry.assetId);
		}
		await get().applyRouting();
	},

	clearAngles: () => {
		get().angles.forEach((angle) => URL.revokeObjectURL(angle.previewUrl));
		set({ angles: [], route: null, selectedAngleId: null });
	},

	setSelectedAngle: (id) => set({ selectedAngleId: id }),

	setRouteStrategy: (strategy) => {
		set({ routeStrategy: strategy });
		void get().applyRouting();
	},

	setAutoRoute: (enabled) => {
		set({ autoRoute: enabled });
		if (enabled) {
			void get().applyRouting();
		}
	},

	reportTargetPose: (pose) => {
		const insight = get().insight;

		if (!pose) {
			set({ livePose: null });
			return;
		}

		const yaws = [...insight.yaws, pose.yaw].slice(-900);
		const { coverage, gaps } = summariseCoverage(yaws, get().angles);
		const histogram: Record<AngleBucket, number> = {
			front: 0,
			quarter_left: 0,
			profile_left: 0,
			quarter_right: 0,
			profile_right: 0
		};

		yaws.forEach((yaw) => {
			histogram[bucketForYaw(yaw)] += 1;
		});

		const dominant = (Object.entries(histogram).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'front') as AngleBucket;

		const { autoRoute, angles } = get();
		const now = Date.now();
		const movedEnough = lastRoutedYaw === null || Math.abs(pose.yaw - lastRoutedYaw) > 12;
		const cooled = now - lastRouteAt > 1500;

		if (autoRoute && angles.length && movedEnough && cooled) {
			lastRoutedYaw = pose.yaw;
			lastRouteAt = now;
			void get().applyRouting();
		}

		set({
			livePose: pose,
			insight: {
				samples: yaws.length,
				faces: yaws.filter((yaw) => get().angles.some((angle) => Math.abs(angle.pose.yaw - yaw) <= 25)).length,
				meanYaw: yaws.reduce((total, yaw) => total + yaw, 0) / yaws.length,
				dominant,
				coverage,
				gaps,
				yaws
			}
		});
	},

	resetInsight: () => set({ insight: emptyInsight(), livePose: null }),

	applyRouting: async () => {
		const { insight, angles, routeStrategy, autoRoute, livePose } = get();

		if (!angles.length) {
			set({ route: null });
			return null;
		}

		const targetYaw = autoRoute && livePose ? livePose.yaw : insight.samples ? insight.meanYaw : 0;
		const route = routeSource(targetYaw, angles, routeStrategy);

		lastRoutedYaw = livePose?.yaw ?? null;
		lastRouteAt = Date.now();
		set({ route });

		if (route?.assetIds.length) {
			await get().selectSources(route.assetIds);
		}

		return route;
	},

	runJob: async (steps) => {
		const api = get().api;

		if (!api) {
			return;
		}

		if (!steps.length) {
			get().pushLog('warn', 'Add at least one step before rendering');
			return;
		}

		set({ jobBusy: true });

		try {
			const jobId = await api.createJob();
			set({ activeJobId: jobId });

			for (const step of steps) {
				await api.addStep(jobId, step);
			}

			await api.applyJobAction(jobId, 'submit');
			await api.applyJobAction(jobId, 'run');
			get().pushLog('success', `Job ${jobId} submitted with ${steps.length} step(s)`);
			await get().refreshJobs();
			get().pollJob(jobId);
		} catch (error) {
			set({ jobBusy: false });
			get().pushLog('error', friendlyError(error));
		}
	},

	pollJob: (jobId) => {
		if (pollTimer) {
			clearInterval(pollTimer);
		}

		pollTimer = setInterval(async () => {
			const api = get().api;

			if (!api) {
				return;
			}

			try {
				const detail = await api.getJob(jobId);
				const jobDetails = { ...get().jobDetails, [jobId]: detail };
				set({ jobDetails });

				const finished = detail.steps.every((step) => step.status === 'completed' || step.status === 'failed');
				const failed = detail.steps.some((step) => step.status === 'failed');

				if (finished) {
					if (pollTimer) {
						clearInterval(pollTimer);
						pollTimer = null;
					}
					set({ jobBusy: false });
					get().pushLog(failed ? 'warn' : 'success', failed ? `Job ${jobId} failed` : `Job ${jobId} completed`);
					await get().refreshAssets();
				}
			} catch (error) {
				if (pollTimer) {
					clearInterval(pollTimer);
					pollTimer = null;
				}
				set({ jobBusy: false });
				get().pushLog('error', friendlyError(error));
			}
		}, 900);
	},

	retryJob: async (jobId) => {
		const api = get().api;

		if (!api) {
			return;
		}

		try {
			await api.applyJobAction(jobId, 'retry');
			get().pushLog('info', `Retrying ${jobId}`);
			get().pollJob(jobId);
		} catch (error) {
			get().pushLog('error', friendlyError(error));
		}
	},

	deleteJob: async (jobId) => {
		const api = get().api;

		if (!api) {
			return;
		}

		try {
			await api.deleteJob(jobId);
			const jobDetails = { ...get().jobDetails };
			delete jobDetails[jobId ?? ''];
			set({ jobDetails });
			await get().refreshJobs();
		} catch (error) {
			get().pushLog('error', friendlyError(error));
		}
	},

	setActiveJob: (jobId) => {
		set({ activeJobId: jobId });
		if (jobId) {
			void get().pollJob(jobId);
		}
	},

	startWebRtc: async () => {
		const api = get().api;

		if (!api) {
			return;
		}

		await get().stopStream();
		set({ streamMode: 'webrtc', streamStatus: 'connecting', streamMessage: 'Negotiating SDP…' });

		try {
			const session = await api.startWebRtc();
			mediaStream = session.stream;
			set({ mediaStream: session.stream, streamStatus: 'live', streamMessage: 'Receiving processed frames' });
			get().pushLog('success', 'WebRTC stream established');
		} catch (error) {
			set({ streamStatus: 'error', streamMessage: friendlyError(error) });
			get().pushLog('error', `WebRTC failed — ${friendlyError(error)}`);
		}
	},

	startImageStream: async (source) => {
		const api = get().api;

		if (!api || !source) {
			return;
		}

		await get().stopStream();
		set({ streamMode: 'socket', streamStatus: 'connecting', streamMessage: 'Opening image socket…' });

		try {
			imageSocket = await api.openImageSocket({
				onMessage: (data) => {
					const blob = data instanceof Blob ? data : new Blob([data as ArrayBuffer]);
					const previous = get().processedFrameUrl;

					if (previous) {
						URL.revokeObjectURL(previous);
					}
					set({ processedFrameUrl: URL.createObjectURL(blob) });
				},
				onClose: () => {
					imageSocket = null;
					set({ streamStatus: 'idle' });
				}
			});

			const canvas = document.createElement('canvas');
			const context = canvas.getContext('2d');

			streamTimer = setInterval(() => {
				if (!source.videoWidth || !context) {
					return;
				}

				canvas.width = source.videoWidth;
				canvas.height = source.videoHeight;
				context.drawImage(source, 0, 0);

				canvas.toBlob((blob) => {
					if (blob) {
						imageSocket?.send(blob);
					}
				}, 'image/jpeg', 0.8);
			}, 120);

			set({ streamStatus: 'live', streamMessage: 'Streaming frames through the socket' });
			get().pushLog('success', 'Image stream socket open');
		} catch (error) {
			set({ streamStatus: 'error', streamMessage: friendlyError(error) });
			get().pushLog('error', `Image stream failed — ${friendlyError(error)}`);
		}
	},

	stopStream: async () => {
		const api = get().api;

		if (streamTimer) {
			clearInterval(streamTimer);
			streamTimer = null;
		}

		imageSocket?.close();
		imageSocket = null;
		mediaStream?.getTracks().forEach((track) => track.stop());
		mediaStream = null;

		try {
			await api?.stopWebRtc();
		} catch {
			/* nothing to close */
		}

		set({ streamMode: 'off', streamStatus: 'idle', streamMessage: '', mediaStream: null });
	}
}));

export const selectMediaStream = () => mediaStream;
export const studioConfig = loadConfig;
