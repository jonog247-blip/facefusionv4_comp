import { useState } from 'react';
import { History, X } from 'lucide-react';
import { useStudio } from '../../store/studio';
import { Badge, IconButton, Panel, PanelHeader } from '../ui/primitives';

const toneFor = (level: string) =>
	level === 'error' ? 'danger' : level === 'warn' ? 'warning' : level === 'success' ? 'success' : 'neutral';

export const ActivityLog = () => {
	const log = useStudio((state) => state.log);
	const dismissLog = useStudio((state) => state.dismissLog);
	const [open, setOpen] = useState(false);

	const latest = log[0];

	return (
		<Panel className="overflow-hidden">
			<PanelHeader
				title={
					<span className="flex items-center gap-2">
						<History className="h-3.5 w-3.5 text-apple" /> Activity
					</span>
				}
				action={
					<div className="flex items-center gap-2">
						{latest ? (
							<span className="flex items-center gap-1.5 text-sm text-ink-faint">
								<Badge tone={toneFor(latest.level) as 'neutral' | 'success' | 'warning' | 'danger'}>
									{latest.level}
								</Badge>
								<span className="hidden max-w-[42ch] truncate sm:inline">{latest.message}</span>
							</span>
						) : null}
						<IconButton label={open ? 'Hide log' : 'Show log'} active={open} onClick={() => setOpen((value) => !value)}>
							<X className={open ? 'h-3.5 w-3.5' : 'h-3.5 w-3.5 rotate-45'} />
						</IconButton>
					</div>
				}
			/>
			{open ? (
				<ul className="max-h-56 overflow-y-auto scroll-thin p-2.5">
					{log.length ? (
						log.map((entry) => (
							<li key={entry.id} className="flex items-start gap-2 border-b border-white/5 py-1.5 last:border-0">
								<Badge tone={toneFor(entry.level) as 'neutral' | 'success' | 'warning' | 'danger'}>{entry.level}</Badge>
								<span className="flex-1 text-sm leading-relaxed text-ink-soft">{entry.message}</span>
								<button
									type="button"
									aria-label="Dismiss"
									onClick={() => dismissLog(entry.id)}
									className="shrink-0 rounded p-0.5 text-ink-faint transition hover:text-ink"
								>
									<X className="h-3 w-3" />
								</button>
								<span className="tabular shrink-0 font-mono text-sm text-ink-faint">
									{new Date(entry.at).toLocaleTimeString()}
								</span>
							</li>
						))
					) : (
						<li className="py-2 text-center text-sm text-ink-faint">Nothing yet.</li>
					)}
				</ul>
			) : null}
		</Panel>
	);
};
