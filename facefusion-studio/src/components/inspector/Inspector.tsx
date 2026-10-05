import { useMemo, useState } from 'react';
import { ChevronRight, Cpu, SlidersHorizontal, Sparkles } from 'lucide-react';
import { useStudio } from '../../store/studio';
import { humanizeKey } from '../../api/config';
import type { Capability } from '../../api/types';
import { CapabilityControl } from './controls';
import { Badge, Dot, Eyebrow, PanelHeader, Spinner } from '../ui/primitives';

/**
 * `face_masker` renders as "face masker" and `frame_extraction` as
 * "frame extraction" — technically right, useless to read. Every group gets a
 * plain-language title, and the engine key stays visible underneath.
 */
const GROUP_LABELS: Record<string, { title: string; hint: string }> = {
	workflow: { title: 'Workflow', hint: 'How the engine chains the processors together' },
	processors: { title: 'Processors', hint: 'Enabled processors, applied in the order shown' },
	face_detector: { title: 'Face detection', hint: 'Detector model, input size, search angles and confidence' },
	face_aligner: { title: 'Landmark alignment', hint: 'Model used to fit the 5-point face landmarks' },
	face_selector: { title: 'Face selection', hint: 'Which detected faces of the target get processed' },
	face_tracker: { title: 'Face tracking', hint: 'Tracking confidence used to keep an identity across frames' },
	face_masker: { title: 'Masks & occluders', hint: 'Occluder and parser models, plus the mask shape and blend' },
	voice_extractor: { title: 'Voice source', hint: 'Audio model that supplies the voice for lip syncing' },
	frame_extraction: { title: 'Frames in & out', hint: 'Trim range, intermediate frame format and pixel format' },
	frame_distribution: { title: 'Frame distribution', hint: 'How frames are spread across workers' },
	output_creation: { title: 'Output encoding', hint: 'Encoder, quality, scale, volume and frame rate' },
	download: { title: 'Downloads', hint: 'Where model files come from' },
	benchmark: { title: 'Benchmark', hint: 'Used by the benchmark command' },
	age_modifier: { title: 'Age modifier', hint: 'Perceived-age model and direction' },
	background_remover: { title: 'Background remover', hint: 'Matting model, fill and despill colours' },
	deep_swapper: { title: 'Deep swapper', hint: 'Pre-trained identity models and morph strength' },
	expression_restorer: { title: 'Expression restorer', hint: 'Restores the original expression after a swap' },
	face_debugger: { title: 'Face debugger', hint: 'Draws landmarks, boxes and masks — useful for tuning' },
	face_editor: { title: 'Face editor', hint: 'Drives brows, eyes, mouth and head pose' },
	face_enhancer: { title: 'Face enhancer', hint: 'Restores detail in the swapped face' },
	face_swapper: { title: 'Face swapper', hint: 'Identity model, pixel boost and embedding weight' },
	frame_colorizer: { title: 'Frame colouriser', hint: 'Colourises monochrome frames' },
	frame_enhancer: { title: 'Frame enhancer', hint: 'Upscales and restores whole frames' },
	lip_syncer: { title: 'Lip syncer', hint: 'Drives the mouth from the voice track' },
	misc: { title: 'Engine', hint: 'Server-wide options' }
};

const groupTitle = (group: string) => GROUP_LABELS[group]?.title ?? humanizeKey(group);
const groupHint = (group: string) => GROUP_LABELS[group]?.hint ?? '';

const GroupSection = ({
	group,
	names,
	open,
	onToggle
}: {
	group: string;
	names: string[];
	open: boolean;
	onToggle: () => void;
}) => (
	<section className="border-b border-line last:border-b-0">
		<button
			type="button"
			onClick={onToggle}
			aria-expanded={open}
			className="flex w-full items-center gap-2.5 px-4 py-3 text-left transition hover:bg-white/[0.04]"
		>
			<ChevronRight
				className={`h-4 w-4 shrink-0 text-ink-faint transition-transform duration-200 ${open ? 'rotate-90' : ''}`}
			/>
			<span className="flex-1 truncate text-sm font-semibold tracking-tight text-ink">{groupTitle(group)}</span>
			<Badge tone={open ? 'accent' : 'neutral'}>{names.length}</Badge>
		</button>
		{open ? (
			<div className="animate-in-up flex flex-col gap-4 px-4 pb-4">
				{groupHint(group) ? (
					<p className="-mt-1 text-xs leading-relaxed text-ink-faint">{groupHint(group)}</p>
				) : null}
				<div className="flex flex-col gap-4">
					{names.map((name) => (
						<ControlSlot key={name} name={name} />
					))}
				</div>
				<p className="font-mono text-sm text-ink-faint/70">group: {group}</p>
			</div>
		) : null}
	</section>
);

