import importlib
import logging
import os
import warnings
from types import ModuleType
from typing import Any, Dict, List, Optional

import gradio
from gradio.themes import Size

import facefusion.uis.overrides as uis_overrides
from facefusion import logger, metadata, state_manager, translator
from facefusion.exit_helper import hard_exit
from facefusion.filesystem import resolve_relative_path
from facefusion.uis.types import Component, ComponentName

UI_COMPONENTS: Dict[ComponentName, Component] = {}
UI_LAYOUT_MODULES : List[ModuleType] = []
UI_LAYOUT_METHODS =\
[
	'pre_check',
	'render',
	'listen',
	'run'
]


def load_ui_layout_module(ui_layout : str) -> Any:
	try:
		ui_layout_module = importlib.import_module('facefusion.uis.layouts.' + ui_layout)
		for method_name in UI_LAYOUT_METHODS:
			if not hasattr(ui_layout_module, method_name):
				raise NotImplementedError
	except ModuleNotFoundError as exception:
		logger.error(translator.get('ui_layout_not_loaded').format(ui_layout = ui_layout), __name__)
		logger.debug(exception.msg, __name__)
		hard_exit(1)
	except NotImplementedError:
		logger.error(translator.get('ui_layout_not_implemented').format(ui_layout = ui_layout), __name__)
		hard_exit(1)
	return ui_layout_module


def get_ui_layouts_modules(ui_layouts : List[str]) -> List[ModuleType]:
	if not UI_LAYOUT_MODULES:
		for ui_layout in ui_layouts:
			ui_layout_module = load_ui_layout_module(ui_layout)
			UI_LAYOUT_MODULES.append(ui_layout_module)
	return UI_LAYOUT_MODULES


def get_ui_component(component_name : ComponentName) -> Optional[Component]:
	if component_name in UI_COMPONENTS:
		return UI_COMPONENTS[component_name]
	return None


def get_ui_components(component_names : List[ComponentName]) -> Optional[List[Component]]:
	ui_components = []

	for component_name in component_names:
		component = get_ui_component(component_name)
		if component:
			ui_components.append(component)
	return ui_components


def register_ui_component(component_name : ComponentName, component: Component) -> None:
	UI_COMPONENTS[component_name] = component


def init() -> None:
	os.environ['GRADIO_ANALYTICS_ENABLED'] = '0'
	os.environ['GRADIO_TEMP_DIR'] = os.path.join(state_manager.get_item('temp_path'), 'gradio')

	logging.getLogger('asyncio').setLevel(logging.CRITICAL)
	warnings.filterwarnings('ignore', category = UserWarning, module = 'gradio')
	gradio.processing_utils._check_allowed = uis_overrides.mock
	gradio.processing_utils.convert_video_to_playable_mp4 = uis_overrides.convert_video_to_playable_mp4
	gradio.components.Number.raise_if_out_of_bounds = uis_overrides.mock


def launch() -> None:
	ui_layouts_total = len(state_manager.get_item('ui_layouts'))
	with create_blocks() as ui:
		for ui_layout in state_manager.get_item('ui_layouts'):
			ui_layout_module = load_ui_layout_module(ui_layout)

			if ui_layouts_total > 1:
				with gradio.Tab(ui_layout):
					ui_layout_module.render()
					ui_layout_module.listen()
			else:
				ui_layout_module.render()
				ui_layout_module.listen()

	for ui_layout in state_manager.get_item('ui_layouts'):
		ui_layout_module = load_ui_layout_module(ui_layout)
		ui_layout_module.run(ui)


