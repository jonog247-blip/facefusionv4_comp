from typing import Any, Dict, List, Optional, Tuple

import gradio

import facefusion.choices
from facefusion import config, hardware, state_manager, translator
from facefusion.processors.modules.face_swapper import choices as face_swapper_choices
from facefusion.types import HardwarePreset, HardwarePresetMode
from facefusion.uis.core import get_ui_component, register_ui_component
from facefusion.uis.types import ComponentName

HARDWARE_REPORT_MARKDOWN : Optional[gradio.Markdown] = None
HARDWARE_PRESET_MODE_DROPDOWN : Optional[gradio.Dropdown] = None
HARDWARE_AUTO_PRESET_CHECKBOX : Optional[gradio.Checkbox] = None
HARDWARE_DETECT_BUTTON : Optional[gradio.Button] = None
HARDWARE_APPLY_BUTTON : Optional[gradio.Button] = None
CONTENT_ANALYSER_CHECKBOX : Optional[gradio.Checkbox] = None

PRESET_OUTPUT_KEYS : List[ComponentName] =\
[
	'execution_providers_checkbox_group',
	'execution_thread_count_slider',
	'video_memory_strategy_dropdown',
	'face_detector_model_dropdown',
	'face_detector_size_dropdown',
	'face_landmarker_model_dropdown',
	'face_swapper_model_dropdown',
	'face_swapper_pixel_boost_dropdown',
	'face_swapper_weight_slider',
	'face_enhancer_model_dropdown',
	'face_enhancer_blend_slider',
	'temp_frame_format_dropdown',
	'output_image_quality_slider',
	'output_video_quality_slider',
	'output_video_encoder_dropdown',
	'output_video_preset_dropdown'
]

CACHED_PROFILE : Dict[str, Any] = {}
CACHED_PRESET : Dict[str, Any] = {}


def apply_startup_preset() -> None:
	hardware_profile = hardware.detect_hardware_profile()
	preset_mode = hardware.resolve_preset_mode(state_manager.get_item('hardware_preset_mode'))
	hardware_preset = hardware.create_hardware_preset(hardware_profile, preset_mode)

	CACHED_PROFILE['profile'] = hardware_profile
	CACHED_PRESET['preset'] = hardware_preset

	if state_manager.get_item('hardware_auto_preset'):
		hardware.apply_hardware_preset(hardware_preset)


def get_cached_profile() -> Any:
	if not CACHED_PROFILE.get('profile'):
		apply_startup_preset()
	return CACHED_PROFILE.get('profile')


def get_cached_preset() -> HardwarePreset:
	if not CACHED_PRESET.get('preset'):
		apply_startup_preset()
	return CACHED_PRESET.get('preset')


def render() -> None:
	global HARDWARE_REPORT_MARKDOWN
	global HARDWARE_PRESET_MODE_DROPDOWN
	global HARDWARE_AUTO_PRESET_CHECKBOX
	global HARDWARE_DETECT_BUTTON
	global HARDWARE_APPLY_BUTTON
	global CONTENT_ANALYSER_CHECKBOX

	preset_mode = hardware.resolve_preset_mode(state_manager.get_item('hardware_preset_mode'))

	HARDWARE_REPORT_MARKDOWN = gradio.Markdown(
		value = hardware.format_hardware_report(get_cached_profile(), get_cached_preset()),
		elem_classes = [ 'ff-note', 'ff-markdown', 'ff-card' ]
	)
	with gradio.Row():
		HARDWARE_PRESET_MODE_DROPDOWN = gradio.Dropdown(
			label = translator.get('uis.hardware_preset_mode_dropdown'),
			choices = [ ( hardware.HARDWARE_PRESET_MODE_LABELS.get(preset_mode), preset_mode ) for preset_mode in facefusion.choices.hardware_preset_modes ],
			value = preset_mode,
			interactive = True
		)
		HARDWARE_AUTO_PRESET_CHECKBOX = gradio.Checkbox(
			label = translator.get('uis.hardware_auto_preset_checkbox'),
			value = bool(state_manager.get_item('hardware_auto_preset')),
			info = translator.get('uis.hardware_auto_preset_info')
		)
	with gradio.Row():
		HARDWARE_DETECT_BUTTON = gradio.Button(
			value = translator.get('uis.hardware_detect_button'),
			variant = 'secondary',
			size = 'sm'
		)
		HARDWARE_APPLY_BUTTON = gradio.Button(
			value = translator.get('uis.hardware_apply_button'),
			variant = 'primary',
			size = 'sm'
		)
	CONTENT_ANALYSER_CHECKBOX = gradio.Checkbox(
		label = translator.get('uis.content_analyser_checkbox'),
		value = bool(state_manager.get_item('content_analyser_enabled')),
		info = translator.get('uis.content_analyser_info')
	)
	register_ui_component('hardware_preset_mode_dropdown', HARDWARE_PRESET_MODE_DROPDOWN)
	register_ui_component('content_analyser_checkbox', CONTENT_ANALYSER_CHECKBOX)


