import gradio

from facefusion import hardware, metadata, state_manager, translator
from facefusion.uis.components import about, age_modifier_options, background_remover_options, deep_swapper_options, download, execution, execution_thread_count, expression_restorer_options, face_debugger_options, face_detector, face_editor_options, face_enhancer_options, face_landmarker, face_masker, face_selector, face_swapper_options, face_tracker, frame_colorizer_options, frame_enhancer_options, hardware as hardware_component, instant_runner, job_list, job_list_options, job_manager, job_runner, lip_syncer_options, memory, output, output_options, preview, preview_options, processors, source, target, temp_frame, terminal, trim_frame, ui_workflow, voice_extractor, workflow


def pre_check() -> bool:
	return True


def create_hero() -> str:
	hardware_profile = hardware_component.get_cached_profile()
	preset_mode = hardware.resolve_preset_mode(state_manager.get_item('hardware_preset_mode'))
	hardware_preset = hardware.create_hardware_preset(hardware_profile, preset_mode)
	chips = []

	gpus = hardware_profile.get('gpus')

	if gpus:
		gpu = gpus[0]
		chip_text = str(gpu.get('name'))

		if gpu.get('vram_total_gb'):
			chip_text += ' · ' + str(gpu.get('vram_total_gb')) + ' GB'
		chips.append((chip_text, 'is-good'))
	else:
		chips.append(('CPU inference', 'is-warn'))

	execution_providers = hardware_profile.get('execution_providers') or []

	if execution_providers:
		chips.append((', '.join([ execution_provider.upper() for execution_provider in execution_providers ]), 'is-accent'))

	if 'h264_nvenc' in (hardware_profile.get('video_encoders') or []):
		chips.append(('NVENC', 'is-accent'))

	if state_manager.get_item('content_analyser_enabled'):
		chips.append(('NSFW filter on', 'is-warn'))
	else:
		chips.append(('NSFW filter off', 'is-accent'))

	chip_html = ''.join([ '<span class="ff-chip ' + chip_class + '">' + chip_text + '</span>' for chip_text, chip_class in chips ])
	subtitle = hardware.TIER_LABELS.get(hardware_preset.get('tier'), 'Custom') + ' profile · ' + hardware.HARDWARE_PRESET_MODE_LABELS.get(preset_mode, preset_mode)
	return\
	(
		'<div class="ff-hero">'
		'<div class="ff-hero-title"><span class="ff-logo">🎭</span><span>' + metadata.get('name') + ' Studio'
		'<span class="ff-hero-subtitle">' + metadata.get('version') + ' · ' + subtitle + '</span></span></div>'
		'<div class="ff-hero-chips">' + chip_html + '</div>'
		'</div>'
	)


