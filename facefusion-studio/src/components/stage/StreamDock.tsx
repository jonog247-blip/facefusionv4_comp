import { useEffect, useRef, useState } from 'react';
import { Activity, Camera, Radio, Square, Webcam } from 'lucide-react';
import { useStudio } from '../../store/studio';
import { observeVideoFrame } from '../../vision/faceLandmarker';
import { Badge, Button, Dot, Eyebrow, Panel, PanelHeader } from '../ui/primitives';

const PoseDial = () => {
	const livePose = useStudio((state) => state.livePose);
	const insight = useStudio((state) => state.insight);
	const yaw = livePose?.yaw ?? insight.meanYaw ?? 0;
	const hasData = Boolean(livePose) || insight.samples > 0;

	return (
		<div className="flex items-center gap-3">
			<div className="relative h-12 w-12 shrink-0">
				<svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
					<circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="6" />
					<circle
						cx="50"
						cy="50"
						r="42"
						fill="none"
						stroke={hasData ? '#0a84ff' : 'rgba(255,255,255,0.12)'}
						strokeWidth="6"
						strokeLinecap="round"
						strokeDasharray={`${Math.abs(yaw) * 2.618} 264`}
						transform={yaw < 0 ? 'rotate(180 50 50)' : undefined}
					/>
					<line x1="50" y1="50" x2="50" y2="14" stroke="rgba(255,255,255,0.5)" strokeWidth="3" strokeLinecap="round" />
				</svg>
				<span className="tabular absolute inset-0 flex items-center justify-center font-mono text-sm text-ink-soft">
					{Math.round(yaw)}°
				</span>
			</div>
			<div className="min-w-0">
				<Eyebrow>Live target pose</Eyebrow>
				<p className="tabular truncate font-mono text-sm text-ink-soft">
					{hasData
						? `${insight.samples} frames · ${Math.round(insight.coverage * 100)}% covered`
						: 'sample a target to arm the router'}
				</p>
			</div>
		</div>
	);
};

