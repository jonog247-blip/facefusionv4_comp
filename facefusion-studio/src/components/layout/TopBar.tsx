import { useEffect, useState } from 'react';
import { Activity, Cloud, CloudOff, Database, FlaskConical, Layers3, Settings2, Sliders, Sparkles } from 'lucide-react';
import { useStudio } from '../../store/studio';
import { loadConfig } from '../../api/config';
import { Badge, Button, Dot, IconButton, Meter } from '../ui/primitives';

const useTicker = (intervalMs = 1000) => {
	const [, setTick] = useState(0);

	useEffect(() => {
		const timer = setInterval(() => setTick((value) => value + 1), intervalMs);
		return () => clearInterval(timer);
	}, [intervalMs]);
};

const SessionClock = () => {
	useTicker();
	const expiresAt = useStudio((state) => state.sessionExpiresAt);
	const remaining = Math.max(0, Math.round((expiresAt - Date.now()) / 1000));
	const ratio = expiresAt ? remaining / 600 : 0;

	return (
		<div className="flex items-center gap-2 rounded-full border border-white/8 bg-white/[0.04] px-2.5 py-1">
			<Dot tone={ratio > 0.3 ? 'success' : ratio > 0.1 ? 'warning' : 'danger'} pulse={ratio < 0.1} />
			<span className="tabular font-mono text-sm text-ink-soft">
				{Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}
			</span>
			<div className="w-8">
				<Meter value={ratio} tone={ratio > 0.3 ? 'success' : ratio > 0.1 ? 'warning' : 'danger'} />
			</div>
		</div>
	);
};

const ConnectionPill = () => {
	const phase = useStudio((state) => state.phase);
	const mode = useStudio((state) => state.mode);
	const serverName = useStudio((state) => state.serverName);
	const serverVersion = useStudio((state) => state.serverVersion);
	const statusDetail = useStudio((state) => state.statusDetail);

	const tone =
		phase === 'live' ? 'success' : phase === 'demo' ? 'accent' : phase === 'probing' ? 'warning' : 'danger';
	const icon =
		phase === 'live' ? <Cloud className="h-3 w-3" /> : phase === 'demo' ? <FlaskConical className="h-3 w-3" /> : <CloudOff className="h-3 w-3" />;

	return (
		<div className="flex min-w-0 items-center gap-2" title={statusDetail || undefined}>
			<Badge tone={tone}>
				{icon}
				{mode === 'demo' ? 'demo backend' : `${serverName}${serverVersion ? ` ${serverVersion}` : ''}`}
			</Badge>
			{phase === 'offline' || phase === 'rate-limited' ? (
				<Badge tone="danger">{statusDetail || phase}</Badge>
			) : null}
		</div>
	);
};

export const TopBar = ({
	onToggleTray,
	onToggleInspector,
	trayOpen,
	inspectorOpen
}: {
	onToggleTray: () => void;
	onToggleInspector: () => void;
	trayOpen: boolean;
	inspectorOpen: boolean;
}) => {
	const mode = useStudio((state) => state.mode);
	const [settingsOpen, setSettingsOpen] = useState(false);
	const [draft, setDraft] = useState(loadConfig().apiBase);

	return (
		<header className="glass z-30 flex h-12 shrink-0 items-center justify-between gap-3 px-3">
			<div className="flex min-w-0 items-center gap-2.5">
				<span className="flex items-center gap-2 text-sm font-semibold tracking-tight">
					<span className="grid h-6 w-6 place-items-center rounded-lg bg-apple/15 text-apple">
						<Sparkles className="h-3.5 w-3.5" />
					</span>
					<span className="hidden sm:inline">FaceFusion Studio</span>
				</span>
				<Badge tone="neutral" className="hidden md:inline-flex">
					v4
				</Badge>
				{mode === 'demo' ? (
					<Badge tone="warning" className="hidden lg:inline-flex">
						no backend detected
					</Badge>
				) : null}
			</div>

			<div className="flex shrink-0 items-center gap-2">
				<div className="hidden md:block">
					<ConnectionPill />
				</div>
				<SessionClock />
				<IconButton label="Assets" active={trayOpen} className="lg:hidden" onClick={onToggleTray}>
					<Layers3 className="h-4 w-4" />
				</IconButton>
				<IconButton label="Inspector" active={inspectorOpen} className="lg:hidden" onClick={onToggleInspector}>
					<Sliders className="h-4 w-4" />
				</IconButton>
				<IconButton label="Server settings" active={settingsOpen} onClick={() => setSettingsOpen((value) => !value)}>
					<Settings2 className="h-4 w-4" />
				</IconButton>
			</div>

			{settingsOpen ? (
				<div className="glass-elevated animate-in-up absolute right-3 top-13 z-40 w-[300px] rounded-2xl p-3 shadow-2xl">
					<p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-ink">
						<Database className="h-3.5 w-3.5 text-apple" /> API endpoint
					</p>
					<input
						value={draft}
						onChange={(event) => setDraft(event.target.value)}
						spellCheck={false}
						className="h-8 w-full rounded-lg border border-white/10 bg-white/[0.04] px-2.5 font-mono text-sm text-ink focus:border-apple/60 focus:outline-none"
					/>
					<p className="mt-1.5 text-sm leading-relaxed text-ink-faint">
						Defaults to <span className="font-mono">--api-host</span> / <span className="font-mono">--api-port</span> of
						the running <span className="font-mono">facefusion.py api</span> process.
					</p>
					<div className="mt-2.5 flex items-center gap-2">
						<Button
							size="sm"
							variant="primary"
							icon={<Activity className="h-3 w-3" />}
							onClick={() => {
								setSettingsOpen(false);
								void useStudio.getState().reconnect(draft);
							}}
						>
							Reconnect
						</Button>
						<Button size="sm" variant="ghost" onClick={() => setSettingsOpen(false)}>
							Cancel
						</Button>
					</div>
				</div>
			) : null}
		</header>
	);
};
