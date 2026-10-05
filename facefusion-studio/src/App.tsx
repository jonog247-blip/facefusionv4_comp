import { useEffect } from 'react';
import { BootScreen, Shell } from './components/layout/Shell';
import { useStudio } from './store/studio';
import { onLandmarkerStatus } from './vision/faceLandmarker';

export const App = () => {
	const phase = useStudio((state) => state.phase);
	const bootstrap = useStudio((state) => state.bootstrap);
	useEffect(() => {
		void bootstrap();
	}, [bootstrap]);

	useEffect(() => {
		const unsubscribe = onLandmarkerStatus((status, detail) => {
			if (status === 'unavailable' && detail) {
				useStudio.setState({ landmarkerDetail: `Face landmarker unavailable: ${detail}` });
			} else if (status === 'ready') {
				useStudio.setState({ landmarkerDetail: '' });
			}
		});

		return () => {
			unsubscribe();
		};
	}, []);

	if (phase === 'idle' || phase === 'probing') {
		return <BootScreen message="Contacting the FaceFusion API…" />;
	}

	return <Shell />;
};
