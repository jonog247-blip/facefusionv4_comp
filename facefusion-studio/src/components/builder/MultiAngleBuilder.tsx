import { lazy, Suspense, useRef, useState } from 'react';
import { Crosshair, Loader2, Rotate3D, Trash2, Upload } from 'lucide-react';
import { bucketLabel, bucketShort, clamp, describePose } from '../../vision/pose';
import type { AngleEntry, RouteStrategy } from '../../vision/poseRouter';
import { useStudio } from '../../store/studio';
import { Badge, Button, Eyebrow, IconButton, Meter, Segmented, Switch } from '../ui/primitives';

// three.js is ~700 kB; it is only needed once the angle builder is on screen.
const HeadCanvas = lazy(() => import('./HeadCanvas').then((module) => ({ default: module.HeadCanvas })));

const AngleRow = ({
	entry,
	selected,
	active,
	onSelect,
	onRemove,
	onYaw
}: {
	entry: AngleEntry;
	selected: boolean;
	active: boolean;
	onSelect: () => void;
	onRemove: () => void;
	onYaw: (yaw: number) => void;
}) => (
	<li
		className={[
			'group relative overflow-hidden rounded-xl border transition duration-200',
			selected ? 'border-apple/50 bg-apple/10' : 'border-white/8 bg-white/[0.03] hover:border-white/20'
		].join(' ')}
	>
		<button type="button" onClick={onSelect} className="flex w-full items-center gap-2.5 p-2 text-left">
			<span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-black/40">
				<img src={entry.previewUrl} alt={entry.name} className="h-full w-full object-cover" />
				<span
					className={[
						'absolute inset-x-0 bottom-0 py-[2px] text-center font-mono text-[9px] tabular',
						active ? 'bg-apple/80 text-white' : 'bg-black/65 text-ink-soft'
					].join(' ')}
				>
					{Math.round(entry.pose.yaw)}°
				</span>
			</span>
			<span className="min-w-0 flex-1">
				<span className="flex items-center gap-1.5">
					<span className="truncate text-[11px] font-medium text-ink">{bucketLabel[entry.bucket]}</span>
					{active ? <Badge tone="accent">routing</Badge> : null}
					{entry.origin === 'manual' ? <Badge tone="warning">manual</Badge> : null}
				</span>
				<span className="tabular mt-0.5 block truncate font-mono text-[10px] text-ink-faint">
					{Math.round(entry.pose.yaw)}° · {Math.round(entry.pose.pitch)}° · {Math.round(entry.pose.roll)}°
				</span>
			</span>
		</button>

		{selected ? (
			<div className="border-t border-white/8 px-2.5 py-2">
				<div className="flex items-center gap-2">
					<span className="w-10 text-[10px] font-semibold uppercase tracking-wide text-ink-faint">Yaw</span>
					<input
						type="range"
						min={-90}
						max={90}
						step={1}
						value={Math.round(entry.pose.yaw)}
						onChange={(event) => onYaw(Number(event.target.value))}
						className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-white/12 accent-apple"
					/>
					<span className="tabular w-10 text-right font-mono text-[10px] text-ink-soft">
						{Math.round(entry.pose.yaw)}°
					</span>
				</div>
				<p className="mt-1.5 font-mono text-[10px] text-ink-faint">{describePose(entry.pose)}</p>
			</div>
		) : null}

		<span className="absolute right-1.5 top-1.5 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
			<IconButton label="Remove angle" tone="danger" className="h-6 w-6 bg-black/50" onClick={onRemove}>
				<Trash2 className="h-3 w-3" />
			</IconButton>
		</span>
	</li>
);

