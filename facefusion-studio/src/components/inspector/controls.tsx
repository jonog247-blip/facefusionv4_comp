import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { RotateCcw } from 'lucide-react';
import { humanizeKey } from '../../api/config';
import type { Capability } from '../../api/types';

export interface ControlProps {
	name: string;
	capability: Capability;
	value: unknown;
	onChange: (value: unknown) => void;
	disabled?: boolean;
}

const label = (name: string) => {
	const [head, ...rest] = humanizeKey(name).split(' ');
	return [head, ...rest].join(' ');
};

const Frame = ({
	children,
	action,
	title
}: {
	children: React.ReactNode;
	action?: React.ReactNode;
	title?: string;
}) => (
	<div className="group/control flex flex-col gap-1.5">
		<div className="flex items-center justify-between gap-2">
			<span className="truncate text-[11px] font-medium capitalize text-ink-soft" title={title}>
				{children}
			</span>
			{action}
		</div>
	</div>
);

const isNumeric = (choices: unknown[]) => choices.every((choice) => typeof choice === 'number');

const numericBounds = (choices: number[]) => ({
	min: Math.min(...choices),
	max: Math.max(...choices),
	step: choices.length > 1 ? Math.min(...choices.slice(1).map((value, index) => value - choices[index]).filter((delta) => delta > 0)) : 1
});

const ResetButton = ({ onReset }: { onReset: () => void }) => (
	<button
		type="button"
		aria-label="Reset to default"
		onClick={onReset}
		className="rounded-md p-1 text-ink-faint opacity-0 transition hover:bg-white/10 hover:text-ink group-hover/control:opacity-100"
	>
		<RotateCcw className="h-3 w-3" />
	</button>
);

const selectClass =
	'h-8 w-full appearance-none rounded-lg border border-white/10 bg-white/[0.04] px-2.5 text-[11px] text-ink focus:border-apple/60 focus:outline-none';

export const SelectControl = ({ name, capability, value, onChange, disabled }: ControlProps) => (
	<Frame
		title={name}
		action={<ResetButton onReset={() => onChange(capability.default)} />}
	>
		{label(name)}
		<select
			className={selectClass}
			value={String(value ?? '')}
			disabled={disabled}
			onChange={(event) => onChange(event.target.value)}
		>
			{capability.choices?.map((choice) => (
				<option key={String(choice)} value={String(choice)} className="bg-[#1c1c1e] text-ink">
					{String(choice)}
				</option>
			))}
		</select>
	</Frame>
);

export const MultiSelectControl = ({ name, capability, value, onChange, disabled }: ControlProps) => {
	const choices = capability.choices ?? [];
	const selected = Array.isArray(value) ? (value as unknown[]) : [];

	return (
		<Frame title={name} action={<ResetButton onReset={() => onChange(capability.default)} />}>
			{label(name)}
			<div className="flex flex-wrap gap-1">
				{choices.map((choice) => {
					const active = selected.includes(choice);

					return (
						<button
							key={String(choice)}
							type="button"
							disabled={disabled}
							onClick={() =>
								onChange(
									active ? selected.filter((entry) => entry !== choice) : [...selected, choice]
								)
							}
							className={clsx(
								'rounded-md border px-1.5 py-[3px] text-[10px] font-medium transition',
								active
									? 'border-apple/50 bg-apple/20 text-apple'
									: 'border-white/10 bg-white/[0.03] text-ink-faint hover:border-white/25 hover:text-ink-soft'
							)}
						>
							{String(choice)}
						</button>
					);
				})}
			</div>
		</Frame>
	);
};

export const SwitchControl = ({ name, capability, value, onChange, disabled }: ControlProps) => (
	<Frame
		title={name}
		action={<ResetButton onReset={() => onChange(capability.default)} />}
	>
		{label(name)}
		<button
			type="button"
			role="switch"
			aria-checked={Boolean(value)}
			disabled={disabled}
			onClick={() => onChange(!value)}
			className={clsx(
				'relative h-[20px] w-[34px] rounded-full border transition-colors duration-200',
				value ? 'border-apple/50 bg-apple' : 'border-white/10 bg-white/10'
			)}
		>
			<span
				className={clsx(
					'absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white transition-transform duration-200',
					value ? 'translate-x-[17px]' : 'translate-x-[2px]'
				)}
			/>
		</button>
	</Frame>
);

