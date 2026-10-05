import clsx from 'clsx';
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';

export const cx = clsx;

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
	variant?: ButtonVariant;
	size?: ButtonSize;
	icon?: ReactNode;
	active?: boolean;
}

const variantClass: Record<ButtonVariant, string> = {
	primary:
		'bg-apple text-white shadow-[0_8px_24px_-10px_rgba(10,132,255,0.9)] hover:bg-apple-hover disabled:shadow-none',
	secondary: 'bg-white/[0.07] text-ink border border-white/10 hover:bg-white/[0.12]',
	ghost: 'text-ink-soft hover:bg-white/[0.06] hover:text-ink',
	danger: 'bg-danger/15 text-danger border border-danger/30 hover:bg-danger/25'
};

const sizeClass: Record<ButtonSize, string> = {
	sm: 'h-7 px-2.5 text-[11px] gap-1.5 rounded-lg',
	md: 'h-9 px-3.5 text-xs gap-2 rounded-[10px]',
	lg: 'h-11 px-5 text-sm gap-2 rounded-xl'
};

export const Button = ({
	variant = 'secondary',
	size = 'md',
	icon,
	active,
	className,
	children,
	...props
}: ButtonProps) => (
	<button
		type="button"
		className={cx(
			'inline-flex items-center justify-center font-medium whitespace-nowrap select-none',
			'transition-[background-color,border-color,color,transform,opacity] duration-150 ease-[var(--ease-spring)]',
			'active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40',
			variantClass[variant],
			sizeClass[size],
			active && 'ring-1 ring-apple/60',
			className
		)}
		{...props}
	>
		{icon}
		{children}
	</button>
);

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
	label: string;
	active?: boolean;
	tone?: 'default' | 'danger';
}

export const IconButton = ({ label, active, tone = 'default', className, children, ...props }: IconButtonProps) => (
	<button
		type="button"
		aria-label={label}
		title={label}
		className={cx(
			'inline-flex h-8 w-8 items-center justify-center rounded-[10px] border transition duration-150',
			'active:scale-95 disabled:pointer-events-none disabled:opacity-40',
			tone === 'danger'
				? 'border-transparent text-ink-faint hover:bg-danger/15 hover:text-danger'
				: cx(
						'border-white/8 text-ink-soft hover:bg-white/[0.07] hover:text-ink',
						active && 'border-apple/50 bg-apple/15 text-apple'
					),
			className
		)}
		{...props}
	>
		{children}
	</button>
);

type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'purple' | 'teal';

const toneClass: Record<Tone, string> = {
	neutral: 'bg-white/[0.07] text-ink-soft border-white/10',
	accent: 'bg-apple/15 text-apple border-apple/25',
	success: 'bg-success/15 text-success border-success/25',
	warning: 'bg-warning/15 text-warning border-warning/25',
	danger: 'bg-danger/15 text-danger border-danger/25',
	purple: 'bg-purple/15 text-purple border-purple/25',
	teal: 'bg-teal/15 text-teal border-teal/25'
};

export const Badge = ({
	tone = 'neutral',
	className,
	children
}: {
	tone?: Tone;
	className?: string;
	children: ReactNode;
}) => (
	<span
		className={cx(
			'inline-flex items-center gap-1 rounded-full border px-2 py-[3px] text-[10px] font-semibold tracking-wide',
			toneClass[tone],
			className
		)}
	>
		{children}
	</span>
);

export const Dot = ({ tone = 'neutral', pulse }: { tone?: Tone; pulse?: boolean }) => (
	<span
		className={cx(
			'inline-block h-1.5 w-1.5 shrink-0 rounded-full',
			tone === 'accent' && 'bg-apple',
			tone === 'success' && 'bg-success',
			tone === 'warning' && 'bg-warning',
			tone === 'danger' && 'bg-danger',
			tone === 'neutral' && 'bg-ink-faint',
			tone === 'purple' && 'bg-purple',
			tone === 'teal' && 'bg-teal',
			pulse && 'animate-pulse-soft'
		)}
	/>
);

export const Panel = ({ className, children }: { className?: string; children: ReactNode }) => (
	<section className={cx('card overflow-hidden', className)}>{children}</section>
);