def render() -> gradio.Blocks:
	hardware_component.apply_startup_preset()

	with gradio.Blocks() as layout:
		gradio.HTML(create_hero())
		with gradio.Row():
			with gradio.Column(scale = 20):
				with gradio.Accordion(translator.get('uis.section_setup'), open = True, elem_classes = [ 'ff-section' ]):
					with gradio.Blocks(elem_classes = [ 'ff-panel' ]):
						source.render()
					with gradio.Blocks(elem_classes = [ 'ff-panel' ]):
						target.render()
				with gradio.Accordion(translator.get('uis.section_preview'), open = True, elem_classes = [ 'ff-section' ]):
					with gradio.Blocks(elem_classes = [ 'ff-panel' ]):
						preview.render()
						preview_options.render()
					with gradio.Blocks(elem_classes = [ 'ff-panel' ]):
						trim_frame.render()
			with gradio.Column(scale = 20):
				with gradio.Accordion(translator.get('uis.section_processors'), open = True, elem_classes = [ 'ff-section' ]):
					with gradio.Blocks(elem_classes = [ 'ff-panel' ]):
						processors.render()
					with gradio.Blocks(elem_classes = [ 'ff-panel' ]):
						age_modifier_options.render()
						background_remover_options.render()
						deep_swapper_options.render()
						expression_restorer_options.render()
						face_debugger_options.render()
						face_editor_options.render()
						face_enhancer_options.render()
						face_swapper_options.render()
						frame_colorizer_options.render()
						frame_enhancer_options.render()
						lip_syncer_options.render()
						voice_extractor.render()
				with gradio.Accordion(translator.get('uis.section_faces'), open = False, elem_classes = [ 'ff-section' ]):
					with gradio.Blocks(elem_classes = [ 'ff-panel' ]):
						face_selector.render()
						face_tracker.render()
						face_masker.render()
						face_detector.render()
						face_landmarker.render()
				with gradio.Accordion(translator.get('uis.section_media'), open = False, elem_classes = [ 'ff-section' ]):
					with gradio.Blocks(elem_classes = [ 'ff-panel' ]):
						temp_frame.render()
						output_options.render()
				with gradio.Accordion(translator.get('uis.section_performance'), open = False, elem_classes = [ 'ff-section' ]):
					with gradio.Blocks(elem_classes = [ 'ff-panel' ]):
						workflow.render()
						execution.render()
						execution_thread_count.render()
						memory.render()
						download.render()
			with gradio.Column(scale = 20):
				with gradio.Blocks(elem_classes = [ 'ff-panel', 'ff-sticky' ]):
					with gradio.Accordion(translator.get('uis.section_hardware'), open = True, elem_classes = [ 'ff-section' ]):
						with gradio.Blocks(elem_classes = [ 'ff-panel' ]):
							hardware_component.render()
					with gradio.Accordion(translator.get('uis.section_run'), open = True, elem_classes = [ 'ff-section' ]):
						with gradio.Blocks(elem_classes = [ 'ff-panel' ]):
							ui_workflow.render()
							instant_runner.render()
							job_runner.render()
					with gradio.Accordion(translator.get('uis.section_result'), open = True, elem_classes = [ 'ff-section' ]):
						with gradio.Blocks(elem_classes = [ 'ff-panel' ]):
							output.render()
					with gradio.Accordion(translator.get('uis.section_terminal'), open = False, elem_classes = [ 'ff-section' ]):
						with gradio.Blocks(elem_classes = [ 'ff-panel' ]):
							terminal.render()
		with gradio.Accordion(translator.get('uis.section_jobs'), open = False, elem_classes = [ 'ff-section' ]):
			with gradio.Row():
				with gradio.Column(scale = 8):
					job_manager.render()
					job_list_options.render()
				with gradio.Column(scale = 20):
					job_list.render()
		with gradio.Accordion(translator.get('uis.section_about'), open = False, elem_classes = [ 'ff-section' ]):
			about.render()
	return layout


def listen() -> None:
	hardware_component.listen()
	processors.listen()
	age_modifier_options.listen()
	background_remover_options.listen()
	deep_swapper_options.listen()
	expression_restorer_options.listen()
	face_debugger_options.listen()
	face_detector.listen()
	face_editor_options.listen()
	face_enhancer_options.listen()
	face_landmarker.listen()
	face_masker.listen()
	face_selector.listen()
	face_swapper_options.listen()
	face_tracker.listen()
	frame_colorizer_options.listen()
	frame_enhancer_options.listen()
	lip_syncer_options.listen()
	voice_extractor.listen()
	execution.listen()
	execution_thread_count.listen()
	download.listen()
	memory.listen()
	temp_frame.listen()
	output_options.listen()
	source.listen()
	target.listen()
	output.listen()
	instant_runner.listen()
	job_runner.listen()
	job_manager.listen()
	job_list.listen()
	job_list_options.listen()
	terminal.listen()
	preview.listen()
	preview_options.listen()
	trim_frame.listen()
	workflow.listen()


def run(ui : gradio.Blocks) -> None:
	ui.launch(favicon_path = 'facefusion.ico', inbrowser = state_manager.get_item('open_browser'))
