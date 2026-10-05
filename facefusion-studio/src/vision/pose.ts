/**
 * Pose maths for the multi-angle builder.
 *
 * Two independent estimators feed the same {@link Pose} shape:
 *  1. the MediaPipe facial transformation matrix (authoritative — a rigid
 *     4x4 fit of the canonical face model), and
 *  2. a geometric fallback derived from the 478 landmark points, used when
 *     the model runs without `outputFacialTransformationMatrixes`.
 */

export interface Landmark {
	x: number;
	y: number;
	z: number;
}

export interface Pose {
	/** Negative looks towards the subject's right (image left). */
	yaw: number;
	/** Positive looks up. */
	pitch: number;
	roll: number;
	/** Which estimator produced the numbers. */
	source: 'matrix' | 'landmarks' | 'manual';
}

export type AngleBucket = 'front' | 'quarter_left' | 'profile_left' | 'quarter_right' | 'profile_right';

export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const toDegrees = (radians: number) => (radians * 180) / Math.PI;

export const normalizeAngle = (angle: number) => {
	let value = ((angle + 180) % 360 + 360) % 360 - 180;
	if (value === -180) {
		value = 180;
	}
	return value;
};

/**
 * Yaw from the landmark cloud. The nose tip drifts across the eye midpoint as
 * the head turns; the cheek span gives the reference width, so the ratio goes
 * to ±1 at a full profile and 0 when frontal.
 */
export function yawFromLandmarks(landmarks: Landmark[]): number {
	const nose = landmarks[1];
	const leftEye = landmarks[33];
	const rightEye = landmarks[263];
	const leftCheek = landmarks[234];
	const rightCheek = landmarks[454];

	if (!nose || !leftEye || !rightEye || !leftCheek || !rightCheek) {
		return 0;
	}

	const eyeMidX = (leftEye.x + rightEye.x) / 2;
	const cheekSpan = Math.hypot(rightCheek.x - leftCheek.x, rightCheek.y - leftCheek.y) || 1;
	const ratio = clamp(((nose.x - eyeMidX) / cheekSpan) * 2, -1, 1);

	return toDegrees(Math.asin(ratio));
}

export function pitchFromLandmarks(landmarks: Landmark[]): number {
	const nose = landmarks[1];
	const leftEye = landmarks[33];
	const rightEye = landmarks[263];
	const chin = landmarks[199];
	const brow = landmarks[10];

	if (!nose || !leftEye || !rightEye || !chin) {
		return 0;
	}

	const eyeMidY = (leftEye.y + rightEye.y) / 2;
	const upper = Math.abs(nose.y - eyeMidY);
	const lower = Math.abs(chin.y - eyeMidY);
	const reference = brow ? Math.abs(eyeMidY - brow.y) : upper * 1.6;
	const balance = clamp(((upper - lower) / (upper + lower || 1)) * 1.35, -1, 1);
	const tilt = reference > 0 ? clamp((upper - reference * 0.62) / (reference * 0.62 || 1), -1, 1) : 0;

	return toDegrees(Math.asin(clamp(balance * 0.72 + tilt * 0.28, -1, 1)));
}

export function rollFromLandmarks(landmarks: Landmark[]): number {
	const leftEye = landmarks[33];
	const rightEye = landmarks[263];

	if (!leftEye || !rightEye) {
		return 0;
	}

	return toDegrees(Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x));
}

export function poseFromLandmarks(landmarks: Landmark[]): Pose {
	if (!landmarks || landmarks.length < 4) {
		return { yaw: 0, pitch: 0, roll: 0, source: 'landmarks' };
	}

	return {
		yaw: normalizeAngle(yawFromLandmarks(landmarks)),
		pitch: clamp(pitchFromLandmarks(landmarks), -90, 90),
		roll: normalizeAngle(rollFromLandmarks(landmarks)),
		source: 'landmarks'
	};
}

/**
 * Decompose MediaPipe's 4x4 facial transformation matrix (column major) into
 * Euler angles. `referenceYaw` comes from the landmark estimator and only
 * fixes the sign convention, which differs between the model and the image
 * space the landmarks are expressed in.
 */
export function poseFromMatrix(data: ArrayLike<number>, referenceYaw?: number): Pose | null {
	if (!data || data.length < 16) {
		return null;
	}

	// Column major: R[row][column] = data[4 * column + row]
	const r00 = data[0];
	const r10 = data[1];
	const r20 = data[2];
	const r02 = data[8];
	const r22 = data[10];

	const roll = Math.atan2(r10, r00);
	const pitch = Math.atan2(-r20, Math.hypot(r10, r00));
	let yaw = Math.atan2(r02, r22);

	if (referenceYaw !== undefined && Math.abs(referenceYaw) > 8 && Math.sign(yaw) !== Math.sign(referenceYaw)) {
		yaw = -yaw;
	}

	return {
		yaw: normalizeAngle(toDegrees(yaw)),
		pitch: clamp(toDegrees(pitch), -90, 90),
		roll: normalizeAngle(toDegrees(roll)),
		source: 'matrix'
	};
}

export function bucketForYaw(yaw: number): AngleBucket {
	if (yaw < -55) return 'profile_left';
	if (yaw < -15) return 'quarter_left';
	if (yaw > 55) return 'profile_right';
	if (yaw > 15) return 'quarter_right';
	return 'front';
}

export const bucketLabel: Record<AngleBucket, string> = {
	front: 'Frontal',
	quarter_left: '3/4 Left',
	profile_left: 'Profile Left',
	quarter_right: '3/4 Right',
	profile_right: 'Profile Right'
};

export const bucketShort: Record<AngleBucket, string> = {
	front: '0°',
	quarter_left: '-45°',
	profile_left: '-90°',
	quarter_right: '+45°',
	profile_right: '+90°'
};

/** Unit vector on the head sphere, used to place the pins in the 3D view. */
export function poseToVector(pose: Pose, radius = 1) {
	const yaw = (pose.yaw * Math.PI) / 180;
	const pitch = (pose.pitch * Math.PI) / 180;

	return [
		radius * Math.sin(yaw) * Math.cos(pitch),
		radius * -Math.sin(pitch),
		radius * Math.cos(yaw) * Math.cos(pitch)
	] as [number, number, number];
}

export function describePose(pose: Pose) {
	const sign = (value: number) => (value > 0 ? '+' : '');

	return `${sign(pose.yaw)}${Math.round(pose.yaw)}° yaw · ${sign(pose.pitch)}${Math.round(pose.pitch)}° pitch · ${sign(
		pose.roll
	)}${Math.round(pose.roll)}° roll`;
}
