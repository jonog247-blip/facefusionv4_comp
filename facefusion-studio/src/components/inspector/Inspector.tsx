import { useMemo, useState } from 'react';
import { ChevronRight, Cpu, SlidersHorizontal, Sparkles } from 'lucide-react';
import { useStudio } from '../../store/studio';
import { humanizeKey } from '../../api/config';
import { CapabilityControl } from './controls';
import { Badge, Dot, Eyebrow, Panel, PanelHeader, Spinner } from '../ui/primitives';

const GROUP_HINTS: Record<string, string> = {
	workflow: 'How the engine chains the processors',
	processors: 'Enabled processors, applied in order',
	face_detector: 'Detection model, size, angles and confidence',
	face_aligner: 'Landmark alignment model',
	face_selector: 'Which faces in the target get processed',
	face_tracker: 'Tracking confidence across frames',
	face_masker: 'Occluders, parsers and mask regions',
	voice_extractor: 'Audio source for lip syncing',
	frame_extraction: 'Trim range and intermediate format',
	frame_distribution: 'How frames are spread over workers',
	output_creation: 'Encoder, quality, scale and fps'
};

const GroupSection = ({ group, entries, open, onToggle }: { group: string; entries: [string, unknown][]; open: boolean; onToggle: () => void }) => (
	<section className="border-b border-line last:border-b-0">
		<button
			type="button"
			onClick={onToggle}
			className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left transition hover:bg-white/[0.03]"
		>
			<ChevronRight
				className={`h-3.5 w-3.5 shrink-0 text-ink-faint transition-transform duration-200 ${open ? 'rotate-90' : ''}`}
			/>
			<span className="flex-1 truncate text-[12px] font-semibold capitalize tracking-tight text-ink">
				{group.replace(/_/g, ' ')}
			</span>
			<Badge tone="neutral">{entries.length}</Badge>
		</button>
		{open ? (
			<div className="animate-in-up flex flex-col gap-3 px-3.5 pb-3.5">
				{GROUP_HINTS[group] ? <p className="-mt-1 text-[10px] text-ink-faint">{GROUP_HINTS[group]}</p> : null}
				<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
					{entries.map(([name]) => (
						<ControlSlot key={name} name={name} />
					))}
				</div>
			</div>
		) : null}
	</section>
);

const ControlSlot = ({ name }: { name: string }) => {
	const capability = useStudio((state) => {
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
				entries: Object.keys(entries).filter((name) =>
					filter ? humanizeKey(name).includes(filter.toLowerCase()) : true
				)
			}))
			.filter((entry) => entry.entries.length)
			.sort((a, b) => {
				if (a.group === 'processors') return -1;
				if (b.group === 'processors') return 1;
				return a.group.localeCompare(b.group);
			});
	}, [capabilities, filter]);

	if (!capabilities || !state) {
		return (
			<div className="flex h-full items-center justify-center gap-2 p-6 text-xs text-ink-faint">
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
						<SlidersHorizontal className="h-3.5 w-3.5 text-apple" /> Engine inspector
					</span>
				}
				subtitle={`${total} options generated from GET /capabilities`}
			/>
			<input
				value={filter}
				onChange={(event) => setFilter(event.target.value)}
				placeholder="Filter options…"
				className="mx-3.5 mt-3 h-8 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 text-[11px] text-ink placeholder:text-ink-faint focus:border-apple/60 focus:outline-none"
			/>
			<div className="mt-3 min-h-0 flex-1 overflow-y-auto scroll-thin">
				{groups.length ? (
					groups.map(({ group, entries }) => (
						<GroupSection
							key={group}
							group={group}
							entries={entries.map((name) => [name, state[name] as unknown])}
							open={Boolean(open[group])}
							onToggle={() => setOpen((current) => ({ ...current, [group]: !current[group] }))}
						/>
					))
				) : (
					<p className="px-4 py-6 text-center text-[11px] text-ink-faint">No option matches “{filter}”.</p>
				)}
			</div>
			<footer className="flex items-center justify-between border-t border-line px-3.5 py-2">
				<Eyebrow className="flex items-center gap-1.5">
					<Cpu className="h-3 w-3" /> {String(state.execution_providers ?? '—')}
				</Eyebrow>
				<span className="flex items-center gap-1.5 text-[10px] text-ink-faint">
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
		<Panel className="flex items-center gap-2 px-3 py-2">
			<Sparkles className="h-3.5 w-3.5 text-apple" />
			<span className="truncate text-[11px] text-ink-soft">
				{processors.length ? processors.join(' → ') : 'no processor selected'}
			</span>
		</Panel>
	);
};