export const StreamDock = () => {
	const videoRef = useRef<HTMLVideoElement | null>(null);
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const [cameraError, setCameraError] = useState<string | null>(null);
	const [sampling, setSampling] = useState(false);

	const streamMode = useStudio((state) => state.streamMode);
	const streamStatus = useStudio((state) => state.streamStatus);
	const streamMessage = useStudio((state) => state.streamMessage);
	const startWebRtc = useStudio((state) => state.startWebRtc);
	const startImageStream = useStudio((state) => state.startImageStream);
	const stopStream = useStudio((state) => state.stopStream);
	const reportTargetPose = useStudio((state) => state.reportTargetPose);

	/** Samples the camera so the pose router has something to route on. */
	const toggleSampling = async () => {
		if (sampling) {
			setSampling(false);
			(videoRef.current?.srcObject as MediaStream | null)?.getTracks().forEach((track) => track.stop());
			if (videoRef.current) {
				videoRef.current.srcObject = null;
			}
			reportTargetPose(null);
			return;
		}

		try {
			const media = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 360 }, audio: false });
			if (videoRef.current) {
				videoRef.current.srcObject = media;
				await videoRef.current.play();
			}
			setCameraError(null);
			setSampling(true);
		} catch (error) {
			setCameraError(error instanceof Error ? error.message : 'camera unavailable');
		}
	};

	useEffect(() => {
		if (!sampling) {
			return;
		}

		let cancelled = false;
		let raf = 0;
		let last = 0;
		let inFlight = false;

		const tick = async (time: number) => {
			if (cancelled) {
				return;
			}

			raf = requestAnimationFrame(tick);

			// The landmarker takes longer than a frame; never queue detections.
			if (time - last < 90 || inFlight) {
				return;
			}
			last = time;

			const video = videoRef.current;

			if (!video || video.readyState < 2) {
				return;
			}

			inFlight = true;
			const observation = await observeVideoFrame(video);
			inFlight = false;

			if (cancelled) {
				return;
			}

			if (observation) {
				reportTargetPose(observation.pose);
				const canvas = canvasRef.current;

				if (canvas) {
					canvas.width = video.videoWidth;
					canvas.height = video.videoHeight;
					const context = canvas.getContext('2d');

					if (context) {
						context.drawImage(video, 0, 0);
						context.fillStyle = '#0a84ff';

						const [x, y] = [
							observation.box.x * video.videoWidth,
							observation.box.y * video.videoHeight
						];
						context.fillRect(x, y, observation.box.width * video.videoWidth, 2);
						context.fillRect(x, y + observation.box.height * video.videoHeight, observation.box.width * video.videoWidth, 2);
					}
				}
			} else {
				reportTargetPose(null);
			}
		};

		raf = requestAnimationFrame(tick);
		return () => {
			cancelled = true;
			cancelAnimationFrame(raf);
		};
	}, [sampling, reportTargetPose]);

	useEffect(
		() => () => {
			(videoRef.current?.srcObject as MediaStream | null)?.getTracks().forEach((track) => track.stop());
		},
		[]
	);

	const live = streamStatus === 'live';

	return (
		<Panel>
			<PanelHeader
				title={
					<span className="flex items-center gap-2">
						Live pipeline
						<Badge tone={live ? 'success' : streamStatus === 'error' ? 'danger' : 'neutral'}>
							<Dot tone={live ? 'success' : streamStatus === 'error' ? 'danger' : 'neutral'} pulse={live} />
							{streamStatus}
						</Badge>
					</span>
				}
				subtitle={streamMessage || 'WebRTC transport, SDP gathered before the offer is sent'}
			/>

			<div className="flex flex-col gap-3 p-3">
				<div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
					<Button
						variant={streamMode === 'webrtc' && live ? 'primary' : 'secondary'}
						icon={<Radio className="h-3.5 w-3.5" />}
						onClick={() => (streamMode === 'webrtc' && live ? void stopStream() : void startWebRtc())}
						disabled={streamStatus === 'connecting'}
					>
						{streamMode === 'webrtc' && live ? 'Stop stream' : 'WebRTC stream'}
					</Button>
					<Button
						variant={streamMode === 'socket' && live ? 'primary' : 'secondary'}
						icon={<Activity className="h-3.5 w-3.5" />}
						onClick={() => (streamMode === 'socket' && live ? void stopStream() : void startImageStream(videoRef.current))}
						disabled={streamStatus === 'connecting' || !sampling}
						title={sampling ? 'Send camera frames to the engine' : 'Start the camera sampler first'}
					>
						{streamMode === 'socket' && live ? 'Stop socket' : 'Image socket'}
					</Button>
					<Button
						variant={sampling ? 'danger' : 'secondary'}
						icon={sampling ? <Square className="h-3.5 w-3.5" /> : <Webcam className="h-3.5 w-3.5" />}
						onClick={() => void toggleSampling()}
					>
						{sampling ? 'Stop sampler' : 'Sample target'}
					</Button>
				</div>

				<div className="grid grid-cols-1 gap-3 sm:grid-cols-[132px_1fr]">
					<div className="relative aspect-video overflow-hidden rounded-xl border border-white/8 bg-black/60">
						<video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
						<canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-80" />
						{!sampling ? (
							<div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-ink-faint">
								<Camera className="h-4 w-4" />
								<span className="text-sm">camera idle</span>
							</div>
						) : null}
					</div>

					<div className="flex flex-col justify-between gap-2">
						<PoseDial />
						<p className="text-sm leading-relaxed text-ink-faint">
							Every sampled frame is measured in the browser. The yaw feeds the pose router, which selects the
							source asset closest to the current angle and hands it to <span className="font-mono">/state?action=select</span>.
						</p>
						{cameraError ? <p className="text-sm text-danger">{cameraError}</p> : null}
					</div>
				</div>
			</div>
		</Panel>
	);
};
