import { Activity, Cpu, Gauge, HardDrive, MemoryStick, Network } from 'lucide-react';
import { useStudio } from '../../store/studio';
import type { MetricValue } from '../../api/types';
import { Eyebrow, KeyValue, Panel, PanelHeader } from '../ui/primitives';

const asList = (value: MetricValue[] | Record<string, MetricValue> | undefined) => {
	if (!value) {
		return [] as MetricValue[];
	}
	return Array.isArray(value) ? value : Object.values(value);
};

const Section = ({
	icon,
	title,
	values
}: {
	icon: React.ReactNode;
	title: string;
	values: MetricValue[];
}) => (
	<div className="rounded-xl border border-white/8 bg-white/[0.03] p-2.5">
		<Eyebrow className="mb-1 flex items-center gap-1.5">
			{icon}
			{title}
		</Eyebrow>
		{values.length ? (
			values.map((entry, index) => (
				<KeyValue key={index} label={`unit ${entry.unit}`} value={`${entry.value} ${entry.unit}`} />
			))
		) : (
			<p className="text-[11px] text-ink-faint">no data</p>
		)}
	</div>
);

export const MetricsPanel = () => {
	const metrics = useStudio((state) => state.metrics);
	const mode = useStudio((state) => state.mode);

	return (
		<Panel>
			<PanelHeader
				title={
					<span className="flex items-center gap-2">
						<Activity className="h-3.5 w-3.5 text-apple" /> System
					</span>
				}
				subtitle={mode === 'demo' ? 'synthetic demo telemetry' : 'GET /metrics over WebSocket'}
			/>
			<div className="grid grid-cols-1 gap-2 p-2.5 sm:grid-cols-2">
				<Section icon={<Gauge className="h-3 w-3" />} title="GPU" values={asList(metrics?.graphic_devices)} />
				<Section icon={<Cpu className="h-3 w-3" />} title="CPU" values={asList(metrics?.processor)} />
				<Section icon={<MemoryStick className="h-3 w-3" />} title="Memory" values={asList(metrics?.memory)} />
				<Section icon={<HardDrive className="h-3 w-3" />} title="Disks" values={asList(metrics?.disks)} />
				<Section icon={<Network className="h-3 w-3" />} title="Network" values={asList(metrics?.network)} />
			</div>
		</Panel>
	);
};
