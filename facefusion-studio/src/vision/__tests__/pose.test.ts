import { describe, expect, it } from 'vitest';
import {
	bucketForYaw,
	normalizeAngle,
	poseFromLandmarks,
	poseFromMatrix,
	poseToVector,
	type Landmark
} from '../pose';

/** Builds a frontal landmark cloud: nose centred, eyes level, symmetric cheeks. */
const frontal = (): Landmark[] => {
	const points = new Array(478).fill(null).map(() => ({ x: 0.5, y: 0.5, z: 0 }));

	points[1] = { x: 0.5, y: 0.58, z: 0 }; // nose tip
	points[33] = { x: 0.42, y: 0.45, z: -0.02 }; // outer eye, image left
	points[263] = { x: 0.58, y: 0.45, z: -0.02 }; // outer eye, image right
	points[199] = { x: 0.5, y: 0.78, z: 0 }; // chin
	points[10] = { x: 0.5, y: 0.32, z: 0 }; // brow
	points[234] = { x: 0.28, y: 0.6, z: -0.05 }; // cheek, image left
	points[454] = { x: 0.72, y: 0.6, z: -0.05 }; // cheek, image right

	return points;
};

const turned = (offset: number): Landmark[] => {
	const points = frontal();

	points[1] = { x: 0.5 + offset, y: 0.58, z: -0.2 };
	points[33] = { x: 0.42 + offset * 0.25, y: 0.45, z: -0.04 };
	points[263] = { x: 0.58 + offset * 0.25, y: 0.45, z: -0.04 };
	points[234] = { x: 0.28 + offset * 0.25, y: 0.6, z: -0.05 };
	points[454] = { x: 0.72 + offset * 0.25, y: 0.6, z: -0.05 };

	return points;
};

describe('pose from landmarks', () => {
	it('reads a frontal face as ~0° yaw', () => {
		const pose = poseFromLandmarks(frontal());
		expect(Math.abs(pose.yaw)).toBeLessThan(4);
		expect(pose.source).toBe('landmarks');
	});

	it('grows monotonically with the turn', () => {
		const small = poseFromLandmarks(turned(0.06)).yaw;
		const medium = poseFromLandmarks(turned(0.13)).yaw;
		const large = poseFromLandmarks(turned(0.2)).yaw;

		expect(Math.abs(small)).toBeLessThan(Math.abs(medium));
		expect(Math.abs(medium)).toBeLessThan(Math.abs(large));
	});

	it('detects roll from the eye line', () => {
		const points = frontal();

		points[33] = { x: 0.42, y: 0.4, z: 0 };
		points[263] = { x: 0.58, y: 0.5, z: 0 };

		// The right eye sits lower than the left, so the head tilts clockwise.
		expect(Math.round(poseFromLandmarks(points).roll)).toBe(32);
	});

	it('survives a truncated cloud', () => {
		const pose = poseFromLandmarks([{ x: 0.5, y: 0.5, z: 0 }]);
		expect(pose).toEqual({ yaw: 0, pitch: 0, roll: 0, source: 'landmarks' });
	});
});

describe('pose from transformation matrix', () => {
	// Column major identity = frontal, no rotation.
	const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

	it('reads an identity matrix as a frontal pose', () => {
		const pose = poseFromMatrix(identity);
		expect(pose?.yaw).toBeCloseTo(0, 5);
		expect(pose?.source).toBe('matrix');
	});

	it('reads a yaw rotation', () => {
		const angle = (35 * Math.PI) / 180;
		const cos = Math.cos(angle);
		const sin = Math.sin(angle);
		// Rotation about Y in column major layout.
		const matrix = [cos, 0, -sin, 0, 0, 1, 0, 0, sin, 0, cos, 0, 0, 0, 0, 1];

		expect(Math.round(poseFromMatrix(matrix)?.yaw ?? 0)).toBe(35);
	});

	it('aligns its sign convention with the landmark estimate', () => {
		const angle = (-40 * Math.PI) / 180;
		const cos = Math.cos(angle);
		const sin = Math.sin(angle);
		const matrix = [cos, 0, -sin, 0, 0, 1, 0, 0, sin, 0, cos, 0, 0, 0, 0, 1];

		const pose = poseFromMatrix(matrix, -38);
		expect(pose?.yaw).toBeLessThan(0);
	});

	it('returns null for a short matrix', () => {
		expect(poseFromMatrix([1, 2, 3])).toBeNull();
	});
});

describe('buckets and vectors', () => {
	it.each([
		[0, 'front'],
		[20, 'quarter_right'],
		[70, 'profile_right'],
		[-20, 'quarter_left'],
		[-70, 'profile_left']
	])('maps %s° to %s', (yaw, bucket) => {
		expect(bucketForYaw(yaw as number)).toBe(bucket);
	});

	it('normalises angles into (-180, 180]', () => {
		expect(normalizeAngle(190)).toBe(-170);
		expect(normalizeAngle(-190)).toBe(170);
		expect(normalizeAngle(180)).toBe(180);
	});

	it('places a frontal pose on +Z and a turned pose off axis', () => {
		const [fx, , fz] = poseToVector({ yaw: 0, pitch: 0, roll: 0, source: 'manual' });
		expect(Math.abs(fx)).toBeLessThan(1e-9);
		expect(fz).toBeGreaterThan(0);

		const [rx, , rz] = poseToVector({ yaw: 60, pitch: 0, roll: 0, source: 'manual' });
		expect(rx).toBeGreaterThan(0);
		expect(rz).toBeLessThan(fz);
	});
});
