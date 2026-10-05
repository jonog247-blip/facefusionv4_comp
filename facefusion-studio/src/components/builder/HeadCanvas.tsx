import { Canvas, useFrame } from '@react-three/fiber';
import { Line, OrbitControls, PerspectiveCamera } from '@react-three/drei';
import { Suspense, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { poseToVector, type Pose } from '../../vision/pose';
import type { AngleEntry } from '../../vision/poseRouter';

const HEAD_RADIUS = 1.15;
const PIN_RADIUS = 1.38;

function Pin({
	entry,
	selected,
	active,
	onSelect
}: {
	entry: AngleEntry;
	selected: boolean;
	active: boolean;
	onSelect: (id: string) => void;
}) {
	const [x, y, z] = useMemo(() => poseToVector(entry.pose, PIN_RADIUS), [entry.pose]);
	const [ix, iy, iz] = useMemo(() => poseToVector(entry.pose, PIN_RADIUS * 0.62), [entry.pose]);
	const color = active ? '#0a84ff' : selected ? '#30d158' : '#8e8e93';
	const pulse = useRef<THREE.Mesh>(null);

	useFrame(({ clock }) => {
		if (pulse.current && (selected || active)) {
			const scale = 1 + Math.sin(clock.elapsedTime * 4) * 0.12;
			pulse.current.scale.setScalar(scale);
		}
	});

	return (
		<group position={[x, y, z]}>
			<mesh
				ref={pulse}
				onClick={(event) => {
					event.stopPropagation();
					onSelect(entry.id);
				}}
				onPointerOver={() => {
					document.body.style.cursor = 'pointer';
				}}
				onPointerOut={() => {
					document.body.style.cursor = 'auto';
				}}
			>
				<sphereGeometry args={[selected || active ? 0.085 : 0.055, 18, 18]} />
				<meshBasicMaterial color={color} toneMapped={false} />
			</mesh>
			<Line
				points={[
					[x, y, z],
					[ix, iy, iz]
				]}
				color={color}
				lineWidth={1.5}
				transparent
				opacity={0.55}
			/>
		</group>
	);
}

function LiveMarker({ pose }: { pose: Pose | null }) {
	const group = useRef<THREE.Group>(null);
	const livePosition = useMemo<[number, number, number]>(() => (pose ? poseToVector(pose, PIN_RADIUS * 1.12) : [0, 0, 0]), [pose]);

	useFrame(({ clock }) => {
		if (group.current) {
			group.current.rotation.z = Math.sin(clock.elapsedTime * 1.6) * 0.12;
		}
	});

	if (!pose) {
		return null;
	}

	return (
		<group ref={group} position={livePosition}>
			<mesh rotation={[Math.PI / 2, 0, 0]}>
				<coneGeometry args={[0.07, 0.16, 4]} />
				<meshBasicMaterial color="#ffd60a" toneMapped={false} wireframe />
			</mesh>
		</group>
	);
}

function HeadVolume({ spin }: { spin: boolean }) {
	const group = useRef<THREE.Group>(null);

	useFrame((_, delta) => {
		if (group.current && spin) {
			group.current.rotation.y += delta * 0.25;
		}
	});

	return (
		<group ref={group}>
			<mesh scale={[0.92, 1.12, 1]}>
				<sphereGeometry args={[HEAD_RADIUS, 40, 28]} />
				<meshStandardMaterial
					color="#15151a"
					roughness={0.55}
					metalness={0.15}
					transparent
					opacity={0.9}
					flatShading
				/>
			</mesh>
			<mesh scale={[0.92, 1.12, 1]}>
				<sphereGeometry args={[HEAD_RADIUS, 22, 16]} />
				<meshBasicMaterial color="#0a84ff" transparent opacity={0.045} wireframe />
			</mesh>
			{/* Equator rings make the yaw of every pin readable at a glance. */}
			<mesh rotation={[Math.PI / 2, 0, 0]}>
				<torusGeometry args={[PIN_RADIUS * 0.99, 0.004, 8, 96]} />
				<meshBasicMaterial color="#ffffff" transparent opacity={0.16} />
			</mesh>
			<mesh rotation={[0, 0, Math.PI / 2]}>
				<torusGeometry args={[PIN_RADIUS * 0.99, 0.004, 8, 96]} />
				<meshBasicMaterial color="#ffffff" transparent opacity={0.1} />
			</mesh>
		</group>
	);
}

interface HeadCanvasProps {
	angles: AngleEntry[];
	selectedId: string | null;
	activeAssetId: string | null;
	livePose: Pose | null;
	onSelect: (id: string) => void;
	className?: string;
}

const hasWebGL = () => {
	if (typeof document === 'undefined') {
		return false;
	}
	try {
		const canvas = document.createElement('canvas');
		return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
	} catch {
		return false;
	}
};

export const HeadCanvas = ({
	angles,
	selectedId,
	activeAssetId,
	livePose,
	onSelect,
	className
}: HeadCanvasProps) => {
	const [supported] = useState(hasWebGL);

	return (
		<div
			className={cxCanvas(className)}
			style={{ height: 236 }}
		>
		{!supported ? (
			<div className="grid h-full place-items-center px-4 text-center text-[11px] text-ink-faint">
				WebGL is unavailable in this browser — the angle list below still drives the router.
			</div>
		) : (
		<Suspense fallback={null}>
			<Canvas dpr={[1, 2]} gl={{ antialias: true, alpha: true }}>
				<PerspectiveCamera makeDefault position={[0, 0.15, 3.5]} fov={38} />
				<ambientLight intensity={0.9} />
				<directionalLight position={[3, 4, 4]} intensity={1.6} />
				<pointLight position={[-3, -1, 2]} intensity={14} color="#0a84ff" distance={9} />
				<HeadVolume spin={angles.length === 0} />
				{angles.map((entry) => (
					<Pin
						key={entry.id}
						entry={entry}
						selected={entry.id === selectedId}
						active={entry.assetId === activeAssetId}
						onSelect={onSelect}
					/>
				))}
				<LiveMarker pose={livePose} />
				<OrbitControls
					enablePan={false}
					enableZoom={false}
					minPolarAngle={Math.PI / 3.1}
					maxPolarAngle={Math.PI / 1.8}
					rotateSpeed={0.6}
				/>
			</Canvas>
		</Suspense>
		)}
		<div className="pointer-events-none absolute inset-x-0 top-2.5 flex items-center justify-between px-3">
			<span className="rounded-full border border-white/10 bg-black/50 px-2 py-[3px] text-[10px] font-medium text-ink-soft backdrop-blur">
				{angles.length} angle{angles.length === 1 ? '' : 's'} synced
			</span>
			<span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-faint">Drag to rotate</span>
		</div>
		</div>
	);
};

const cxCanvas = (className?: string) =>
	['relative w-full overflow-hidden rounded-2xl border border-white/8 bg-gradient-to-b from-white/[0.05] to-transparent', className]
		.filter(Boolean)
		.join(' ');
