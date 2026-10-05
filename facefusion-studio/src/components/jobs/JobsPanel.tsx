import { useEffect } from 'react';
import { CircleCheck, CircleDashed, CircleX, Loader2, Play, RefreshCw, Trash2, Workflow } from 'lucide-react';
import { useStudio } from '../../store/studio';
import { describeJobStatus } from '../../api/config';
import type { StepStatus } from '../../api/types';
import { Badge, Button, EmptyState, Eyebrow, IconButton, Panel, PanelHeader } from '../ui/primitives';

const StepIcon = ({ status }: { status: StepStatus }) => {
	if (status === 'completed') return <CircleCheck className="h-3.5 w-3.5 text-success" />;
	if (status === 'failed') return <CircleX className="h-3.5 w-3.5 text-danger" />;
	if (status === 'started') return <Loader2 className="h-3.5 w-3.5 animate-spin text-apple" />;
	return <CircleDashed className="h-3.5 w-3.5 text-ink-faint" />;
};

const JobCard = ({ jobId }: { jobId: string }) => {
	const detail = useStudio((state) => state.jobDetails[jobId]);
	const activeJobId = useStudio((state) => state.activeJobId);
	const setActiveJob = useStudio((state) => state.setActiveJob);
	const retryJob = useStudio((state) => state.retryJob);
	const deleteJob = useStudio((state) => state.deleteJob);

	const active = activeJobId === jobId;
	const failed = detail?.steps.some((step) => step.status === 'failed');
	const done = detail?.steps.filter((step) => step.status === 'completed').length ?? 0;
	const total = detail?.steps.length ?? 0;
	const running = detail?.steps.some((step) => step.status === 'started' || step.status === 'queued');

	return (
		<li className={`rounded-xl border p-2.5 ${active ? 'border-apple/40 bg-apple/[0.07]' : 'border-white/8 bg-white/[0.03]'}`}>
			<div className="flex items-center justify-between gap-2">
				<button type="button" className="truncate font-mono text-[11px] text-ink" onClick={() => setActiveJob(active ? null : jobId)}>
					{jobId}
				</button>
				<div className="flex items-center gap-1">
					{running ? <Badge tone="accent">running</Badge> : null}
					{failed ? <Badge tone="danger">failed</Badge> : null}
					{done === total && total > 0 ? <Badge tone="success">done</Badge> : null}
					<IconButton label="Retry job" className="h-6 w-6" onClick={() => void retryJob(jobId)}>
						<RefreshCw className="h-3 w-3" />
					</IconButton>
					<IconButton label="Delete job" tone="danger" className="h-6 w-6" onClick={() => void deleteJob(jobId)}>
						<Trash2 className="h-3 w-3" />
					</IconButton>
				</div>
			</div>

			{active && detail ? (
				<ul className="mt-2 flex flex-col gap-1">
					{detail.steps.map((step, index) => (
						<li key={`${jobId}-${index}`} className="flex items-center gap-2 text-[11px] text-ink-soft">
							<StepIcon status={step.status} />
							<span className="flex-1 truncate capitalize">{step.args.processors.join(' → ') || 'step'}</span>
							<span className="text-[10px] text-ink-faint">{describeJobStatus(step.status)}</span>
						</li>
					))}
				</ul>
			) : (
				<p className="tabular mt-1 font-mono text-[10px] text-ink-faint">
					{total ? `${done}/${total} steps` : 'no steps'}
				</p>
			)}
		</li>
	);
};

export const JobsPanel = () => {
	const jobs = useStudio((state) => state.jobs);
	const jobBusy = useStudio((state) => state.jobBusy);
	const state = useStudio((store) => store.state);
	const selectedSourceIds = useStudio((state) => state.selectedSourceIds);
	const selectedTargetId = useStudio((state) => state.selectedTargetId);
	const runJob = useStudio((state) => state.runJob);
	const refreshJobs = useStudio((state) => state.refreshJobs);

	useEffect(() => {
		void refreshJobs();
	}, [refreshJobs]);

	const jobIds = Object.keys(jobs).sort((a, b) => (jobs[b].date_updated > jobs[a].date_updated ? 1 : -1));
	const processors = Array.isArray(state?.processors) ? (state.processors as string[]) : [];
	const ready = Boolean(selectedSourceIds.length && selectedTargetId && processors.length);

	const render = () => {
		if (!state) {
			return;
		}
		void runJob([{ ...state, processors }]);
	};

	return (
		<Panel>
			<PanelHeader
				title={
					<span className="flex items-center gap-2">
						<Workflow className="h-3.5 w-3.5 text-apple" /> Jobs
					</span>
				}
				action={
					<Button
						size="sm"
						variant="primary"
						icon={jobBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
						disabled={!ready || jobBusy}
						onClick={render}
						title={ready ? 'Create, submit and run a job' : 'Select a source, a target and a processor first'}
					>
						Render
					</Button>
				}
			/>

			<div className="p-2.5">
				{!ready ? (
					<Eyebrow className="mb-2 normal-case tracking-normal">
						{!processors.length
							? 'Enable at least one processor in the inspector.'
							: !selectedSourceIds.length
								? 'Select a source asset.'
								: 'Select a target asset.'}
					</Eyebrow>
				) : null}

				{jobIds.length ? (
					<ul className="flex flex-col gap-1.5">
						{jobIds.map((jobId) => (
							<JobCard key={jobId} jobId={jobId} />
						))}
					</ul>
				) : (
					<EmptyState
						icon={<Workflow className="h-5 w-5" />}
						title="No jobs in this session"
						detail="Render sends the current state as a single step, then submits and runs it."
					/>
				)}
			</div>
		</Panel>
	);
};