export const SliderControl = ({ name, capability, value, onChange, disabled }: ControlProps) => {
	const choices = (capability.choices ?? []).filter((choice) => typeof choice === 'number') as number[];
	const bounds = useMemo(() => numericBounds(choices), [choices]);
	const [local, setLocal] = useState<number>(typeof value === 'number' ? value : bounds.min);

	useEffect(() => {
		if (typeof value === 'number') {
			setLocal(value);
		}
	}, [value]);

	return (
		<Frame
			title={name}
			action={
				<div className="flex items-center gap-1.5">
					<span className="tabular font-mono text-[10px] text-ink-soft">{local}</span>
					<ResetButton onReset={() => (setLocal(Number(capability.default)), onChange(capability.default))} />
				</div>
			}
		>
			{label(name)}
			<input
				type="range"
				min={bounds.min}
				max={bounds.max}
				step={bounds.step || 1}
				value={local}
				disabled={disabled}
				onChange={(event) => setLocal(Number(event.target.value))}
				onPointerUp={() => onChange(local)}
				onKeyUp={() => onChange(local)}
				onBlur={() => onChange(local)}
				className="h-1 w-full cursor-pointer appearance-none rounded-full bg-white/12 accent-apple"
			/>
		</Frame>
	);
};

export const TextControl = ({ name, capability, value, onChange, disabled }: ControlProps) => (
	<Frame
		title={name}
		action={<ResetButton onReset={() => onChange(capability.default)} />}
	>
		{label(name)}
		<input
			type="text"
			className="h-8 w-full rounded-lg border border-white/10 bg-white/[0.04] px-2.5 font-mono text-[11px] text-ink placeholder:text-ink-faint focus:border-apple/60 focus:outline-none"
			value={value === undefined || value === null ? '' : String(value)}
			disabled={disabled}
			onChange={(event) => onChange(event.target.value)}
		/>
	</Frame>
);

export const NumberListControl = ({ name, capability, value, onChange, disabled }: ControlProps) => {
	const list = Array.isArray(value) ? (value as number[]) : [];

	return (
		<Frame title={name} action={<ResetButton onReset={() => onChange(capability.default)} />}>
			{label(name)}
			<div className="flex flex-wrap gap-1">
				{list.map((entry, index) => (
					<input
						key={`${name}-${index}`}
						type="number"
						disabled={disabled}
						value={entry}
						onChange={(event) => {
							const next = [...list];
							next[index] = Number(event.target.value);
							onChange(next);
						}}
						className="tabular h-7 w-14 rounded-md border border-white/10 bg-white/[0.04] px-1.5 text-center font-mono text-[10px] text-ink focus:border-apple/60 focus:outline-none"
					/>
				))}
			</div>
		</Frame>
	);
};

const isColorArgument = (name: string) => name.endsWith('_color');

const ColorControl = ({ name, capability, value, onChange, disabled }: ControlProps) => {
	const list = Array.isArray(value) ? (value as number[]) : [0, 0, 0, 0];
	const hex = `#${list.slice(0, 3).map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;

	return (
		<Frame title={name} action={<ResetButton onReset={() => onChange(capability.default)} />}>
			{label(name)}
			<div className="flex items-center gap-2">
				<input
					type="color"
					disabled={disabled}
					value={hex}
					onChange={(event) => {
						const value = event.target.value;
						const next = [
							Number.parseInt(value.slice(1, 3), 16),
							Number.parseInt(value.slice(3, 5), 16),
							Number.parseInt(value.slice(5, 7), 16),
							list[3] ?? 0
						];
						onChange(next);
					}}
					className="h-7 w-9 cursor-pointer rounded-md border border-white/10 bg-transparent"
				/>
				<span className="tabular font-mono text-[10px] text-ink-faint">{hex}</span>
			</div>
		</Frame>
	);
};

const isProcessorArgument = (name: string) => name === 'processors';

/** Picks the control that matches the option's value shape and choices. */
export const CapabilityControl = (props: ControlProps) => {
	const { name, capability, value } = props;
	const choices = capability.choices;

	if (isProcessorArgument(name)) {
		return <MultiSelectControl {...props} />;
	}

	if (isColorArgument(name)) {
		return <ColorControl {...props} />;
	}

	if (typeof value === 'boolean') {
		return <SwitchControl {...props} />;
	}

	if (Array.isArray(value)) {
		return choices?.length ? <MultiSelectControl {...props} /> : <NumberListControl {...props} />;
	}

	if (choices?.length) {
		if (isNumeric(choices) && choices.length > 1) {
			return <SliderControl {...props} />;
		}
		return <SelectControl {...props} />;
	}

	if (typeof value === 'number') {
		return <TextControl {...props} />;
	}

	return <TextControl {...props} />;
};
