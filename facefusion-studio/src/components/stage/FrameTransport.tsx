import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Crosshair, Loader2, Pause, Play, Repeat, SkipBack, SkipForward, X } from 'lucide-react';
import { useStudio } from '../../store/studio';
import { useAssetUrl } from '../../hooks/useAssetUrl';
import { formatClock } from '../../api/config';
import type { Asset } from '../../api/types';
import { Badge, Button, Eyebrow, IconButton, Panel, PanelHeader, Spinner } from '../ui/primitives';

const CAPTURE_RESOLUTIONS = ['256x256', '512x512', '768x768'];

/**
 * Frame-level transport for the selected target (or the newest output).
 *
 * Two things here reach into the engine rather than staying cosmetic: the
 * scrubbed frame number is written to `reference_frame_index` through
 * `PUT /state`, and the capture strip comes from
 * `GET /assets/{id}?action=capture&subject=face`, which is the same code path
 * the engine uses to sample faces.
 */
export const FrameTransport = () => {
	const videoRef = useRef<HTMLVideoElement>(null);
	const previewRef = useRef<HTMLCanvasElement>(null);
	const assets = useStudio((state) => state.assets);
	const api = useStudio((state) => state.api);
	const selectedTargetId = useStudio((state) => state.selectedTargetId);
	const referenceFrame = useStudio((state) => Number(state.state?.reference_frame_index ?? 0));
	const patchState = useStudio((state) => state.patchState);
	const pushLog = useStudio((state) => state.pushLog);

	const output = [...assets]
		.filter((asset) => asset.type === 'output')
		.sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0];
	const asset: Asset | undefined =
		assets.find((entry) => entry.id === selectedTargetId && entry.media === 'video') ??
		(output?.media === 'video' ? output : undefined) ??
		assets.find((entry) => entry.id === selectedTargetId) ??
		undefined;

	const url = useAssetUrl(asset);

	const [playing, setPlaying] = useState(false);
	const [time, setTime] = useState(0);
	const [duration, setDuration] = useState(0);
	const [fps, setFps] = useState(30);
	const [loop, setLoop] = useState(true);
	const [captureUrl, setCaptureUrl] = useState<string | null>(null);
	const [capturing, setCapturing] = useState(false);
	const [resolution, setResolution] = useState('512x512');

	const step = 1 / fps;

	const toggle = useCallback(() => {
		const video = videoRef.current;

		if (!video) {
			return;
		}

		if (video.paused) {
			void video.play().catch(() => undefined);
			setPlaying(true);
		} else {
			video.pause();
			setPlaying(false);
		}
	}, []);

	const seek = useCallback(
		(seconds: number) => {
			const video = videoRef.current;

			if (!video) {
				return;
			}

			const next = Math.max(0, Math.min(duration || video.duration || 0, seconds));
			video.currentTime = next;
			setTime(next);
		},
		[duration]
	);

	useEffect(() => {
		const video = videoRef.current;

		if (!video || !url) {
			return;
		}

		const onMetadata = () => {
			setDuration(video.duration || 0);
			setTime(video.currentTime || 0);
		};

		video.addEventListener('loadedmetadata', onMetadata);
		return () => video.removeEventListener('loadedmetadata', onMetadata);
	}, [url]);

	// A <video> does not expose its frame rate, so it is measured from the
	// presented frames — otherwise "next frame" would be a guess.
	useEffect(() => {
		const video = videoRef.current as (HTMLVideoElement & {
			requestVideoFrameCallback?: (callback: (now: number, metadata: { mediaTime: number }) => void) => number;
		}) | null;

		if (!video || !url || typeof video.requestVideoFrameCallback !== 'function') {
			return;
		}

		let handle = 0;
		let last = 0;
		let samples = 0;
		let total = 0;

		const onFrame = (_now: number, metadata: { mediaTime: number }) => {
			if (last > 0) {
				const delta = metadata.mediaTime - last;
				if (delta > 0) {
					total += delta;
					samples += 1;
				}
			}
			last = metadata.mediaTime;

			if (samples >= 12 && total > 0) {
				setFps(Math.max(1, Math.round(1 / (total / samples))));
				return;
			}

			handle = video.requestVideoFrameCallback?.(onFrame) ?? 0;
		};

		handle = video.requestVideoFrameCallback(onFrame);

		return () => {
			if (handle && typeof video.cancelVideoFrameCallback === 'function') {
				video.cancelVideoFrameCallback(handle);
			}
		};
	}, [url]);

	// `rVFC` is not universal; a timer is enough for a timecode read-out, and
	// the same tick refreshes the visible preview of the scrubbed frame.
	useEffect(() => {
		if (!url) {
			return;
		}

		const draw = () => {
			const video = videoRef.current;
			const canvas = previewRef.current;

			if (!video || !canvas || video.readyState < 2) {
				return;
			}

			if (!video.paused) {
				setTime(video.currentTime);
			}

			const width = 288;
			const height = Math.round((width * video.videoHeight) / (video.videoWidth || 1)) || 162;

			if (canvas.width !== width || canvas.height !== height) {
				canvas.width = width;
				canvas.height = height;
			}

			canvas.getContext('2d')?.drawImage(video, 0, 0, width, height);
		};

		draw();
		const timer = setInterval(draw, 66);

		return () => clearInterval(timer);
	}, [url]);

	useEffect(() => {
		setPlaying(false);
		setTime(0);
		setDuration(0);
	}, [url]);

	const frameIndex = Math.round(time * fps);

	const applyReference = () => {
		void patchState({ reference_frame_index: frameIndex });
		pushLog('info', `Reference frame set to ${frameIndex}`);
	};

	const capture = async (subject: 'frame' | 'face') => {
		if (!api || !asset) {
			return;
		}

		setCapturing(true);

		try {
			const blob = await api.captureAsset(asset.id, {
				resolution,
				subject,
				frameIndex: asset.media === 'video' ? [frameIndex] : undefined
			});
			setCaptureUrl((previous) => {
				if (previous) {
					URL.revokeObjectURL(previous);
				}
				return URL.createObjectURL(blob);
			});
			pushLog('success', `Captured ${subject} strip at ${resolution}`);
		} catch (error) {
			pushLog('error', error instanceof Error ? error.message : 'capture failed');
		} finally {
			setCapturing(false);
		}
	};

	if (!asset) {
		return (
			<Panel>
				<PanelHeader
					title="Frame transport"
					subtitle="Upload a video target to scrub, step and capture frames"
				/>
			</Panel>
		);
	}

	const isVideo = asset.media === 'video';

	return (
		<Panel>
			<PanelHeader
				title={
					<span className="flex items-center gap-2">
						Frame transport
						<Badge tone={isVideo ? 'accent' : 'neutral'}>{asset.media}</Badge>
					</span>
				}
				subtitle={asset.name}
				action={
					captureUrl ? (
						<IconButton label="Close capture" onClick={() => setCaptureUrl(null)}>
							<X className="h-4 w-4" />
						</IconButton>
					) : null
				}
			/>

			<div className="flex flex-col gap-3 p-4">
				{isVideo ? (
					<>
						<video
							ref={videoRef}
							src={url ?? undefined}
							className="hidden"
							muted
							playsInline
							loop={loop}
							onPlay={() => setPlaying(true)}
							onPause={() => setPlaying(false)}
						/>

						<div className="flex flex-col gap-3 sm:flex-row sm:items-start">
							<figure className="shrink-0 overflow-hidden rounded-xl border border-white/10 bg-black/60">
								<canvas ref={previewRef} className="block h-auto w-full max-w-72" />
								<figcaption className="tabular border-t border-white/8 px-2 py-1 text-center font-mono text-[11px] text-ink-faint">
									frame {frameIndex} · {formatClock(time)}
								</figcaption>
							</figure>
							<div className="flex min-w-0 flex-1 flex-col gap-3">
						<div className="flex items-center gap-3">
							<Button
								variant={playing ? 'secondary' : 'primary'}
								icon={playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
								onClick={toggle}
							>
								{playing ? 'Pause' : 'Play'}
							</Button>
							<IconButton label="Previous frame" onClick={() => seek(time - step)}>
								<SkipBack className="h-4 w-4" />
							</IconButton>
							<IconButton label="Next frame" onClick={() => seek(time + step)}>
								<SkipForward className="h-4 w-4" />
							</IconButton>
							<IconButton label="Loop" active={loop} onClick={() => setLoop((value) => !value)}>
								<Repeat className="h-4 w-4" />
							</IconButton>

							<span className="tabular ml-1 shrink-0 font-mono text-sm text-ink-soft">
								{formatClock(time)} <span className="text-ink-faint">/ {formatClock(duration)}</span>
							</span>
							<span className="tabular shrink-0 rounded-lg bg-white/[0.06] px-2 py-1 font-mono text-xs text-ink-soft">
								frame {frameIndex}
							</span>
							<label className="flex shrink-0 items-center gap-1.5 text-xs text-ink-faint">
								fps
								<input
									type="number"
									min={1}
									max={120}
									value={fps}
									onChange={(event) => setFps(Math.max(1, Math.min(120, Number(event.target.value) || 30)))}
									className="tabular h-8 w-14 rounded-lg border border-white/12 bg-white/[0.05] px-2 text-center font-mono text-xs text-ink focus:border-apple/60 focus:outline-none"
								/>
							</label>
						</div>

						<div className="flex items-center gap-3">
							<input
								type="range"
								className="range flex-1"
								min={0}
								max={Math.max(duration, 0.01)}
								step={step}
								value={Math.min(time, duration)}
								onChange={(event) => seek(Number(event.target.value))}
							/>
						</div>
							</div>
						</div>
					</>
				) : (
					<p className="text-xs text-ink-faint">
						Still images have no timeline — use the capture controls below to pull a face strip from the server.
					</p>
				)}

				<div className="flex flex-wrap items-center gap-2">
					<Eyebrow className="mr-1">Capture</Eyebrow>
					{CAPTURE_RESOLUTIONS.map((size) => (
						<button
							key={size}
							type="button"
							onClick={() => setResolution(size)}
							className={`rounded-lg border px-2.5 py-1.5 font-mono text-xs transition ${
								resolution === size
									? 'border-apple/50 bg-apple/20 text-apple'
									: 'border-white/12 bg-white/[0.04] text-ink-faint hover:text-ink-soft'
							}`}
						>
							{size}
						</button>
					))}
					<Button
						size="sm"
						variant="secondary"
						icon={capturing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
						disabled={capturing}
						onClick={() => void capture('frame')}
					>
						Frames
					</Button>
					<Button
						size="sm"
						variant="secondary"
						icon={capturing ? <Spinner /> : <Crosshair className="h-3.5 w-3.5" />}
						disabled={capturing}
						onClick={() => void capture('face')}
					>
						Faces
					</Button>
					{isVideo ? (
						<Button size="sm" variant="ghost" icon={<Crosshair className="h-3.5 w-3.5" />} onClick={applyReference}>
							Use frame {frameIndex} as reference
						</Button>
					) : null}
					<span className="tabular ml-auto font-mono text-xs text-ink-faint">
						reference_frame_index = {referenceFrame}
					</span>
				</div>

				{captureUrl ? (
					<div className="animate-in-up overflow-hidden rounded-xl border border-white/10 bg-black/40 p-2">
						<img src={captureUrl} alt="Captured frames" className="mx-auto max-h-64 object-contain" />
						<p className="mt-1.5 text-center text-sm text-ink-faint">
							GET /assets/{asset.id.slice(0, 8)}…?action=capture&subject=…
						</p>
					</div>
				) : null}
			</div>
		</Panel>
	);
};