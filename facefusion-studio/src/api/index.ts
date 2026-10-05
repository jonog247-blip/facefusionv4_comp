import { DemoApi } from './demo';
import { HttpApi } from './http';
import { loadConfig, saveConfig, type StudioConfig } from './config';
import type { FaceFusionApi } from './api';

export type { ConnectionListener, ConnectionPhase, FaceFusionApi, ImageSocket, SocketHandlers, WebRtcSession } from './api';
export * from './types';
export { ApiError } from './types';
export { loadConfig, saveConfig, formatBytes, formatClock, humanizeKey, describeJobStatus } from './config';

export interface ProbeResult {
	api: FaceFusionApi;
	/** True when the demo backend is standing in for an unreachable server. */
	fallback: boolean;
	reason?: string;
	serverName?: string;
	serverVersion?: string;
}

const PROBE_TIMEOUT_MS = 2500;

async function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | undefined;

	try {
		return await Promise.race([
			promise,
			new Promise<never>((_, reject) => {
				timer = setTimeout(() => reject(new Error(message)), ms);
			})
		]);
	} finally {
		clearTimeout(timer);
	}
}

/**
 * Resolves the transport once at boot.
 *
 * `auto` (the default) probes `GET /` on the configured server and quietly
 * falls back to the bundled demo backend when nothing answers, so the studio
 * is always usable; `live` refuses to start without a server.
 */
export async function createTransport(overrides: Partial<StudioConfig> = {}): Promise<ProbeResult> {
	const config = overrides.apiBase || overrides.transport ? saveConfig({ ...loadConfig(), ...overrides }) : loadConfig();

	if (config.transport === 'demo') {
		const demo = new DemoApi(config);
		return { api: demo, fallback: true, reason: 'demo transport requested' };
	}

	const http = new HttpApi(config);

	try {
		const identity = await withTimeout(
			http.identity(),
			PROBE_TIMEOUT_MS,
			`no response from ${config.apiBase}`
		);

		return {
			api: http,
			fallback: false,
			serverName: identity.name,
			serverVersion: identity.version
		};
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);

		if (config.transport === 'live') {
			throw error;
		}

		return { api: new DemoApi(config), fallback: true, reason };
	}
}
