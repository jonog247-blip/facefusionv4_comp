import { useState } from 'react';
import { PlugZap, RefreshCw, Server, TriangleAlert } from 'lucide-react';
import { useStudio } from '../../store/studio';
import { loadConfig, saveConfig } from '../../api/config';
import { Badge, Button, Dot, TextField } from '../ui/primitives';

/**
 * The studio falls back to its demo backend when no server answers, which is
 * the right default for a preview but the wrong thing to sit on silently when
 * someone means to work against a real engine. This banner is the way out:
 * edit the endpoint, reconnect, see the real capabilities.
 */
export const ConnectionBanner = () => {
	const mode = useStudio((state) => state.mode);
	const phase = useStudio((state) => state.phase);
	const statusDetail = useStudio((state) => state.statusDetail);
	const reconnect = useStudio((state) => state.reconnect);
	const [open, setOpen] = useState(false);
	const [draft, setDraft] = useState(loadConfig().apiBase);
	const [busy, setBusy] = useState(false);

	if (mode === 'live' && phase === 'live') {
		return null;
	}

	const retry = async (base?: string) => {
		setBusy(true);

		if (base) {
			saveConfig({ apiBase: base });
		}

		await reconnect(base);
		setBusy(false);
		setOpen(false);
	};

	return (
		<div className="card animate-in-up flex flex-col gap-3 border-warning/25 bg-warning/[0.07] p-4">
			<div className="flex flex-wrap items-center gap-3">
				<span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-warning/15 text-warning">
					<TriangleAlert className="h-4 w-4" />
				</span>
				<div className="min-w-0 flex-1">
					<p className="text-sm font-semibold text-ink">
						Running on the built-in demo backend — no FaceFusion engine is answering
					</p>
					<p className="truncate text-xs text-ink-faint">
						{statusDetail || `Nothing replied on ${loadConfig().apiBase}`}. Every panel is usable, but frames are
						simulated until the real API answers.
					</p>
				</div>
				<Badge tone="warning">
					<Dot tone="warning" pulse /> demo
				</Badge>
			</div>

			{open ? (
				<div className="flex flex-wrap items-end gap-2">
					<label className="flex min-w-[260px] flex-1 flex-col gap-1.5">
						<span className="flex items-center gap-1.5 text-xs text-ink-soft">
							<Server className="h-3.5 w-3.5" /> FaceFusion API endpoint
						</span>
						<TextField
							value={draft}
							spellCheck={false}
							onChange={(event) => setDraft(event.target.value)}
							placeholder="http://127.0.0.1:8000"
						/>
					</label>
					<Button variant="primary" icon={<PlugZap className="h-4 w-4" />} disabled={busy} onClick={() => void retry(draft)}>
						{busy ? 'Connecting…' : 'Connect'}
					</Button>
					<Button variant="ghost" onClick={() => setOpen(false)}>
						Cancel
					</Button>
				</div>
			) : (
				<div className="flex flex-wrap gap-2">
					<Button variant="primary" icon={<PlugZap className="h-4 w-4" />} onClick={() => setOpen(true)}>
						Connect to a FaceFusion server
					</Button>
					<Button
						variant="secondary"
						icon={<RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} />}
						disabled={busy}
						onClick={() => void retry()}
					>
						Retry now
					</Button>
				</div>
			)}
		</div>
	);
};