import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { Minus, Plus, RotateCcw } from 'lucide-react';
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
	<div className="group/control flex flex-col gap-2">
		<div className="flex items-center justify-between gap-2">
			<span className="truncate text-xs font-medium capitalize text-ink-soft" title={title}>
				{children}
			</span>
			{action}
		</div>
	</div>
);

const isNumeric = (choices: unknown[]) => choices.every((choice) => typeof choice === 'number');

/** Smallest sensible bounds for a numeric option that ships without `choices`. */
const inferBounds = (value: number) => {
	if (Number.isInteger(value)) {
		const magnitude = Math.max(10, Math.min(1000, Math.round(Math.abs(value) * 4) || 10));
		return { min: 0, max: magnitude, step: 1 };
	}

	return value >= 0 && value <= 1 ? { min: 0, max: 1, step: 0.01 } : { min: -1, max: 1, step: 0.01 };
};

const numericBounds = (choices: number[]) => {
	if (choices.length < 2) {
		return { min: 0, max: 10, step: 1 };
	}

	const sorted = [...choices].sort((a, b) => a - b);
	const deltas = sorted.slice(1).map((value, index) => value - sorted[index]);

	return {
		min: sorted[0],
		max: sorted[sorted.length - 1],
		step: deltas.length ? Math.min(...deltas.filter((delta) => delta > 0)) || 1 : 1
	};
};

const ResetButton = ({ onReset }: { onReset: () => void }) => (
	<button
		type="button"
		aria-label="Reset to default"
		title="Reset to default"
		onClick={onReset}
		className="rounded-md p-1.5 text-ink-faint transition hover:bg-white/10 hover:text-ink"
	>
		<RotateCcw className="h-3.5 w-3.5" />
	</button>
);

const selectClass =
	'h-10 w-full appearance-none rounded-[10px] border border-white/12 bg-white/[0.05] px-3 text-sm text-ink focus:border-apple/60 focus:outline-none';