const ControlSlot = ({ name }: { name: string }) => {
	const capability = useStudio((state): Capability | undefined => {
		const arguments_ = state.capabilities?.arguments;

		if (!arguments_) {
			return undefined;
		}

		for (const group of Object.values(arguments_)) {
			if (group[name]) {
				return group[name];
			}
		}

		return undefined;
	});
	const value = useStudio((state) => (state.state ? (state.state[name] as unknown) : undefined));
	const patchState = useStudio((state) => state.patchState);

	if (!capability) {
		return null;
	}

	return (
		<CapabilityControl
			name={name}
			capability={capability}
			value={value}
			onChange={(next) => void patchState({ [name]: next })}
		/>
	);
};

export const Inspector = () => {
	const capabilities = useStudio((state) => state.capabilities);
	const state = useStudio((state) => state.state);
	const jobBusy = useStudio((state) => state.jobBusy);
	const [open, setOpen] = useState<Record<string, boolean>>({ processors: true, workflow: true });
	const [filter, setFilter] = useState('');

	const groups = useMemo(() => {
		if (!capabilities) {
			return [];
		}

		return Object.entries(capabilities.arguments)
			.map(([group, entries]) => ({
				group,
				names: Object.keys(entries).filter((name) =>
					filter ? `${name} ${groupTitle(group)}`.toLowerCase().includes(filter.toLowerCase()) : true
				)
			}))
			.filter((entry) => entry.names.length)
			.sort((a, b) => {
				if (a.group === 'processors') return -1;
				if (b.group === 'processors') return 1;
				return groupTitle(a.group).localeCompare(groupTitle(b.group));
			});
	}, [capabilities, filter]);

	if (!capabilities || !state) {
		return (
			<div className="flex h-full items-center justify-center gap-2 p-6 text-sm text-ink-faint">
				<Spinner /> Reading server capabilities…
			</div>
		);
	}

	const total = Object.values(capabilities.arguments).reduce((count, entries) => count + Object.keys(entries).length, 0);

	return (
		<div className="flex h-full flex-col">
			<PanelHeader
				title={
					<span className="flex items-center gap-2">
						<SlidersHorizontal className="h-4 w-4 text-apple" /> Engine inspector
					</span>
				}
				subtitle={`${total} options generated from GET /capabilities`}
			/>
			<div className="px-4 pt-3">
				<input
					value={filter}
					onChange={(event) => setFilter(event.target.value)}
					placeholder="Filter options…"
					className="h-10 w-full rounded-[10px] border border-white/12 bg-white/[0.05] px-3 text-sm text-ink placeholder:text-ink-faint focus:border-apple/60 focus:outline-none"
				/>
			</div>
			<div className="mt-3 min-h-0 flex-1 overflow-y-auto scroll-thin">
				{groups.length ? (
					groups.map(({ group, names }) => (
						<GroupSection
							key={group}
							group={group}
							names={names}
							open={Boolean(open[group])}
							onToggle={() => setOpen((current) => ({ ...current, [group]: !current[group] }))}
						/>
					))
				) : (
					<p className="px-4 py-6 text-center text-sm text-ink-faint">No option matches “{filter}”.</p>
				)}
			</div>
			<footer className="flex items-center justify-between border-t border-line px-4 py-2.5">
				<Eyebrow className="flex items-center gap-1.5 normal-case">
					<Cpu className="h-3.5 w-3.5" /> {String(state.execution_providers ?? '—')}
				</Eyebrow>
				<span className="flex items-center gap-1.5 text-xs text-ink-faint">
					<Dot tone={jobBusy ? 'accent' : 'neutral'} pulse={jobBusy} />
					{jobBusy ? 'job running' : 'idle'}
				</span>
			</footer>
		</div>
	);
};

export const RenderSummary = () => {
	const state = useStudio((store) => store.state);
	const processors = Array.isArray(state?.processors) ? (state.processors as string[]) : [];

	return (
		<div className="card flex items-center gap-2 px-3 py-2.5">
			<Sparkles className="h-4 w-4 text-apple" />
			<span className="truncate text-sm text-ink-soft">
				{processors.length ? processors.join(' → ') : 'no processor selected'}
			</span>
		</div>
	);
};