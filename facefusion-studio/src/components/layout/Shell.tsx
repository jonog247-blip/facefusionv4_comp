import { useEffect, useState } from 'react';
import { Boxes, Layers3, Rotate3D, Sliders, Sparkles, X } from 'lucide-react';
import { TopBar } from './TopBar';
import { AssetRail } from '../assets/AssetRail';
import { MultiAngleBuilder } from '../builder/MultiAngleBuilder';
import { Inspector } from '../inspector/Inspector';
import { JobsPanel } from '../jobs/JobsPanel';
import { MetricsPanel } from '../system/MetricsPanel';
import { SplitCompare } from '../stage/SplitCompare';
import { StreamDock } from '../stage/StreamDock';
import { FrameTransport } from '../stage/FrameTransport';
import { ConnectionBanner } from '../stage/ConnectionBanner';
import { ActivityLog } from '../activity/ActivityLog';
import { cx } from '../ui/primitives';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { useStudio } from '../../store/studio';

/** Counts for the rail tabs, without subscribing the shell to the whole store. */
const useStudioCount = (key: 'assets' | 'angles') =>
	useStudio((state) => (key === 'assets' ? state.assets.length : state.angles.length));

type RailTab = 'assets' | 'faces';

const RailTabs = ({ tab, onChange, counts }: { tab: RailTab; onChange: (tab: RailTab) => void; counts: { assets: number; faces: number } }) => (
	<div className="glass sticky top-0 z-20 flex gap-1.5 border-b border-line p-2.5 backdrop-blur-xl">
		{(
			[
				{ id: 'assets', label: 'Sources', icon: Layers3, count: counts.assets },
				{ id: 'faces', label: '3D Face Sources', icon: Rotate3D, count: counts.faces }
			] as const
		).map((item) => (
			<button
				key={item.id}
				type="button"
				onClick={() => onChange(item.id)}
				aria-pressed={tab === item.id}
				className={cx(
					'flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition',
					tab === item.id
						? 'bg-apple text-white shadow-[0_8px_24px_-12px_rgba(10,132,255,0.9)]'
						: 'bg-white/[0.05] text-ink-soft hover:bg-white/[0.1] hover:text-ink'
				)}
			>
				<item.icon className="h-4 w-4" />
				<span className="truncate">{item.label}</span>
				<span
					className={cx(
						'tabular rounded-full px-1.5 py-0.5 text-sm font-bold',
						tab === item.id ? 'bg-white/25 text-white' : 'bg-white/10 text-ink-faint'
					)}
				>
					{counts[item.id]}
				</span>
			</button>
		))}
	</div>
);

const DrawerHeader = ({ title, onClose }: { title: string; onClose: () => void }) => (
	<div className="flex items-center justify-between border-b border-line px-4 py-3">
		<h2 className="text-sm font-semibold tracking-tight text-ink">{title}</h2>
		<button
			type="button"
			aria-label="Close"
			onClick={onClose}
			className="grid h-9 w-9 place-items-center rounded-[11px] text-ink-soft transition hover:bg-white/10 hover:text-ink"
		>
			<X className="h-4 w-4" />
		</button>
	</div>
);

