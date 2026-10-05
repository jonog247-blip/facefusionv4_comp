import { describe, expect, it } from 'vitest';
import { routeSource, summariseCoverage, type AngleEntry } from '../poseRouter';
import { bucketForYaw, type Pose } from '../pose';

const entry = (id: string, yaw: number): AngleEntry => ({
	id,
	assetId: `asset-${id}`,
	name: `${id}.jpg`,
	previewUrl: `blob:${id}`,
	pose: { yaw, pitch: 0, roll: 0, source: 'matrix' } as Pose,
	bucket: bucketForYaw(yaw),
	origin: 'auto'
});

const angles = [entry('front', 0), entry('left', -42), entry('right', 38), entry('profile', -74)];

describe('pose router', () => {
	it('returns null without captured angles', () => {
		expect(routeSource(0, [])).toBeNull();
	});

	it('picks the closest captured angle', () => {
		const route = routeSource(-40, angles, 'nearest');
		expect(route?.entries[0].id).toBe('left');
		expect(route?.delta).toBeCloseTo(2, 5);
	});

	it('blends the two bracketing angles when asked', () => {
		const route = routeSource(2, angles, 'blend');
		expect(route?.entries.map((item) => item.id).sort()).toEqual(['front', 'right']);
		expect(route?.confidence).toBeGreaterThan(0.9);
	});

	it('never blends angles that sit on the same side', () => {
		// Past the right-most capture every remaining candidate is on one side.
		const route = routeSource(80, angles, 'blend');
		expect(route?.entries).toHaveLength(1);
		expect(route?.entries[0].id).toBe('right');
	});

	it('lowers confidence as the gap grows', () => {
		const near = routeSource(-70, angles, 'nearest');
		const far = routeSource(89, angles, 'nearest');
		expect(near?.confidence ?? 0).toBeGreaterThan(far?.confidence ?? 0);
	});

	it('measures coverage of a target yaw distribution', () => {
		const yaws = [0, 2, -3, 5, -1, 0, 4, -2];
		const { coverage, gaps } = summariseCoverage(yaws, angles);

		expect(coverage).toBe(1);
		expect(gaps).toEqual([]);
	});

	it('reports buckets with no captured angle as gaps', () => {
		const yaws = Array.from({ length: 10 }, () => -70);
		const { coverage, gaps } = summariseCoverage(yaws, angles);

		expect(coverage).toBeCloseTo(1, 5);
		expect(gaps).toEqual([]);
	});

	it('reports a real gap when the capture set misses a profile', () => {
		const frontalOnly = [entry('front', 0), entry('left', -20)];
		const yaws = Array.from({ length: 8 }, () => 70);
		const { coverage, gaps } = summariseCoverage(yaws, frontalOnly);

		expect(coverage).toBe(0);
		expect(gaps).toContain('profile_right');
	});

	it('returns an empty profile without samples', () => {
		const { coverage } = summariseCoverage([], angles);
		expect(coverage).toBe(0);
	});
});
