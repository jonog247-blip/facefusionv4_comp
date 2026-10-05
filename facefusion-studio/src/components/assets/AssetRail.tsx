import { useRef, useState } from 'react';
import { Download, Film, ImageIcon, Layers, Music4, Trash2, Upload } from 'lucide-react';
import { useStudio } from '../../store/studio';
import { formatBytes } from '../../api/config';
import type { Asset } from '../../api/types';
import { useAssetUrl } from '../../hooks/useAssetUrl';
import { Badge, Button, EmptyState, Eyebrow, IconButton, Panel, PanelHeader } from '../ui/primitives';

const mediaIcon = (asset: Asset) => {
	if (asset.media === 'video') return <Film className="h-3 w-3" />;
	if (asset.media === 'audio') return <Music4 className="h-3 w-3" />;
	return <ImageIcon className="h-3 w-3" />;
};

const AssetThumb = ({ asset, url }: { asset: Asset; url: string | null }) => {
	const kind = asset.media === 'video' ? 'video' : asset.media === 'audio' ? 'audio' : 'img';

	return (
		<span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-white/8 bg-black/50">
			{url && kind === 'img' ? (
				<img src={url} alt={asset.name} className="h-full w-full object-cover" />
			) : url && kind === 'video' ? (
				<video src={url} className="h-full w-full object-cover" muted playsInline preload="metadata" />
			) : (
				<span className="flex h-full w-full items-center justify-center text-ink-faint">{mediaIcon(asset)}</span>
			)}
		</span>
	);
};

const AssetRow = ({
	asset,
	selected,
	onSelect,
	onRemove,
	removable = true
}: {
	asset: Asset;
	selected: boolean;
	onSelect?: () => void;
	onRemove: () => void;
	removable?: boolean;
}) => {
	const url = useAssetUrl(asset);
	const api = useStudio((state) => state.api);

	return (
		<li
			className={[
				'group flex items-center gap-2 rounded-xl border px-2 py-1.5 transition duration-150',
				selected ? 'border-apple/50 bg-apple/10' : 'border-white/8 bg-white/[0.03] hover:border-white/20'
			].join(' ')}
		>
			<button type="button" onClick={onSelect} className="flex min-w-0 flex-1 items-center gap-2 text-left">
				<AssetThumb asset={asset} url={url} />
				<span className="min-w-0 flex-1">
					<span className="flex items-center gap-1.5">
						<span className="truncate text-sm font-medium text-ink">{asset.name}</span>
						{asset.type === 'output' ? <Badge tone="success">out</Badge> : null}
					</span>
					<span className="tabular mt-0.5 block truncate font-mono text-sm text-ink-faint">
						{asset.media} · {asset.format} · {formatBytes(asset.size)}
					</span>
				</span>
			</button>
			<span className="flex shrink-0 items-center gap-0.5 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
				<IconButton
					label="Download"
					className="h-6 w-6"
					onClick={() => {
						if (url) {
							const link = document.createElement('a');
							link.href = url;
							link.download = asset.name;
							link.click();
						} else {
							void api?.downloadAsset(asset.id).then((blob) => {
								const objectUrl = URL.createObjectURL(blob);
								const link = document.createElement('a');
								link.href = objectUrl;
								link.download = asset.name;
								link.click();
								setTimeout(() => URL.revokeObjectURL(objectUrl), 4000);
							});
						}
					}}
				>
					<Download className="h-3 w-3" />
				</IconButton>
				{removable ? (
					<IconButton label="Delete asset" tone="danger" className="h-6 w-6" onClick={onRemove}>
						<Trash2 className="h-3 w-3" />
					</IconButton>
				) : null}
			</span>
		</li>
	);
};

const DropButton = ({ label, onFiles, accept }: { label: string; onFiles: (files: File[]) => void; accept: string }) => {
	const inputRef = useRef<HTMLInputElement>(null);

	return (
		<>
			<Button
				size="sm"
				variant="secondary"
				icon={<Upload className="h-3 w-3" />}
				className="w-full"
				onClick={() => inputRef.current?.click()}
			>
				{label}
			</Button>
			<input
				ref={inputRef}
				type="file"
				accept={accept}
				multiple
				className="hidden"
				onChange={(event) => {
					onFiles(Array.from(event.target.files ?? []));
					event.target.value = '';
				}}
			/>
		</>
	);
};