export const Shell = () => {
	const isDesktop = useMediaQuery('(min-width: 1024px)');
	const isUltrawide = useMediaQuery('(min-width: 1920px)');
	const [trayOpen, setTrayOpen] = useState(false);
	const [inspectorOpen, setInspectorOpen] = useState(false);
	const [tab, setTab] = useState<RailTab>('assets');

	const angles = useStudioCount('angles');
	const assets = useStudioCount('assets');

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
				{/* Left rail — pinned from 1024px, overlay drawer below. */}
				<aside
					className={cx(
						'glass z-20 flex h-full shrink-0 flex-col overflow-hidden transition-[transform,opacity] duration-300 ease-[var(--ease-spring)]',
						isDesktop
							? 'relative w-80 border-r border-line min-[1440px]:w-[344px] min-[1920px]:w-[380px]'
							: 'absolute inset-y-0 left-0 w-[92vw] max-w-md border-r border-line',
						!isDesktop && !trayOpen ? '-translate-x-full opacity-0' : 'translate-x-0 opacity-100'
					)}
				>
					{!isDesktop ? (
						<DrawerHeader title={tab === 'faces' ? '3D Face Sources' : 'Sources'} onClose={() => setTrayOpen(false)} />
					) : null}
					<RailTabs tab={tab} onChange={setTab} counts={{ assets, faces: angles }} />
					<div className="min-h-0 flex-1 overflow-y-auto scroll-thin">
						{tab === 'assets' ? (
							<AssetRail />
						) : (
							<div className="p-4">
								<MultiAngleBuilder />
							</div>
						)}
					</div>
				</aside>

				{/* Stage */}
				<main className="flex min-w-0 flex-1 flex-col gap-4 overflow-y-auto scroll-thin p-4 min-[1440px]:p-5">
					<ConnectionBanner />
					<section className="flex min-h-[420px] flex-1 flex-col rounded-2xl border border-white/8 bg-black/25 p-2">
						<SplitCompare />
					</section>
					<FrameTransport />
					<StreamDock />
					<div className={isUltrawide ? 'grid grid-cols-2 gap-4' : 'flex flex-col gap-4'}>
						<JobsPanel />
						<MetricsPanel />
					</div>
					<ActivityLog />
				</main>

				{/* Inspector — pinned from 1024px, overlay drawer below. */}
				<aside
					className={cx(
						'glass z-20 flex h-full shrink-0 flex-col overflow-hidden transition-[transform,opacity] duration-300 ease-[var(--ease-spring)]',
						isDesktop
							? 'relative w-[344px] border-l border-line min-[1440px]:w-[376px] min-[1920px]:w-[400px]'
							: 'absolute inset-y-0 right-0 w-[92vw] max-w-md border-l border-line',
						!isDesktop && !inspectorOpen ? 'translate-x-full opacity-0' : 'translate-x-0 opacity-100'
					)}
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
				<div className="glass z-30 flex items-center justify-center gap-2 border-t border-line px-3 py-2.5">
					<button
						type="button"
						onClick={() => {
							setTrayOpen((value) => !value);
							setInspectorOpen(false);
						}}
						className={cx(
							'flex h-11 flex-1 items-center justify-center gap-2 rounded-xl text-sm font-medium transition',
							trayOpen ? 'bg-apple text-white' : 'bg-white/[0.06] text-ink-soft'
						)}
					>
						<Boxes className="h-4 w-4" /> {tab === 'faces' ? '3D Face Sources' : 'Sources'}
					</button>
					<button
						type="button"
						onClick={() => {
							setInspectorOpen((value) => !value);
							setTrayOpen(false);
						}}
						className={cx(
							'flex h-11 flex-1 items-center justify-center gap-2 rounded-xl text-sm font-medium transition',
							inspectorOpen ? 'bg-apple text-white' : 'bg-white/[0.06] text-ink-soft'
						)}
					>
						<Sliders className="h-4 w-4" /> Inspector
					</button>
				</div>
			) : null}
		</div>
	);
};

export const BootScreen = ({ message }: { message: string }) => (
	<div className="grid h-dvh w-screen place-items-center bg-app text-ink">
		<div className="flex flex-col items-center gap-3">
			<div className="relative h-14 w-14">
				<span className="absolute inset-0 animate-pulse-soft rounded-2xl bg-apple/25" />
				<span className="relative grid h-14 w-14 place-items-center rounded-2xl border border-apple/30 bg-apple/15 text-apple">
					<Sparkles className="h-6 w-6" />
				</span>
			</div>
			<p className="text-base font-medium tracking-tight">FaceFusion Studio</p>
			<p className="text-sm text-ink-faint">{message}</p>
		</div>
	</div>
);