def listen() -> None:
	HARDWARE_DETECT_BUTTON.click(update_report, inputs = [ HARDWARE_PRESET_MODE_DROPDOWN ], outputs = HARDWARE_REPORT_MARKDOWN)
	HARDWARE_APPLY_BUTTON.click(apply_preset, inputs = [ HARDWARE_PRESET_MODE_DROPDOWN ], outputs = get_preset_outputs())
	HARDWARE_PRESET_MODE_DROPDOWN.change(update_report, inputs = HARDWARE_PRESET_MODE_DROPDOWN, outputs = HARDWARE_REPORT_MARKDOWN)
	HARDWARE_AUTO_PRESET_CHECKBOX.change(update_auto_preset, inputs = HARDWARE_AUTO_PRESET_CHECKBOX)
	CONTENT_ANALYSER_CHECKBOX.change(update_content_analyser, inputs = CONTENT_ANALYSER_CHECKBOX)


def get_preset_outputs() -> List[Any]:
	return [ HARDWARE_REPORT_MARKDOWN ] + [ ui_component for ui_component in [ get_ui_component(preset_output_key) for preset_output_key in PRESET_OUTPUT_KEYS ] if ui_component ]


def update_report(preset_mode : HardwarePresetMode) -> str:
	hardware_profile = hardware.detect_hardware_profile(refresh = True)
	hardware_preset = hardware.create_hardware_preset(hardware_profile, preset_mode)
	state_manager.set_item('hardware_preset_mode', preset_mode)
	CACHED_PROFILE['profile'] = hardware_profile
	CACHED_PRESET['preset'] = hardware_preset
	return hardware.format_hardware_report(hardware_profile, hardware_preset)


def apply_preset(preset_mode : HardwarePresetMode) -> Tuple[Any, ...]:
	hardware_profile = hardware.detect_hardware_profile(refresh = True)
	hardware_preset = hardware.create_hardware_preset(hardware_profile, preset_mode)
	hardware.apply_hardware_preset(hardware_preset)
	state_manager.set_item('hardware_preset_mode', preset_mode)
	config.save_value('hardware', 'hardware_preset_mode', preset_mode)
	CACHED_PROFILE['profile'] = hardware_profile
	CACHED_PRESET['preset'] = hardware_preset
	preset_updates = create_preset_updates(hardware_preset)
	return tuple([ hardware.format_hardware_report(hardware_profile, hardware_preset) ] + [ preset_updates.get(preset_output_key, gradio.update()) for preset_output_key in PRESET_OUTPUT_KEYS if get_ui_component(preset_output_key) ])


def update_auto_preset(hardware_auto_preset : bool) -> None:
	state_manager.set_item('hardware_auto_preset', bool(hardware_auto_preset))
	config.save_value('hardware', 'hardware_auto_preset', 'True' if hardware_auto_preset else 'False')


def update_content_analyser(content_analyser_enabled : bool) -> None:
	state_manager.set_item('content_analyser_enabled', bool(content_analyser_enabled))
	config.save_value('content', 'content_analyser_enabled', 'True' if content_analyser_enabled else 'False')


def create_preset_updates(hardware_preset : HardwarePreset) -> Dict[str, Any]:
	settings = hardware_preset.get('settings')
	face_detector_size_choices = facefusion.choices.face_detector_set.get(settings.get('face_detector_model'))
	face_swapper_pixel_boost_choices = face_swapper_choices.face_swapper_set.get(settings.get('face_swapper_model'))
	return\
	{
		'execution_providers_checkbox_group': gradio.CheckboxGroup(value = settings.get('execution_providers')),
		'execution_thread_count_slider': gradio.Slider(value = settings.get('execution_thread_count')),
		'video_memory_strategy_dropdown': gradio.Dropdown(value = settings.get('video_memory_strategy')),
		'face_detector_model_dropdown': gradio.Dropdown(value = settings.get('face_detector_model')),
		'face_detector_size_dropdown': gradio.Dropdown(value = settings.get('face_detector_size'), choices = face_detector_size_choices),
		'face_landmarker_model_dropdown': gradio.Dropdown(value = settings.get('face_landmarker_model')),
		'face_swapper_model_dropdown': gradio.Dropdown(value = settings.get('face_swapper_model')),
		'face_swapper_pixel_boost_dropdown': gradio.Dropdown(value = settings.get('face_swapper_pixel_boost'), choices = face_swapper_pixel_boost_choices),
		'face_swapper_weight_slider': gradio.Slider(value = settings.get('face_swapper_weight')),
		'face_enhancer_model_dropdown': gradio.Dropdown(value = settings.get('face_enhancer_model')),
		'face_enhancer_blend_slider': gradio.Slider(value = settings.get('face_enhancer_blend')),
		'temp_frame_format_dropdown': gradio.Dropdown(value = settings.get('temp_frame_format')),
		'output_image_quality_slider': gradio.Slider(value = settings.get('output_image_quality')),
		'output_video_quality_slider': gradio.Slider(value = settings.get('output_video_quality')),
		'output_video_encoder_dropdown': gradio.Dropdown(value = settings.get('output_video_encoder')),
		'output_video_preset_dropdown': gradio.Dropdown(value = settings.get('output_video_preset'))
	}