export const PanelHeader = ({
	title,
	action,
	subtitle
}: {
	title: ReactNode;
	subtitle?: ReactNode;
	action?: ReactNode;
}) => (
	<header className="flex items-center justify-between gap-2 border-b border-line px-3.5 py-2.5">
		<div className="min-w-0">
			<h2 className="truncate text-[13px] font-semibold tracking-tight text-ink">{title}</h2>
			{subtitle ? <p className="truncate text-[11px] text-ink-faint">{subtitle}</p> : null}
		</div>
		{action}
	</header>
);

export const Eyebrow = ({ children, className }: { children: ReactNode; className?: string }) => (
	<p className={cx('eyebrow', className)}>{children}</p>
);

export const Switch = ({
	checked,
	onChange,
	label
}: {
	checked: boolean;
	onChange: (next: boolean) => void;
	label?: string;
}) => (
	<button
		type="button"
		role="switch"
		aria-checked={checked}
		aria-label={label}
		onClick={() => onChange(!checked)}
		className={cx(
			'relative h-[20px] w-[34px] shrink-0 rounded-full border transition-colors duration-200',
			checked ? 'border-apple/50 bg-apple' : 'border-white/10 bg-white/10'
		)}
	>
		<span
			className={cx(
				'absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white shadow transition-transform duration-200 ease-[var(--ease-spring)]',
				checked ? 'translate-x-[17px]' : 'translate-x-[2px]'
			)}
		/>
	</button>
);

export const TextField = ({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) => (
	<input
		className={cx(
			'h-8 w-full rounded-lg border border-white/10 bg-white/[0.04] px-2.5 text-xs text-ink',
			'placeholder:text-ink-faint focus:border-apple/60 focus:outline-none',
			className
		)}
		{...props}
	/>
);

export const Segmented = <T extends string>({
	value,
	options,
	onChange,
	className
}: {
	value: T;
	options: { value: T; label: ReactNode; title?: string }[];
	onChange: (next: T) => void;
	className?: string;
}) => (
	<div className={cx('inline-flex rounded-[10px] border border-white/10 bg-white/[0.04] p-0.5', className)}>
		{options.map((option) => (
			<button
				key={option.value}
				type="button"
				title={option.title}
				onClick={() => onChange(option.value)}
				className={cx(
					'flex-1 rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors duration-150',
					value === option.value ? 'bg-apple text-white' : 'text-ink-soft hover:text-ink'
				)}
			>
				{option.label}
			</button>
		))}
	</div>
);

export const Meter = ({ value, tone = 'accent' }: { value: number; tone?: Tone }) => (
	<div className="h-1.5 w-full overflow-hidden rounded-full bg-white/8">
		<div
			className={cx(
				'h-full rounded-full transition-[width] duration-500 ease-[var(--ease-spring)]',
				tone === 'accent' && 'bg-apple',
				tone === 'success' && 'bg-success',
				tone === 'warning' && 'bg-warning',
				tone === 'danger' && 'bg-danger',
				tone === 'purple' && 'bg-purple',
				tone === 'teal' && 'bg-teal',
				tone === 'neutral' && 'bg-ink-faint'
			)}
			style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }}
		/>
	</div>
);

export const Spinner = ({ className }: { className?: string }) => (
	<span
		className={cx(
			'inline-block h-3.5 w-3.5 animate-spin rounded-full border-[1.5px] border-white/20 border-t-apple',
			className
		)}
	/>
);

export const EmptyState = ({
	icon,
	title,
	detail,
	action
}: {
	icon?: ReactNode;
	title: string;
	detail?: string;
	action?: ReactNode;
}) => (
	<div className="flex flex-col items-center justify-center gap-2 px-4 py-8 text-center">
		{icon ? <div className="text-ink-faint">{icon}</div> : null}
		<p className="text-xs font-medium text-ink-soft">{title}</p>
		{detail ? <p className="max-w-[26ch] text-[11px] leading-relaxed text-ink-faint">{detail}</p> : null}
		{action}
	</div>
);

export const KeyValue = ({ label, value }: { label: ReactNode; value: ReactNode }) => (
	<div className="flex items-baseline justify-between gap-3 py-[3px]">
		<span className="truncate text-[11px] text-ink-faint">{label}</span>
		<span className="tabular shrink-0 font-mono text-[11px] text-ink-soft">{value}</span>
	</div>
);
