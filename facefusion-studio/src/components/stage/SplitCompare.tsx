import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Columns2, Maximize2 } from 'lucide-react';
import { useAssetUrl } from '../../hooks/useAssetUrl';
import { useStudio } from '../../store/studio';
import type { Asset } from '../../api/types';
import { Badge, Button, Dot, EmptyState, Segmented } from '../ui/primitives';
import { Clapperboard, ImageIcon } from 'lucide-react';

const AssetSurface = ({ asset, className }: { asset: Asset | null; className?: string }) => {
	const url = useAssetUrl(asset);

	if (!asset) {
		return null;
	}

	if (asset.media === 'video') {
		return (
			<video
				key={asset.id}
				src={url ?? undefined}
				className={`absolute inset-0 h-full w-full object-contain ${className ?? ''}`}
				muted
				playsInline
				loop
				autoPlay
			/>
		);
	}

	return (
		<img
			key={asset.id}
			src={url ?? undefined}
			alt={asset.name}
			className={`absolute inset-0 h-full w-full object-contain ${className ?? ''}`}
		/>
	);
};

type CompareMode = 'split' | 'processed' | 'source';

export const SplitCompare = () => {
	const assets = useStudio((state) => state.assets);
	const mediaStream = useStudio((state) => state.mediaStream);
	const processedFrameUrl = useStudio((state) => state.processedFrameUrl);
	const streamMode = useStudio((state) => state.streamMode);
	const selectedTargetId = useStudio((state) => state.selectedTargetId);
	const selectedSourceIds = useStudio((state) => state.selectedSourceIds);

	const [position, setPosition] = useState(50);
	const [mode, setMode] = useState<CompareMode>('split');
	const [fullscreen, setFullscreen] = useState(false);
	const frameRef = useRef<HTMLDivElement>(null);
	const dragging = useRef(false);

	const source = assets.find((asset) => asset.id === selectedSourceIds[0]) ?? null;
	const target = assets.find((asset) => asset.id === selectedTargetId) ?? null;
	const output =
		[...assets]
			.filter((asset) => asset.type === 'output')
			.sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0] ?? null;

	const streaming = streamMode === 'webrtc' && mediaStream;
	const processed = output ?? target;

	const onMove = useCallback((clientX: number) => {
		const frame = frameRef.current;

		if (!frame) {
			return;
		}

		const rect = frame.getBoundingClientRect();
		setPosition(Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100)));
	}, []);

	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			if (event.key === 'Escape' && fullscreen) {
				setFullscreen(false);
			}
		};

		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [fullscreen]);

	const frame = (
		<div
			ref={frameRef}
			className="relative h-full w-full touch-none select-none overflow-hidden bg-black/60"
			onPointerDown={(event) => {
				if (mode !== 'split' || !processed) {
					return;
				}
				dragging.current = true;
				(event.target as HTMLElement).setPointerCapture?.(event.pointerId);
				onMove(event.clientX);
			}}
			onPointerMove={(event) => dragging.current && onMove(event.clientX)}
			onPointerUp={() => {
				dragging.current = false;
			}}
			onPointerLeave={() => {
				dragging.current = false;
			}}
		>
			{streaming ? (
				<StreamSurface />
			) : processed ? (
				<>
					<AssetSurface asset={processed} />
					{mode !== 'processed' && source ? (
						<div
							className="absolute inset-0"
							style={mode === 'split' ? { clipPath: `inset(0 ${100 - position}% 0 0)` } : undefined}
						>
							<AssetSurface asset={source} />
						</div>
					) : null}
					{mode === 'split' ? (
						<div className="pointer-events-none absolute inset-y-0 w-px bg-white/70 shadow-[0_0_20px_rgba(0,0,0,0.6)]" style={{ left: `${position}%` }}>
							<div className="absolute left-1/2 top-1/2 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/40 bg-white/90 text-black shadow-xl">
								<Columns2 className="h-3.5 w-3.5" />
							</div>
						</div>
					) : null}
					<div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-3">
						<Badge tone="neutral" className="bg-black/55 backdrop-blur">
							{mode === 'processed' ? (processed.name ?? 'processed') : 'source'}
						</Badge>
						{mode === 'split' ? (
							<Badge tone="neutral" className="bg-black/55 backdrop-blur">
								{processed.name ?? 'processed'}
							</Badge>
						) : null}
					</div>
				</>
			) : (
				<EmptyState
					icon={<ImageIcon className="h-6 w-6" />}
					title="Nothing to preview yet"
					detail="Render a job or open a live stream — the processed side appears here next to the source."
				/>
			)}
		</div>
	);

	return (
		<div className={fullscreen ? 'fixed inset-0 z-50 bg-black' : 'flex h-full w-full flex-col'}>
			<div className="flex items-center justify-between gap-2 px-3 py-2">
				<div className="flex items-center gap-2">
					<Segmented
						value={mode}
						onChange={setMode}
						options={[
							{ value: 'split', label: 'Compare' },
							{ value: 'source', label: 'Source' },
							{ value: 'processed', label: 'Result' }
						]}
					/>
					{streaming ? (
						<Badge tone="danger">
							<Dot tone="danger" pulse /> live
						</Badge>
					) : null}
					{streamMode === 'socket' && processedFrameUrl ? (
						<Badge tone="accent">
							<Dot tone="accent" pulse /> socket
						</Badge>
					) : null}
				</div>
				<Button
					size="sm"
					variant="ghost"
					icon={fullscreen ? <ChevronLeft className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
					onClick={() => setFullscreen((value) => !value)}
				>
					{fullscreen ? 'Exit' : 'Full screen'}
				</Button>
			</div>
			<div className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-white/8 bg-black/40">{frame}</div>
			<div className="flex items-center justify-between gap-2 px-1 py-2">
				<StepButtons />
				<div className="flex items-center gap-1.5 text-sm text-ink-faint">
					<Clapperboard className="h-3 w-3" />
					<span className="tabular">
						{source?.name ?? 'no source'} → {processed?.name ?? 'no result'}
					</span>
					<ChevronRight className="h-3 w-3" />
					<span className="tabular">{output ? 'rendered' : 'awaiting render'}</span>
				</div>
			</div>
		</div>
	);
};

