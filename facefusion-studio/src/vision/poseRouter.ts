import { bucketForYaw, type AngleBucket, type Pose } from './pose';

export interface AngleEntry {
	id: string;
	assetId: string;
	name: string;
	previewUrl: string;
	pose: Pose;
	bucket: AngleBucket;
	origin: 'auto' | 'manual';
	/** Bytes kept so a frame can be re-encoded for the image stream. */
	file?: File;
}

export type RouteStrategy = 'nearest' | 'blend';

export interface RouteDecision {
	entries: AngleEntry[];
	assetIds: string[];
	strategy: RouteStrategy;
	/** Degrees between the target yaw and the closest captured angle. */
	delta: number;
	/** 0 – 1, how well the captured set brackets the target yaw. */
	confidence: number;
}

export interface AngleProfile {
	/** Share of sampled frames per bucket, 0 – 1. */
	histogram: Record<AngleBucket, number>;
	samples: number;
	faces: number;
	dominant: AngleBucket;
	meanYaw: number;
	/** 0 – 1 share of frames covered by an angle within ±25°. */
	coverage: number;
	gaps: AngleBucket[];
}

const EMPTY_HISTOGRAM = (): Record<AngleBucket, number> => ({
	front: 0,
	quarter_left: 0,
	profile_left: 0,
	quarter_right: 0,
	profile_right: 0
});

export const createProfile = (): AngleProfile => ({
	histogram: EMPTY_HISTOGRAM(),
	samples: 0,
	faces: 0,
	dominant: 'front',
	meanYaw: 0,
	coverage: 0,
	gaps: []
});

/** Folds one detected frame into a running profile of the target footage. */
export function accumulate(profile: AngleProfile, pose: Pose, covered: boolean, yaws: number[]): AngleProfile {
	const histogram = { ...profile.histogram };
	histogram[bucketForYaw(pose.yaw)] += 1;
	yaws.push(pose.yaw);

	const samples = profile.samples + 1;
	const faces = profile.faces + (covered ? 1 : 0);
	const dominant = (Object.entries(histogram).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'front') as AngleBucket;
	const gaps = (Object.keys(histogram) as AngleBucket[]).filter((bucket) => histogram[bucket] === 0);

	return {
		histogram,
		samples,
		faces,
		dominant,
		meanYaw: yaws.reduce((total, yaw) => total + yaw, 0) / (yaws.length || 1),
		coverage: profile.samples ? profile.faces / samples : 0,
		gaps
	};
}

export const coverageOf = (profile: AngleProfile, entries: AngleEntry[]) => {
	if (!profile.samples || !entries.length) {
		return 0;
	}

	return profile.histogram[profile.dominant];
};

export const nearestAngle = (targetYaw: number, entries: AngleEntry[]): AngleEntry | null => {
	if (!entries.length) {
		return null;
	}

	return entries.reduce((best, entry) =>
		Math.abs(entry.pose.yaw - targetYaw) < Math.abs(best.pose.yaw - targetYaw) ? entry : best
	);
};

/**
 * The pose router. Given the yaw of the face currently being processed it
 * picks the captured source angle that matches it, so FaceFusion receives a
 * source whose geometry lines up with the target frame instead of a frontal
 * portrait it has to warp into shape.
 */
export function routeSource(
	targetYaw: number,
	entries: AngleEntry[],
	strategy: RouteStrategy = 'nearest',
	tolerance = 30
): RouteDecision | null {
	if (!entries.length) {
		return null;
	}

	const sorted = [...entries].sort((a, b) => Math.abs(a.pose.yaw - targetYaw) - Math.abs(b.pose.yaw - targetYaw));
	const closest = sorted[0];
	const delta = Math.abs(closest.pose.yaw - targetYaw);
	const bracketed = sorted.length > 1 && Math.sign(sorted[1].pose.yaw - targetYaw) !== Math.sign(closest.pose.yaw - targetYaw);
	const confidence = Math.max(0, Math.min(1, 1 - delta / (tolerance * 2))) * (bracketed ? 1 : 0.75);

	const chosen = strategy === 'blend' && bracketed && sorted[1] && Math.abs(sorted[1].pose.yaw - targetYaw) < 45
		? [closest, sorted[1]]
		: [closest];

	return {
		entries: chosen,
		assetIds: chosen.map((entry) => entry.assetId).filter(Boolean),
		strategy,
		delta,
		confidence
	};
}

/** Bins the target's yaw distribution for the coverage read-out. */
export function summariseCoverage(yaws: number[], entries: AngleEntry[], tolerance = 25) {
	if (!yaws.length || !entries.length) {
		return { coverage: 0, gaps: [] as AngleBucket[], histogram: EMPTY_HISTOGRAM() };
	}

	const histogram = EMPTY_HISTOGRAM();
	let covered = 0;

	for (const yaw of yaws) {
		const bucket = bucketForYaw(yaw);
		histogram[bucket] += 1;

		const match = entries.some((entry) => Math.abs(entry.pose.yaw - yaw) <= tolerance);
		if (match) {
			covered += 1;
		}
	}

	return {
		coverage: covered / yaws.length,
		gaps: (Object.keys(histogram) as AngleBucket[]).filter((bucket) => histogram[bucket] > 0 && !hasBucket(entries, bucket)),
		histogram
	};
}

const hasBucket = (entries: AngleEntry[], bucket: AngleBucket) => entries.some((entry) => entry.bucket === bucket);