export const SelectControl = ({ name, capability, value, onChange, disabled }: ControlProps) => (
	<Frame title={name} action={<ResetButton onReset={() => onChange(capability.default)} />}>
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
			<div className="flex flex-wrap gap-1.5">
				{choices.map((choice) => {
					const active = selected.includes(choice);

					return (
						<button
							key={String(choice)}
							type="button"
							disabled={disabled}
							onClick={() =>
								onChange(active ? selected.filter((entry) => entry !== choice) : [...selected, choice])
							}
							className={clsx(
								'rounded-lg border px-2.5 py-1.5 text-xs font-medium transition',
								active
									? 'border-apple/50 bg-apple/20 text-apple'
									: 'border-white/12 bg-white/[0.04] text-ink-faint hover:border-white/25 hover:text-ink-soft'
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
	<Frame title={name} action={<ResetButton onReset={() => onChange(capability.default)} />}>
		{label(name)}
		<button
			type="button"
			role="switch"
			aria-checked={Boolean(value)}
			aria-label={name}
			disabled={disabled}
			onClick={() => onChange(!value)}
			className={clsx(
				'relative h-[24px] w-[42px] rounded-full border transition-colors duration-200',
				value ? 'border-apple/50 bg-apple' : 'border-white/12 bg-white/10'
			)}
		>
			<span
				className={clsx(
					'absolute top-[2px] h-[18px] w-[18px] rounded-full bg-white transition-transform duration-200',
					value ? 'translate-x-[21px]' : 'translate-x-[2px]'
				)}
			/>
		</button>
	</Frame>
);

/**
 * Every numeric option gets a real slider: explicit bounds when the engine
 * advertises `choices`, sensible inferred bounds when it does not, and a
 * number box so an exact value can be typed instead of hunted for.
 */
export const SliderControl = ({ name, capability, value, onChange, disabled }: ControlProps) => {
	const choices = (capability.choices ?? []).filter((choice) => typeof choice === 'number') as number[];
	const bounds = useMemo(
		() => (choices.length > 1 ? numericBounds(choices) : inferBounds(typeof value === 'number' ? value : 0)),
		[choices, value]
	);
	const numeric = typeof value === 'number' ? value : Number(value ?? 0);
	const [local, setLocal] = useState<number>(numeric);

	useEffect(() => {
		setLocal(numeric);
	}, [numeric]);

	const decimals = bounds.step < 1 ? String(bounds.step).split('.')[1]?.length ?? 2 : 0;
	const commit = (next: number) => {
		const clamped = Math.min(bounds.max, Math.max(bounds.min, next));
		setLocal(clamped);
		onChange(clamped);
	};

	return (
		<Frame
			title={name}
			action={
				<div className="flex shrink-0 items-center gap-1">
					<button
						type="button"
						aria-label={`Decrease ${name}`}
						disabled={disabled || local <= bounds.min}
						onClick={() => commit(local - bounds.step)}
						className="grid h-7 w-7 place-items-center rounded-md border border-white/12 text-ink-soft transition hover:bg-white/10 disabled:opacity-30"
					>
						<Minus className="h-3.5 w-3.5" />
					</button>
					<input
						type="number"
						value={Number(local.toFixed(decimals))}
						min={bounds.min}
						max={bounds.max}
						step={bounds.step}
						disabled={disabled}
						onChange={(event) => setLocal(Number(event.target.value))}
						onBlur={() => commit(local)}
						onKeyUp={(event) => {
							if (event.key === 'Enter') {
								commit(local);
							}
						}}
						className="tabular h-7 w-16 rounded-md border border-white/12 bg-white/[0.05] px-1.5 text-center font-mono text-xs text-ink focus:border-apple/60 focus:outline-none"
					/>
					<button
						type="button"
						aria-label={`Increase ${name}`}
						disabled={disabled || local >= bounds.max}
						onClick={() => commit(local + bounds.step)}
						className="grid h-7 w-7 place-items-center rounded-md border border-white/12 text-ink-soft transition hover:bg-white/10 disabled:opacity-30"
					>
						<Plus className="h-3.5 w-3.5" />
					</button>
					<ResetButton onReset={() => (setLocal(Number(capability.default)), onChange(capability.default))} />
				</div>
			}
		>
			{label(name)}
			<input
				type="range"
				className="range"
				min={bounds.min}
				max={bounds.max}
				step={bounds.step}
				value={local}
				disabled={disabled}
				onChange={(event) => setLocal(Number(event.target.value))}
				onPointerUp={() => onChange(local)}
				onKeyUp={() => onChange(local)}
				onBlur={() => onChange(local)}
			/>
			<span className="tabular -mt-1 flex justify-between font-mono text-sm text-ink-faint">
				<span>{bounds.min}</span>
				<span>{bounds.max}</span>
			</span>
		</Frame>
	);
};

export const TextControl = ({ name, capability, value, onChange, disabled }: ControlProps) => (
	<Frame title={name} action={<ResetButton onReset={() => onChange(capability.default)} />}>
		{label(name)}
		<input
			type="text"
			className="h-10 w-full rounded-[10px] border border-white/12 bg-white/[0.05] px-3 font-mono text-sm text-ink placeholder:text-ink-faint focus:border-apple/60 focus:outline-none"
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
			<div className="flex flex-wrap gap-1.5">
				{list.map((entry, index) => (
					<label key={`${name}-${index}`} className="flex items-center gap-1 text-sm text-ink-faint">
						<input
							type="number"
							disabled={disabled}
							value={entry}
							onChange={(event) => {
								const next = [...list];
								next[index] = Number(event.target.value);
								onChange(next);
							}}
							className="tabular h-9 w-16 rounded-lg border border-white/12 bg-white/[0.05] px-2 text-center font-mono text-xs text-ink focus:border-apple/60 focus:outline-none"
						/>
					</label>
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
						const picked = event.target.value;
						const next = [
							Number.parseInt(picked.slice(1, 3), 16),
							Number.parseInt(picked.slice(3, 5), 16),
							Number.parseInt(picked.slice(5, 7), 16),
							list[3] ?? 0
						];
						onChange(next);
					}}
					className="h-9 w-12 cursor-pointer rounded-lg border border-white/12 bg-transparent"
				/>
				<span className="tabular font-mono text-xs text-ink-faint">{hex}</span>
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

	if (typeof value === 'number') {
		return <SliderControl {...props} />;
	}

	if (choices?.length) {
		if (isNumeric(choices) && choices.length > 1) {
			return <SliderControl {...props} />;
		}
		return <SelectControl {...props} />;
	}

	return <TextControl {...props} />;
};