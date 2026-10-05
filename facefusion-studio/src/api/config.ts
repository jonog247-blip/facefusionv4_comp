import type { JobStatus, StepStatus } from './types';

export type TransportMode = 'auto' | 'live' | 'demo';

export interface StudioConfig {
	apiBase: string;
	apiKey: string;
	transport: TransportMode;
	landmarkerUrl: string;
	/** Session lifetime is 10 minutes server side; rotate at 70 % to stay ahead. */
	refreshRatio: number;
}

const STORAGE_KEY = 'facefusion-studio:config';

function env(key: string, fallback: string) {
	const value = (import.meta.env as Record<string, string | undefined>)[key];
	return value === undefined || value === '' ? fallback : value;
}

function readStored(): Partial<StudioConfig> {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		return raw ? (JSON.parse(raw) as Partial<StudioConfig>) : {};
	} catch {
		return {};
	}
}

export const loadConfig = (): StudioConfig => {
	const stored = readStored();

	return {
		apiBase: stored.apiBase ?? env('VITE_FF_API_BASE', 'http://127.0.0.1:8000'),
		apiKey: stored.apiKey ?? env('VITE_FF_API_KEY', ''),
		transport: (stored.transport ?? env('VITE_FF_TRANSPORT', 'auto')) as TransportMode,
		landmarkerUrl: stored.landmarkerUrl ?? env('VITE_FF_LANDMARKER_URL', ''),
		refreshRatio: stored.refreshRatio ?? 0.7
	};
};

export const saveConfig = (patch: Partial<StudioConfig>) => {
	const next = { ...loadConfig(), ...patch };

	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
	} catch {
		/* private mode — keep the in-memory value */
	}

	return next;
};

export const jobStatuses: JobStatus[] = ['drafted', 'queued', 'completed', 'failed'];

export const stepStatuses: StepStatus[] = ['drafted', 'queued', 'started', 'completed', 'failed'];

export const terminalStatuses: StepStatus[] = ['completed', 'failed'];

export const isTerminal = (status: StepStatus) => status === 'completed' || status === 'failed';

export const describeJobStatus = (status: StepStatus | JobStatus) => {
	switch (status) {
		case 'drafted':
			return 'Drafted';
		case 'queued':
			return 'Queued';
		case 'started':
			return 'Processing';
		case 'completed':
			return 'Completed';
		case 'failed':
			return 'Failed';
		default:
			return status;
	}
};

export const formatBytes = (bytes: number) => {
	if (!Number.isFinite(bytes) || bytes <= 0) {
		return '—';
	}

	const units = ['B', 'KB', 'MB', 'GB'];
	const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
	const value = bytes / 1024 ** index;

	return `${value >= 10 || index === 0 ? Math.round(value) : value.toFixed(1)} ${units[index]}`;
};

export const humanizeKey = (key: string) => key.replace(/_/g, ' ');

export const formatClock = (totalSeconds: number) => {
	if (!Number.isFinite(totalSeconds) || totalSeconds < 0) {
		return '00:00';
	}

	const minutes = Math.floor(totalSeconds / 60);
	const seconds = Math.floor(totalSeconds % 60);

	return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};
