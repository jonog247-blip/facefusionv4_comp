import type { FaceLandmarker as FaceLandmarkerType } from '@mediapipe/tasks-vision';
import { loadConfig } from '../api/config';
import { poseFromLandmarks, poseFromMatrix, type Landmark, type Pose } from './pose';

const CDN_MODEL =
	'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

export type LandmarkerStatus = 'idle' | 'loading' | 'ready' | 'unavailable';

export interface FaceObservation {
	pose: Pose;
	landmarks: Landmark[];
	/** Bounding box of the face in normalised image space. */
	box: { x: number; y: number; width: number; height: number };
}

let instance: FaceLandmarkerType | null = null;
let loading: Promise<FaceLandmarkerType | null> | null = null;
let status: LandmarkerStatus = 'idle';
const listeners = new Set<(status: LandmarkerStatus, detail?: string) => void>();

const emit = (next: LandmarkerStatus, detail?: string) => {
	status = next;
	listeners.forEach((listener) => listener(next, detail));
};

export const onLandmarkerStatus = (listener: (status: LandmarkerStatus, detail?: string) => void) => {
	listeners.add(listener);
	listener(status);
	return () => listeners.delete(listener);
};

export const landmarkerStatus = () => status;

async function resolveModelUrl() {
	const configured = loadConfig().landmarkerUrl;

	if (configured) {
		return configured;
	}

	const local = `${import.meta.env.BASE_URL}models/face_landmarker.task`;

	try {
		const response = await fetch(local, { method: 'HEAD' });
		if (response.ok) {
			return local;
		}
	} catch {
		/* fall through to the CDN */
	}

	return CDN_MODEL;
}

/**
 * Lazily boots MediaPipe Face Landmarker entirely in the browser: the wasm
 * runtime is served from `public/mediapipe`, the `.task` model from a local
 * drop-in when present and from the MediaPipe CDN otherwise. No FaceFusion
 * server is involved, which is what keeps the angle builder client-side.
 */
export async function getFaceLandmarker(): Promise<FaceLandmarkerType | null> {
	if (instance) {
		return instance;
	}

	if (loading) {
		return loading;
	}

	loading = (async () => {
		emit('loading');

		try {
			const { FaceLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision');
			const fileset = await FilesetResolver.forVisionTasks(`${import.meta.env.BASE_URL}mediapipe`);
			const modelAssetPath = await resolveModelUrl();

			instance = await FaceLandmarker.createFromOptions(fileset, {
				baseOptions: { modelAssetPath, delegate: 'GPU' },
				runningMode: 'IMAGE',
				numFaces: 1,
				outputFaceBlendshapes: false,
				outputFacialTransformationMatrixes: true
			});

			emit('ready');
			return instance;
		} catch (error) {
			emit('unavailable', error instanceof Error ? error.message : String(error));
			return null;
		} finally {
			loading = null;
		}
	})();

	return loading;
}

function toObservation(
	landmarks: Landmark[],
	matrix: ArrayLike<number> | undefined
): FaceObservation {
	const landmarkPose = poseFromLandmarks(landmarks);
	const matrixPose = matrix ? poseFromMatrix(matrix, landmarkPose.yaw) : null;

	const xs = landmarks.map((point) => point.x);
	const ys = landmarks.map((point) => point.y);
	const minX = Math.min(...xs);
	const minY = Math.min(...ys);

	return {
		pose: matrixPose ? { ...matrixPose, roll: landmarkPose.roll } : landmarkPose,
		landmarks,
		box: {
			x: minX,
			y: minY,
			width: Math.max(...xs) - minX,
			height: Math.max(...ys) - minY
		}
	};
}

/** Detects a face in a still image. Returns null when no face is present. */
export type DetectableSource = HTMLImageElement | HTMLCanvasElement | HTMLVideoElement | ImageBitmap;

export async function observeImage(source: DetectableSource): Promise<FaceObservation | null> {
	const landmarker = await getFaceLandmarker();

	if (!landmarker) {
		return null;
	}

	const result = landmarker.detect(source as Parameters<FaceLandmarkerType['detect']>[0]);
	const landmarks = result.faceLandmarks?.[0];

	if (!landmarks?.length) {
		return null;
	}

	return toObservation(landmarks, result.facialTransformationMatrixes?.[0]?.data);
}

/** Detects a face in a video frame, reusing the same static-mode detector. */
export async function observeVideoFrame(source: HTMLVideoElement): Promise<FaceObservation | null> {
	if (source.readyState < 2 || source.videoWidth === 0) {
		return null;
	}

	const landmarker = await getFaceLandmarker();

	if (!landmarker) {
		return null;
	}

	const result = landmarker.detect(source);
	const landmarks = result.faceLandmarks?.[0];

	if (!landmarks?.length) {
		return null;
	}

	return toObservation(landmarks, result.facialTransformationMatrixes?.[0]?.data);
}