def get_theme() -> gradio.Theme:
	return gradio.themes.Base(
		primary_hue = gradio.themes.Color(
			name = 'ios_blue',
			c50 = '#eaf4ff',
			c100 = '#d4eaff',
			c200 = '#a8d5ff',
			c300 = '#75bdff',
			c400 = '#41a3ff',
			c500 = '#0a84ff',
			c600 = '#0a6ee0',
			c700 = '#0a58b3',
			c800 = '#0a4488',
			c900 = '#08325f',
			c950 = '#04203d'
		),
		neutral_hue = gradio.themes.Color(
			name = 'graphite',
			c50 = '#f5f5f7',
			c100 = '#e8e8ed',
			c200 = '#d2d2d7',
			c300 = '#b0b0b8',
			c400 = '#86868b',
			c500 = '#6e6e73',
			c600 = '#48484a',
			c700 = '#3a3a3c',
			c800 = '#2c2c2e',
			c900 = '#1c1c1e',
			c950 = '#0d0d0f'
		),
		radius_size = Size(
			xxs = '0.5rem',
			xs = '0.65rem',
			sm = '0.75rem',
			md = '0.95rem',
			lg = '1.15rem',
			xl = '1.35rem',
			xxl = '1.6rem'
		),
		font = [
			'-apple-system',
			'BlinkMacSystemFont',
			'SF Pro Display',
			'SF Pro Text',
			'Segoe UI Variable Display',
			'Segoe UI',
			'Inter',
			'Helvetica Neue',
			'Ubuntu',
			'Cantarell',
			'sans-serif'
		],
		font_mono = [
			'SF Mono',
			'ui-monospace',
			'JetBrains Mono',
			'Cascadia Code',
			'Consolas',
			'Liberation Mono',
			'monospace'
		]
	).set(
		body_background_fill = '#000000',
		body_background_fill_dark = '#000000',
		body_text_color = '#1c1c1e',
		body_text_color_dark = '#f5f5f7',
		body_text_color_subdued = '#6e6e73',
		body_text_color_subdued_dark = '#a1a1a6',
		background_fill_primary = '#ffffff',
		background_fill_primary_dark = '#1c1c1e',
		background_fill_secondary = '#f5f5f7',
		background_fill_secondary_dark = '#2c2c2e',
		panel_background_fill = '#f5f5f7',
		panel_background_fill_dark = '#141416',
		panel_border_color = 'transparent',
		panel_border_color_dark = 'transparent',
		panel_border_width = '0',
		panel_border_width_dark = '0',
		container_radius = '1.15rem',
		embed_radius = '1.15rem',
		block_radius = '1.15rem',
		block_shadow = 'none',
		block_shadow_dark = 'none',
		block_border_color = 'transparent',
		block_border_color_dark = 'transparent',
		block_border_width = '0',
		block_border_width_dark = '0',
		block_background_fill = '#ffffff',
		block_background_fill_dark = '#1c1c1e',
		block_label_background_fill = 'transparent',
		block_label_background_fill_dark = 'transparent',
		block_label_border_width = '0',
		block_label_border_color = 'transparent',
		block_label_border_color_dark = 'transparent',
		block_label_text_color = '#6e6e73',
		block_label_text_color_dark = '#8e8e93',
		block_label_text_size = '0.7rem',
		block_label_text_weight = '600',
		block_label_margin = '0.125rem',
		block_label_padding = '0.125rem 0.25rem',
		block_label_radius = '0.5rem',
		block_label_right_radius = '0.5rem',
		block_label_shadow = 'none',
		block_title_background_fill = 'transparent',
		block_title_background_fill_dark = 'transparent',
		block_title_border_width = '0',
		block_title_border_color = 'transparent',
		block_title_border_color_dark = 'transparent',
		block_title_text_color = '#6e6e73',
		block_title_text_color_dark = '#f5f5f7',
		block_title_text_size = '0.95rem',
		block_title_text_weight = '650',
		block_title_padding = '0.5rem 0.25rem',
		block_title_radius = '0.75rem',
		block_info_text_color = '#8e8e93',
		block_info_text_color_dark = '#8e8e93',
		border_color_primary = 'transparent',
		border_color_primary_dark = 'transparent',
		border_color_accent = 'transparent',
		border_color_accent_dark = 'transparent',
		border_color_accent_subdued = 'transparent',
		border_color_accent_subdued_dark = 'transparent',
		color_accent = '#0a84ff',
		color_accent_soft = 'rgba(10, 132, 255, 0.12)',
		color_accent_soft_dark = 'rgba(10, 132, 255, 0.18)',
		input_background_fill = '#f2f2f7',
		input_background_fill_dark = '#2c2c2e',
		input_background_fill_focus = '#ffffff',
		input_background_fill_focus_dark = '#2c2c2e',
		input_border_color = 'transparent',
		input_border_color_dark = 'transparent',
		input_border_color_focus = 'rgba(10, 132, 255, 0.75)',
		input_border_color_focus_dark = 'rgba(10, 132, 255, 0.75)',
		input_border_width = '1px',
		input_border_width_dark = '1px',
		input_radius = '0.75rem',
		input_shadow = 'none',
		input_shadow_dark = 'none',
		input_shadow_focus = '0 0 0 3px rgba(10, 132, 255, 0.28)',
		input_shadow_focus_dark = '0 0 0 3px rgba(10, 132, 255, 0.28)',
		input_placeholder_color = '#a1a1a6',
		input_placeholder_color_dark = '#6e6e73',
		input_text_size = '0.9rem',
		button_large_radius = '999px',
		button_large_padding = '0.75rem 1.5rem',
		button_large_text_size = '0.95rem',
		button_large_text_weight = '600',
		button_medium_radius = '999px',
		button_medium_text_size = '0.9rem',
		button_medium_text_weight = '600',
		button_small_radius = '999px',
		button_small_padding = '0.5rem 1rem',
		button_small_text_size = '0.82rem',
		button_small_text_weight = '600',
		button_border_width = '0',
		button_border_width_dark = '0',
		button_primary_background_fill = 'linear-gradient(180deg, #2292ff, #0a6ee0)',
		button_primary_background_fill_dark = 'linear-gradient(180deg, #2292ff, #0a6ee0)',
		button_primary_background_fill_hover = 'linear-gradient(180deg, #3aa0ff, #0f7bf0)',
		button_primary_background_fill_hover_dark = 'linear-gradient(180deg, #3aa0ff, #0f7bf0)',
		button_primary_border_color = 'transparent',
		button_primary_border_color_dark = 'transparent',
		button_primary_border_color_hover = 'transparent',
		button_primary_border_color_hover_dark = 'transparent',
		button_primary_text_color = '#ffffff',
		button_primary_text_color_dark = '#ffffff',
		button_primary_text_color_hover = '#ffffff',
		button_primary_text_color_hover_dark = '#ffffff',
		button_secondary_background_fill = 'rgba(120, 120, 128, 0.16)',
		button_secondary_background_fill_dark = '#2c2c2e',
		button_secondary_background_fill_hover = 'rgba(120, 120, 128, 0.24)',
		button_secondary_background_fill_hover_dark = '#3a3a3c',
		button_secondary_border_color = 'transparent',
		button_secondary_border_color_dark = 'transparent',
		button_secondary_border_color_hover = 'transparent',
		button_secondary_border_color_hover_dark = 'transparent',
		button_secondary_text_color = '#1c1c1e',
		button_secondary_text_color_dark = '#f5f5f7',
		button_secondary_text_color_hover = '#1c1c1e',
		button_secondary_text_color_hover_dark = '#f5f5f7',
		checkbox_background_color = '#e8e8ed',
		checkbox_background_color_dark = '#3a3a3c',
		checkbox_background_color_hover = '#dcdce2',
		checkbox_background_color_hover_dark = '#48484a',
		checkbox_background_color_focus = '#3a3a3c',
		checkbox_background_color_focus_dark = '#48484a',
		checkbox_background_color_selected = '#0a84ff',
		checkbox_background_color_selected_dark = '#0a84ff',
		checkbox_border_color = 'rgba(120, 120, 128, 0.4)',
		checkbox_border_color_dark = 'rgba(255, 255, 255, 0.24)',
		checkbox_border_color_hover = 'rgba(120, 120, 128, 0.6)',
		checkbox_border_color_hover_dark = 'rgba(255, 255, 255, 0.4)',
		checkbox_border_color_focus = '#0a84ff',
		checkbox_border_color_focus_dark = '#0a84ff',
		checkbox_border_color_selected = '#0a84ff',
		checkbox_border_color_selected_dark = '#0a84ff',
		checkbox_border_radius = '0.575rem',
		checkbox_border_width = '1.5px',
		checkbox_border_width_dark = '1.5px',
		checkbox_shadow = 'none',
		checkbox_label_background_fill = 'rgba(120, 120, 128, 0.12)',
		checkbox_label_background_fill_dark = 'rgba(44, 44, 46, 0.65)',
		checkbox_label_background_fill_hover = 'rgba(120, 120, 128, 0.2)',
		checkbox_label_background_fill_hover_dark = 'rgba(58, 58, 60, 0.85)',
		checkbox_label_background_fill_selected = 'rgba(10, 132, 255, 0.16)',
		checkbox_label_background_fill_selected_dark = 'rgba(10, 132, 255, 0.2)',
		checkbox_label_border_color = 'rgba(120, 120, 128, 0.24)',
		checkbox_label_border_color_dark = 'rgba(255, 255, 255, 0.1)',
		checkbox_label_border_color_hover = 'rgba(120, 120, 128, 0.4)',
		checkbox_label_border_color_hover_dark = 'rgba(255, 255, 255, 0.2)',
		checkbox_label_border_color_selected = 'rgba(10, 132, 255, 0.6)',
		checkbox_label_border_color_selected_dark = 'rgba(10, 132, 255, 0.6)',
		checkbox_label_border_width = '1px',
		checkbox_label_border_width_dark = '1px',
		checkbox_label_padding = '0.35rem 0.8rem',
		checkbox_label_shadow = 'none',
		checkbox_label_text_color = '#3a3a3c',
		checkbox_label_text_color_dark = '#d2d2d7',
		checkbox_label_text_color_selected = '#0a58b3',
		checkbox_label_text_color_selected_dark = '#cfe6ff',
		checkbox_label_text_size = '0.82rem',
		checkbox_label_text_weight = '550',
		checkbox_label_gap = '0.35rem',
		error_background_fill = '#ffe5e5',
		error_background_fill_dark = 'rgba(255, 69, 58, 0.12)',
		error_border_color = '#ff453a',
		error_border_color_dark = 'rgba(255, 69, 58, 0.5)',
		error_icon_color = '#ff453a',
		error_icon_color_dark = '#ff6961',
		error_text_color = '#c2261d',
		error_text_color_dark = '#ff9a93',
		link_text_color = '#0a6ee0',
		link_text_color_dark = '#4aa3ff',
		link_text_color_hover = '#0a84ff',
		link_text_color_hover_dark = '#7cbcff',
		link_text_color_active = '#0a84ff',
		link_text_color_active_dark = '#7cbcff',
		link_text_color_visited = '#bf5af2',
		link_text_color_visited_dark = '#d9a3ff',
		loader_color = '#0a84ff',
		loader_color_dark = '#0a84ff',
		slider_color = '#0a84ff',
		slider_color_dark = '#0a84ff',
		radio_circle = '#ffffff',
		shadow_drop = 'rgba(0, 0, 0, 0.08)',
		shadow_drop_lg = 'rgba(0, 0, 0, 0.12)',
		shadow_inset = 'rgba(255, 255, 255, 0.5)',
		shadow_spread = '0',
		shadow_spread_dark = '0',
		stat_background_fill = 'rgba(120, 120, 128, 0.12)',
		stat_background_fill_dark = 'rgba(44, 44, 46, 0.7)',
		table_border_color = 'rgba(120, 120, 128, 0.2)',
		table_border_color_dark = 'rgba(255, 255, 255, 0.08)',
		table_even_background_fill = '#ffffff',
		table_even_background_fill_dark = '#1c1c1e',
		table_odd_background_fill = '#f5f5f7',
		table_odd_background_fill_dark = '#232325',
		table_radius = '0.75rem',
		table_row_focus = 'rgba(10, 132, 255, 0.16)',
		table_row_focus_dark = 'rgba(10, 132, 255, 0.22)',
		table_text_color = '#3a3a3c',
		table_text_color_dark = '#f5f5f7',
		accordion_text_color = '#1c1c1e',
		accordion_text_color_dark = '#f5f5f7',
		section_header_text_size = '0.95rem',
		section_header_text_weight = '650',
		prose_text_size = '0.9rem',
		layout_gap = '0.85rem',
		form_gap_width = '0.85rem',
		input_padding = '0.65rem 0.8rem',
		code_background_fill = '#f2f2f7',
		code_background_fill_dark = '#101012'
	)


def get_css() -> str:
	css = []
	for css_path in [ 'uis/assets/overrides.css', 'uis/assets/apple.css' ]:
		with open(resolve_relative_path(css_path)) as css_file:
			css.append(css_file.read())
	return chr(10).join(css)


FORCE_DARK_JS = """
() => {
	const force_dark_mode = () =>
	{
		document.body.classList.add('dark');
		document.documentElement.classList.add('dark');
		document.documentElement.style.colorScheme = 'dark';
	};
	force_dark_mode();
	setTimeout(force_dark_mode, 100);
	setTimeout(force_dark_mode, 500);
	setTimeout(force_dark_mode, 1500);
}
"""


def create_blocks() -> gradio.Blocks:
	return gradio.Blocks(theme = get_theme(), css = get_css(), js = FORCE_DARK_JS, title = metadata.get('name') + ' ' + metadata.get('version'), fill_width = True)