export const MultiAngleBuilder = () => {
	const inputRef = useRef<HTMLInputElement>(null);
	const [busy, setBusy] = useState(false);

	const angles = useStudio((state) => state.angles);
	const selectedAngleId = useStudio((state) => state.selectedAngleId);
	const route = useStudio((state) => state.route);
	const insight = useStudio((state) => state.insight);
	const livePose = useStudio((state) => state.livePose);
	const routeStrategy = useStudio((state) => state.routeStrategy);
	const autoRoute = useStudio((state) => state.autoRoute);
	const landmarkerDetail = useStudio((state) => state.landmarkerDetail);

	const addAngleFiles = useStudio((state) => state.addAngleFiles);
	const updateAnglePose = useStudio((state) => state.updateAnglePose);
	const removeAngle = useStudio((state) => state.removeAngle);
	const setSelectedAngle = useStudio((state) => state.setSelectedAngle);
	const setRouteStrategy = useStudio((state) => state.setRouteStrategy);
	const setAutoRoute = useStudio((state) => state.setAutoRoute);

	const onFiles = async (fileList: FileList | null) => {
		if (!fileList?.length) {
			return;
		}
		setBusy(true);
		await addAngleFiles(Array.from(fileList));
		setBusy(false);
	};

	const activeAssetId = route?.entries[0]?.assetId ?? null;
	const capturedBuckets = new Set(angles.map((angle) => angle.bucket));

	return (
		<div className="flex flex-col gap-3">
			<div className="flex items-center justify-between gap-2">
				<Eyebrow className="flex items-center gap-1.5">
					<Rotate3D className="h-3 w-3" /> Multi-angle head
				</Eyebrow>
				<Button
					size="sm"
					variant="secondary"
					icon={busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
					onClick={() => inputRef.current?.click()}
					disabled={busy}
				>
					Add angle
				</Button>
				<input
					ref={inputRef}
					type="file"
					accept="image/*"
					multiple
					className="hidden"
					onChange={(event) => {
						void onFiles(event.target.files);
						event.target.value = '';
					}}
				/>
			</div>

			<Suspense
				fallback={<div className="h-[236px] w-full animate-pulse-soft rounded-2xl border border-white/8 bg-white/[0.03]" />}
			>
				<HeadCanvas
					angles={angles}
					selectedId={selectedAngleId}
					activeAssetId={activeAssetId}
					livePose={livePose}
					onSelect={(id) => setSelectedAngle(id || null)}
				/>
			</Suspense>

			{angles.length ? (
				<ul className="flex flex-col gap-1.5">
					{angles.map((entry) => (
						<AngleRow
							key={entry.id}
							entry={entry}
							selected={entry.id === selectedAngleId}
							active={entry.assetId === activeAssetId}
							onSelect={() => setSelectedAngle(entry.id)}
							onRemove={() => void removeAngle(entry.id)}
							onYaw={(yaw) => updateAnglePose(entry.id, { ...entry.pose, yaw: clamp(yaw, -90, 90) })}
						/>
					))}
				</ul>
			) : (
				<p className="rounded-xl border border-dashed border-white/10 px-3 py-3 text-[11px] leading-relaxed text-ink-faint">
					Add 3 – 5 photos of the same face. Each one is measured in the browser with the MediaPipe face
					landmarker, then pinned onto the head so the router can hand FaceFusion a source that already
					matches the target&rsquo;s pose.
				</p>
			)}

			{angles.length ? (
				<div className="card flex flex-col gap-2.5 p-2.5">
					<div className="flex items-center justify-between">
						<Eyebrow className="flex items-center gap-1.5">
							<Crosshair className="h-3 w-3" /> Pose router
						</Eyebrow>
						<Switch checked={autoRoute} onChange={setAutoRoute} label="Automatic routing" />
					</div>

					<Segmented
						className="w-full"
						value={routeStrategy}
						onChange={(next) => setRouteStrategy(next as RouteStrategy)}
						options={[
							{ value: 'nearest', label: 'Nearest angle', title: 'Send exactly one source asset' },
							{ value: 'blend', label: 'Blend two', title: 'Average the two bracketing angles' }
						]}
					/>

					<div className="flex items-center justify-between text-[10px] text-ink-faint">
						<span>Target coverage</span>
						<span className="tabular font-mono">
							{insight.samples ? `${Math.round(insight.coverage * 100)}% of ${insight.samples} frames` : 'no target sampled'}
						</span>
					</div>
					<Meter value={insight.coverage} tone={insight.coverage > 0.66 ? 'success' : insight.coverage > 0.33 ? 'warning' : 'danger'} />

					<p className="text-[10px] leading-relaxed text-ink-faint">
						{route
							? `Routing ${Math.round(route.delta)}° off ${bucketLabel[route.entries[0].bucket].toLowerCase()} with ${route.entries.length} source asset${
									route.entries.length > 1 ? 's' : ''
								} (${Math.round(route.confidence * 100)}% confidence).`
							: 'Waiting for a target pose.'}
					</p>

					<div className="flex flex-wrap gap-1">
						{(['profile_left', 'quarter_left', 'front', 'quarter_right', 'profile_right'] as const).map((bucket) => (
							<Badge key={bucket} tone={capturedBuckets.has(bucket) ? 'success' : 'neutral'}>
								{bucketShort[bucket]}
							</Badge>
						))}
					</div>

					{landmarkerDetail ? <p className="text-[10px] text-warning/80">{landmarkerDetail}</p> : null}
				</div>
			) : null}
		</div>
	);
};
