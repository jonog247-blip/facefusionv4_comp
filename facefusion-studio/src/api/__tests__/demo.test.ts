import { describe, expect, it } from 'vitest';
import { DemoApi } from '../demo';
import type { StudioConfig } from '../config';
import { ApiError } from '../types';

const config: StudioConfig = {
	apiBase: 'http://127.0.0.1:8000',
	apiKey: '',
	transport: 'demo',
	landmarkerUrl: '',
	refreshRatio: 0.7
};

const file = (name: string, type = 'image/png') => new File([new Uint8Array(64)], name, { type });

const boot = async () => {
	const api = new DemoApi(config);
	await api.createSession();
	return api;
};

describe('demo backend contract', () => {
	it('rotates tokens and expires the session', async () => {
		const api = await boot();
		const first = await api.createSession();
		const second = await api.refreshSession(first.refresh_token);

		expect(second.access_token).not.toBe(first.access_token);
		expect(second.refresh_token).not.toBe(first.refresh_token);
		expect(api.sessionExpiresAt).toBeGreaterThan(Date.now());
	});

	it('rejects state keys the engine does not know', async () => {
		const api = await boot();

		await expect(api.setState({ not_a_real_option: 1 })).rejects.toBeInstanceOf(ApiError);
	});

	it('rejects values outside the advertised choices', async () => {
		const api = await boot();

		await expect(api.setState({ face_swapper_model: 'not_a_model' })).rejects.toMatchObject({ status: 400 });
		await expect(api.setState({ face_swapper_model: 'inswapper_128' })).resolves.toMatchObject({
			face_swapper_model: 'inswapper_128'
		});
	});

	it('round-trips assets and their selection', async () => {
		const api = await boot();
		const [sourceId] = await api.uploadAssets('source', [file('me.png')]);
		const [targetId] = await api.uploadAssets('target', [file('scene.mp4', 'video/mp4')]);

		const assets = await api.listAssets();
		expect(assets.map((asset) => asset.id).sort()).toEqual([sourceId, targetId].sort());
		expect(assets.find((asset) => asset.id === targetId)?.media).toBe('video');

		const state = await api.selectSources([sourceId]);
		expect(state.source_paths).toEqual([sourceId]);

		await expect(api.selectTarget('missing')).rejects.toMatchObject({ status: 404 });
		await expect(api.selectTarget(targetId)).resolves.toMatchObject({ target_path: targetId });

		await api.deleteAsset(sourceId);
		expect(await api.listAssets()).toHaveLength(1);
	});

	it('walks a job from draft to an output asset', async () => {
		const api = await boot();
		const [sourceId] = await api.uploadAssets('source', [file('me.png')]);
		const [targetId] = await api.uploadAssets('target', [file('scene.mp4', 'video/mp4')]);

		await api.selectSources([sourceId]);
		await api.selectTarget(targetId);

		const jobId = await api.createJob();
		await expect(api.addStep(jobId, { processors: [] })).rejects.toMatchObject({ status: 400 });
		await api.addStep(jobId, { processors: ['face_swapper', 'face_enhancer'] });

		const drafted = await api.getJob(jobId);
		expect(drafted.steps).toHaveLength(1);
		expect(drafted.steps[0].status).toBe('drafted');
		expect(drafted.steps[0].args.processors).toEqual(['face_swapper', 'face_enhancer']);

		await api.applyJobAction(jobId, 'submit');
		expect((await api.getJob(jobId)).steps[0].status).toBe('queued');

		await api.applyJobAction(jobId, 'run');

		let detail = await api.getJob(jobId);
		let guard = 0;

		while (detail.steps[0].status !== 'completed' && guard < 120) {
			await new Promise((resolve) => setTimeout(resolve, 100));
			detail = await api.getJob(jobId);
			guard += 1;
		}

		expect(detail.steps[0].status).toBe('completed');

		const output = (await api.listAssets()).find((asset) => asset.type === 'output');
		expect(output).toBeDefined();
		expect(output?.name).toContain(jobId);
	}, 20_000);

	it('refuses to queue two jobs at once', async () => {
		const api = await boot();
		const first = await api.createJob();
		const second = await api.createJob();

		await api.addStep(first, { processors: ['face_swapper'] });
		await api.addStep(second, { processors: ['face_swapper'] });

		await api.applyJobAction(first, 'submit');
		await expect(api.applyJobAction(second, 'submit')).rejects.toMatchObject({ status: 409 });
	});

	it('lists jobs by status and deletes them', async () => {
		const api = await boot();
		const jobId = await api.createJob();

		expect(Object.keys(await api.listJobs())).toEqual([jobId]);

		await api.deleteJob(jobId);
		expect(Object.keys(await api.listJobs())).toEqual([]);
		await expect(api.getJob(jobId)).rejects.toMatchObject({ status: 404 });
	});

	it('requires a session for every call', async () => {
		const api = new DemoApi(config);

		await expect(api.getState()).rejects.toMatchObject({ status: 401 });
		expect(await api.identity()).toMatchObject({ name: expect.stringContaining('FaceFusion') });
	});
});
