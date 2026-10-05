import { useEffect, useState } from 'react';
import { Layers3, Sliders, Sparkles, X } from 'lucide-react';
import { TopBar } from './TopBar';
import { AssetRail } from '../assets/AssetRail';
import { MultiAngleBuilder } from '../builder/MultiAngleBuilder';
import { Inspector } from '../inspector/Inspector';
import { JobsPanel } from '../jobs/JobsPanel';
import { MetricsPanel } from '../system/MetricsPanel';
import { SplitCompare } from '../stage/SplitCompare';
import { StreamDock } from '../stage/StreamDock';
import { ActivityLog } from '../activity/ActivityLog';
import { IconButton } from '../ui/primitives';
import { useMediaQuery } from '../../hooks/useMediaQuery';

const DrawerHeader = ({ title, onClose }: { title: string; onClose: () => void }) => (
	<div className="flex items-center justify-between border-b border-line px-3.5 py-2.5">
		<h2 className="text-[13px] font-semibold tracking-tight text-ink">{title}</h2>
		<IconButton label="Close" onClick={onClose}>
			<X className="h-4 w-4" />
		</IconButton>
	</div>
);

const AnglePanel = () => (
	<div className="p-3">
		<MultiAngleBuilder />
	</div>
);

export const Shell = () => {
	const isDesktop = useMediaQuery('(min-width: 1024px)');
	const isUltrawide = useMediaQuery('(min-width: 1920px)');
	const [trayOpen, setTrayOpen] = useState(false);
	const [inspectorOpen, setInspectorOpen] = useState(false);

	useEffect(() => {
		if (isDesktop) {
			setTrayOpen(false);
			setInspectorOpen(false);
		}
	}, [isDesktop]);

	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				setTrayOpen(false);
				setInspectorOpen(false);
			}
		};

		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, []);

	const overlay = !isDesktop && (trayOpen || inspectorOpen);

	return (
		<div className="flex h-dvh w-screen flex-col overflow-hidden bg-app text-ink">
			<TopBar
				trayOpen={trayOpen}
				inspectorOpen={inspectorOpen}
				onToggleTray={() => setTrayOpen((value) => !value)}
				onToggleInspector={() => setInspectorOpen((value) => !value)}
			/>

			<div className="relative flex min-h-0 flex-1">
				{/* Asset rail — pinned from 1024px, overlay drawer below that. */}
				<aside
					className={[
						'glass z-20 flex h-full shrink-0 flex-col overflow-hidden transition-[transform,opacity] duration-300 ease-[var(--ease-spring)]',
						isDesktop
							? 'relative w-72 border-r border-line min-[1440px]:w-80 min-[1920px]:w-96'
							: 'absolute inset-y-0 left-0 w-[86vw] max-w-sm border-r border-line',
						!isDesktop && !trayOpen ? '-translate-x-full opacity-0' : 'translate-x-0 opacity-100'
					].join(' ')}
				>
					{!isDesktop ? <DrawerHeader title="Assets" onClose={() => setTrayOpen(false)} /> : null}
					<div className="min-h-0 flex-1 overflow-y-auto scroll-thin">
						<AssetRail />
						<AnglePanel />
					</div>
				</aside>

				{/* Stage */}
				<main className="flex min-w-0 flex-1 flex-col gap-3 overflow-y-auto scroll-thin p-3 min-[1440px]:p-4">
					<section className="min-h-[280px] flex-1 rounded-2xl border border-white/8 bg-black/25 p-1">
						<SplitCompare />
					</section>
					<StreamDock />
					<div className={isUltrawide ? 'grid grid-cols-2 gap-3' : 'flex flex-col gap-3'}>
						<JobsPanel />
						<MetricsPanel />
					</div>
					<ActivityLog />
				</main>

				{/* Inspector — pinned from 1024px, overlay drawer below that. */}
				<aside
					className={[
						'glass z-20 flex h-full shrink-0 flex-col overflow-hidden transition-[transform,opacity] duration-300 ease-[var(--ease-spring)]',
						isDesktop
							? 'relative w-80 border-l border-line min-[1440px]:w-88 min-[1920px]:w-96'
							: 'absolute inset-y-0 right-0 w-[90vw] max-w-md border-l border-line',
						!isDesktop && !inspectorOpen ? 'translate-x-full opacity-0' : 'translate-x-0 opacity-100'
					].join(' ')}
				>
					{!isDesktop ? <DrawerHeader title="Inspector" onClose={() => setInspectorOpen(false)} /> : null}
					<div className="min-h-0 flex-1 overflow-y-auto scroll-thin">
						<Inspector />
					</div>
				</aside>

				{overlay ? (
					<button
						type="button"
						aria-label="Close panel"
						className="absolute inset-0 z-10 bg-black/50 backdrop-blur-[2px]"
						onClick={() => {
							setTrayOpen(false);
							setInspectorOpen(false);
						}}
					/>
				) : null}
			</div>

			{!isDesktop ? (
				<div className="glass z-30 flex items-center justify-center gap-2 border-t border-line px-3 py-2">
					<button
						type="button"
						onClick={() => {
							setTrayOpen((value) => !value);
							setInspectorOpen(false);
						}}
						className={`flex h-9 flex-1 items-center justify-center gap-2 rounded-xl text-[11px] font-medium transition ${
							trayOpen ? 'bg-apple text-white' : 'bg-white/[0.06] text-ink-soft'
						}`}
					>
						<Layers3 className="h-3.5 w-3.5" /> Assets & angles
					</button>
					<button
						type="button"
						onClick={() => {
							setInspectorOpen((value) => !value);
							setTrayOpen(false);
						}}
						className={`flex h-9 flex-1 items-center justify-center gap-2 rounded-xl text-[11px] font-medium transition ${
							inspectorOpen ? 'bg-apple text-white' : 'bg-white/[0.06] text-ink-soft'
						}`}
					>
						<Sliders className="h-3.5 w-3.5" /> Inspector
					</button>
				</div>
			) : null}
		</div>
	);
};

export const BootScreen = ({ message }: { message: string }) => (
	<div className="grid h-dvh w-screen place-items-center bg-app text-ink">
		<div className="flex flex-col items-center gap-3">
			<div className="relative h-12 w-12">
				<span className="absolute inset-0 animate-pulse-soft rounded-2xl bg-apple/25" />
				<span className="relative grid h-12 w-12 place-items-center rounded-2xl border border-apple/30 bg-apple/15 text-apple">
					<Sparkles className="h-5 w-5" />
				</span>
			</div>
			<p className="text-sm font-medium tracking-tight">FaceFusion Studio</p>
			<p className="text-[11px] text-ink-faint">{message}</p>
		</div>
	</div>
);