const StepButtons = () => {
	const state = useStudio((store) => store.state);
	const patchState = useStudio((store) => store.patchState);
	const steps = Array.isArray(state?.processors) ? (state.processors as string[]) : [];

	const move = (index: number, direction: -1 | 1) => {
		const next = [...steps];
		const target = index + direction;

		if (target < 0 || target >= next.length) {
			return;
		}
		[next[index], next[target]] = [next[target], next[index]];
		void patchState({ processors: next });
	};

	if (!steps.length) {
		return null;
	}

	return (
		<div className="flex flex-wrap items-center gap-1">
			{steps.map((processor, index) => (
				<span key={processor} className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.05] px-1.5 py-1">
					<span className="text-sm font-medium text-ink-soft">{processor.replace(/_/g, ' ')}</span>
					<button type="button" aria-label="Move up" className="text-ink-faint hover:text-ink" onClick={() => move(index, -1)}>
						<ChevronLeft className="h-3 w-3 rotate-90" />
					</button>
					<button type="button" aria-label="Move down" className="text-ink-faint hover:text-ink" onClick={() => move(index, 1)}>
						<ChevronRight className="h-3 w-3 rotate-90" />
					</button>
				</span>
			))}
		</div>
	);
};

const StreamSurface = () => {
	const mediaStream = useStudio((state) => state.mediaStream);
	const processedFrameUrl = useStudio((state) => state.processedFrameUrl);
	const videoRef = useRef<HTMLVideoElement>(null);

	useEffect(() => {
		if (videoRef.current && mediaStream) {
			videoRef.current.srcObject = mediaStream;
			void videoRef.current.play().catch(() => undefined);
		}
	}, [mediaStream]);

	if (mediaStream) {
		return <video ref={videoRef} className="absolute inset-0 h-full w-full object-contain" autoPlay playsInline muted />;
	}

	return processedFrameUrl ? (
		<img src={processedFrameUrl} alt="Processed frame" className="absolute inset-0 h-full w-full object-contain" />
	) : null;
};
