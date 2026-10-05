from typing import Any, List, Optional, Tuple

import gradio

from facefusion import state_manager, translator
from facefusion.common_helper import calculate_float_step
from facefusion.processors.core import load_processor_module
from facefusion.processors.modules.rtx_upscaler import choices as rtx_upscaler_choices
from facefusion.processors.modules.rtx_upscaler.types import RtxUpscalerQuality, RtxUpscalerScale
from facefusion.uis.core import get_ui_component, register_ui_component

RTX_UPSCALER_SCALE_DROPDOWN : Optional[gradio.Dropdown] = None
RTX_UPSCALER_QUALITY_DROPDOWN : Optional[gradio.Dropdown] = None
RTX_UPSCALER_STRENGTH_SLIDER : Optional[gradio.Slider] = None
RTX_UPSCALER_BLEND_SLIDER : Optional[gradio.Slider] = None
RTX_UPSCALER_STATUS_MARKDOWN : Optional[gradio.Markdown] = None


def render() -> None:
	global RTX_UPSCALER_SCALE_DROPDOWN
	global RTX_UPSCALER_QUALITY_DROPDOWN
	global RTX_UPSCALER_STRENGTH_SLIDER
	global RTX_UPSCALER_BLEND_SLIDER
	global RTX_UPSCALER_STATUS_MARKDOWN

	has_rtx_upscaler = 'rtx_upscaler' in state_manager.get_item('processors')

	RTX_UPSCALER_STATUS_MARKDOWN = gradio.Markdown(
		value = get_status_text(),
		visible = has_rtx_upscaler,
		elem_classes = [ 'ff-hint' ]
	)
	with gradio.Row(visible = has_rtx_upscaler):
		RTX_UPSCALER_SCALE_DROPDOWN = gradio.Dropdown(
			label = translator.get('uis.scale_dropdown', 'facefusion.processors.modules.rtx_upscaler'),
			choices = [ ( str(scale) + 'x' if scale > 1 else '1x (cleanup only)', scale ) for scale in rtx_upscaler_choices.rtx_upscaler_scales ],
			value = state_manager.get_item('rtx_upscaler_scale')
		)
		RTX_UPSCALER_QUALITY_DROPDOWN = gradio.Dropdown(
			label = translator.get('uis.quality_dropdown', 'facefusion.processors.modules.rtx_upscaler'),
			choices = rtx_upscaler_choices.rtx_upscaler_quality_levels,
			value = state_manager.get_item('rtx_upscaler_quality')
		)
	RTX_UPSCALER_STRENGTH_SLIDER = gradio.Slider(
		label = translator.get('uis.strength_slider', 'facefusion.processors.modules.rtx_upscaler'),
		value = state_manager.get_item('rtx_upscaler_strength'),
		step = calculate_float_step(rtx_upscaler_choices.rtx_upscaler_strength_range),
		minimum = rtx_upscaler_choices.rtx_upscaler_strength_range[0],
		maximum = rtx_upscaler_choices.rtx_upscaler_strength_range[-1],
		visible = has_rtx_upscaler
	)
	RTX_UPSCALER_BLEND_SLIDER = gradio.Slider(
		label = translator.get('uis.blend_slider', 'facefusion.processors.modules.rtx_upscaler'),
		value = state_manager.get_item('rtx_upscaler_blend'),
		step = 5,
		minimum = rtx_upscaler_choices.rtx_upscaler_blend_range[0],
		maximum = rtx_upscaler_choices.rtx_upscaler_blend_range[-1],
		visible = has_rtx_upscaler
	)

	register_ui_component('rtx_upscaler_scale_dropdown', RTX_UPSCALER_SCALE_DROPDOWN)
	register_ui_component('rtx_upscaler_quality_dropdown', RTX_UPSCALER_QUALITY_DROPDOWN)
	register_ui_component('rtx_upscaler_strength_slider', RTX_UPSCALER_STRENGTH_SLIDER)
	register_ui_component('rtx_upscaler_blend_slider', RTX_UPSCALER_BLEND_SLIDER)


def get_status_text() -> str:
	rtx_upscaler_module = load_processor_module('rtx_upscaler')

	if rtx_upscaler_module.is_rtx_upscaler_available():
		return translator.get('rtx_upscaler_ready')
	return rtx_upscaler_module.get_unavailable_message()


def listen() -> None:
	RTX_UPSCALER_SCALE_DROPDOWN.change(update_scale, inputs = RTX_UPSCALER_SCALE_DROPDOWN, outputs = RTX_UPSCALER_SCALE_DROPDOWN)
	RTX_UPSCALER_QUALITY_DROPDOWN.change(update_quality, inputs = RTX_UPSCALER_QUALITY_DROPDOWN, outputs = RTX_UPSCALER_QUALITY_DROPDOWN)
	RTX_UPSCALER_STRENGTH_SLIDER.release(update_strength, inputs = RTX_UPSCALER_STRENGTH_SLIDER)
	RTX_UPSCALER_BLEND_SLIDER.release(update_blend, inputs = RTX_UPSCALER_BLEND_SLIDER)

	processors_checkbox_group = get_ui_component('processors_checkbox_group')
	if processors_checkbox_group:
		processors_checkbox_group.change(remote_update, inputs = processors_checkbox_group, outputs = get_rtx_upscaler_outputs())


def get_rtx_upscaler_outputs() -> List[Any]:
	return [ RTX_UPSCALER_STATUS_MARKDOWN, RTX_UPSCALER_SCALE_DROPDOWN, RTX_UPSCALER_QUALITY_DROPDOWN, RTX_UPSCALER_STRENGTH_SLIDER, RTX_UPSCALER_BLEND_SLIDER ]


def remote_update(processors : List[str]) -> Tuple[gradio.Markdown, gradio.Dropdown, gradio.Dropdown, gradio.Slider, gradio.Slider]:
	has_rtx_upscaler = 'rtx_upscaler' in processors

	return gradio.Markdown(value = get_status_text(), visible = has_rtx_upscaler), gradio.Dropdown(visible = has_rtx_upscaler), gradio.Dropdown(visible = has_rtx_upscaler), gradio.Slider(visible = has_rtx_upscaler), gradio.Slider(visible = has_rtx_upscaler)


def update_scale(rtx_upscaler_scale : RtxUpscalerScale) -> gradio.Dropdown:
	load_processor_module('rtx_upscaler').clear_inference_pool()
	state_manager.set_item('rtx_upscaler_scale', int(rtx_upscaler_scale))
	return gradio.Dropdown(value = state_manager.get_item('rtx_upscaler_scale'))


def update_quality(rtx_upscaler_quality : RtxUpscalerQuality) -> gradio.Dropdown:
	load_processor_module('rtx_upscaler').clear_inference_pool()
	state_manager.set_item('rtx_upscaler_quality', rtx_upscaler_quality)
	return gradio.Dropdown(value = state_manager.get_item('rtx_upscaler_quality'))


def update_strength(rtx_upscaler_strength : float) -> None:
	state_manager.set_item('rtx_upscaler_strength', float(rtx_upscaler_strength))


def update_blend(rtx_upscaler_blend : float) -> None:
	state_manager.set_item('rtx_upscaler_blend', int(rtx_upscaler_blend))
