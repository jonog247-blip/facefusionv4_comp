from types import ModuleType
from typing import Iterator, List, Optional

import gradio

import facefusion.choices
from facefusion import content_analyser, face_classifier, face_detector, face_landmarker, face_masker, face_recognizer, inference_manager, state_manager, translator, voice_extractor
from facefusion.filesystem import get_file_name, resolve_file_paths
from facefusion.processors.core import get_processors_modules
from facefusion.types import DownloadProvider

DOWNLOAD_PROVIDERS_CHECKBOX_GROUP : Optional[gradio.CheckboxGroup] = None
DOWNLOAD_MODELS_BUTTON : Optional[gradio.Button] = None
DOWNLOAD_MODELS_MARKDOWN : Optional[gradio.Markdown] = None


def render() -> None:
	global DOWNLOAD_PROVIDERS_CHECKBOX_GROUP
	global DOWNLOAD_MODELS_BUTTON
	global DOWNLOAD_MODELS_MARKDOWN

	DOWNLOAD_PROVIDERS_CHECKBOX_GROUP = gradio.CheckboxGroup(
		label = translator.get('uis.download_providers_checkbox_group'),
		choices = facefusion.choices.download_providers,
		value = state_manager.get_item('download_providers')
	)
	DOWNLOAD_MODELS_MARKDOWN = gradio.Markdown(
		value = translator.get('uis.download_models_info'),
		elem_classes = [ 'ff-hint' ]
	)
	DOWNLOAD_MODELS_BUTTON = gradio.Button(
		translator.get('uis.download_models_button'),
		variant = 'primary',
		elem_classes = [ 'ff-action' ]
	)


def listen() -> None:
	DOWNLOAD_PROVIDERS_CHECKBOX_GROUP.change(update_download_providers, inputs = DOWNLOAD_PROVIDERS_CHECKBOX_GROUP, outputs = DOWNLOAD_PROVIDERS_CHECKBOX_GROUP)
	DOWNLOAD_MODELS_BUTTON.click(fn = download_models, outputs = DOWNLOAD_MODELS_MARKDOWN)


def update_download_providers(download_providers : List[DownloadProvider]) -> gradio.CheckboxGroup:
	for module in get_model_modules():
		if hasattr(module, 'create_static_model_set'):
			module.create_static_model_set.cache_clear()

	download_providers = download_providers or facefusion.choices.download_providers
	state_manager.set_item('download_providers', download_providers)
	return gradio.CheckboxGroup(value = state_manager.get_item('download_providers'))


def download_models() -> Iterator[str]:
	from facefusion import core

	yield translator.get('downloading_models')

	try:
		error_code = core.force_download()
	except Exception:
		yield translator.get('downloading_models_failed')
		return

	for module in get_model_modules():
		if hasattr(module, 'create_static_model_set'):
			module.create_static_model_set.cache_clear()

	inference_manager.clear_inference_pool_set()

	if error_code == 0:
		yield translator.get('downloading_models_succeeded')
	else:
		yield translator.get('downloading_models_failed')


def get_model_modules() -> List[ModuleType]:
	common_modules =\
	[
		content_analyser,
		face_classifier,
		face_detector,
		face_landmarker,
		face_recognizer,
		face_masker,
		voice_extractor
	]
	available_processors = [ get_file_name(file_path) for file_path in resolve_file_paths('facefusion/processors/modules') ]
	return common_modules + get_processors_modules(available_processors)