const AssetGroup = ({
	title,
	assets,
	emptyHint,
	selectedIds,
	onToggle,
	onClear,
	accept,
	uploadLabel,
	onRemove,
	lockSelection
}: {
	title: string;
	assets: Asset[];
	emptyHint: string;
	selectedIds: string[];
	onToggle?: (assetId: string) => void;
	onClear?: () => void;
	accept: string;
	uploadLabel: string;
	onRemove: (assetId: string) => void;
	lockSelection?: boolean;
}) => (
	<Panel>
		<PanelHeader
			title={
				<span className="flex items-center gap-2">
					{title}
					<Badge tone="neutral">{assets.length}</Badge>
				</span>
			}
			action={
				onClear && assets.length ? (
					<Button size="sm" variant="ghost" onClick={onClear}>
						Clear
					</Button>
				) : null
			}
		/>
		<div className="flex flex-col gap-2 p-2.5">
			<DropButton label={uploadLabel} accept={accept} onFiles={(files) => void useStudio.getState().upload(lockSelection ? 'target' : 'source', files)} />
			{assets.length ? (
				<ul className="flex flex-col gap-1.5">
					{assets.map((asset) => (
						<AssetRow
							key={asset.id}
							asset={asset}
							selected={selectedIds.includes(asset.id)}
							onSelect={onToggle ? () => onToggle(asset.id) : undefined}
							onRemove={() => onRemove(asset.id)}
						/>
					))}
				</ul>
			) : (
				<Eyebrow className="px-1 py-2 text-center normal-case tracking-normal">{emptyHint}</Eyebrow>
			)}
		</div>
	</Panel>
);

export const AssetRail = () => {
	const assets = useStudio((state) => state.assets);
	const selectedSourceIds = useStudio((state) => state.selectedSourceIds);
	const selectedTargetId = useStudio((state) => state.selectedTargetId);
	const route = useStudio((state) => state.route);
	const selectSources = useStudio((state) => state.selectSources);
	const selectTarget = useStudio((state) => state.selectTarget);
	const removeAsset = useStudio((state) => state.removeAsset);
	const clearAssets = useStudio((state) => state.clearAssets);
	const addAngleFiles = useStudio((state) => state.addAngleFiles);
	const angles = useStudio((state) => state.angles);
	const [dragging, setDragging] = useState(false);

	const sources = assets.filter((asset) => asset.type === 'source');
	const targets = assets.filter((asset) => asset.type === 'target');
	const outputs = assets.filter((asset) => asset.type === 'output');
	const routedIds = new Set(route?.assetIds ?? []);

	const toggleSource = (assetId: string) => {
		const next = selectedSourceIds.includes(assetId)
			? selectedSourceIds.filter((id) => id !== assetId)
			: [...selectedSourceIds, assetId];
		void selectSources(next);
	};

	return (
		<div
			className={[
				'flex h-full flex-col gap-3 overflow-y-auto scroll-thin p-3 transition',
				dragging ? 'bg-apple/5' : ''
			].join(' ')}
			onDragOver={(event) => {
				event.preventDefault();
				setDragging(true);
			}}
			onDragLeave={() => setDragging(false)}
			onDrop={(event) => {
				event.preventDefault();
				setDragging(false);
				const files = Array.from(event.dataTransfer.files ?? []).filter((file) => file.type.startsWith('image/'));
				if (files.length) {
					void addAngleFiles(files);
				} else {
					void useStudio.getState().upload('source', Array.from(event.dataTransfer.files ?? []));
				}
			}}
		>
			<AssetGroup
				title="Sources"
				assets={sources}
				emptyHint="Upload one or more identity photos. Drag images here to run the angle builder."
				selectedIds={selectedSourceIds}
				onToggle={toggleSource}
				accept="image/*,video/*"
				uploadLabel="Upload source"
				onRemove={(id) => void removeAsset(id)}
			/>

			{angles.length ? (
				<Panel>
					<PanelHeader title="Angle routing" subtitle={`${routedIds.size} asset(s) active`} />
					<div className="p-2.5">
						<Eyebrow className="mb-1.5">Active for the current pose</Eyebrow>
						<ul className="flex flex-col gap-1">
							{[...routedIds].map((id) => {
								const asset = sources.find((entry) => entry.id === id);
								return (
									<li key={id} className="truncate rounded-lg bg-white/[0.04] px-2 py-1 font-mono text-sm text-ink-soft">
										{asset?.name ?? id}
									</li>
								);
							})}
						</ul>
					</div>
				</Panel>
			) : null}

			<AssetGroup
				title="Target"
				assets={targets}
				emptyHint="Upload the video or image you want to process."
				selectedIds={selectedTargetId ? [selectedTargetId] : []}
				onToggle={selectTarget}
				accept="image/*,video/*"
				uploadLabel="Upload target"
				onRemove={(id) => void removeAsset(id)}
				lockSelection
			/>

			{outputs.length ? (
				<AssetGroup
					title="Outputs"
					assets={outputs}
					emptyHint=""
					selectedIds={[]}
					accept="*/*"
					uploadLabel="Upload output"
					onRemove={(id) => void removeAsset(id)}
				/>
			) : null}

			{assets.length ? (
				<Button size="sm" variant="ghost" icon={<Layers className="h-3 w-3" />} onClick={() => void clearAssets()}>
					Delete all session assets
				</Button>
			) : (
				<EmptyState icon={<Layers className="h-5 w-5" />} title="No assets yet" detail="Everything you upload lives in the session and disappears with it." />
			)}
		</div>
	);
};
