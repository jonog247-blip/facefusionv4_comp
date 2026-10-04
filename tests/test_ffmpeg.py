import logging
import os
import subprocess
import tempfile
from types import SimpleNamespace
from typing import Dict

import pytest
from _pytest.logging import LogCaptureFixture
from pytest import approx

import facefusion.choices
import facefusion.ffmpeg
from facefusion import cli_progress, ffmpeg, ffmpeg_builder, ffprobe, ffprobe_builder, process_manager, state_manager
from facefusion.download import conditional_download
from facefusion.ffmpeg import await_process, concat_video, copy_image, extract_frames, finalize_image, fix_audio_encoder, fix_video_encoder, log_debug, merge_video, read_audio_buffer, render_progress, replace_audio, restore_audio, run_ffmpeg, sanitize_audio, sanitize_image, sanitize_video, spawn_frames
from facefusion.ffprobe import extract_video_metadata, probe_audio_entries, probe_video_entries
from facefusion.filesystem import copy_file, get_file_size, is_image
from facefusion.temp_helper import clear_temp_directory, create_temp_directory, get_temp_file_path, resolve_temp_frame_paths, resolve_temp_frame_set
from facefusion.types import EncoderSet
from facefusion.vision import detect_image_resolution, predict_video_frame_total
from .assert_helper import get_test_example_file, get_test_examples_directory, get_test_output_path, prepare_test_output_directory


@pytest.fixture(scope = 'module', autouse = True)
def before_all() -> None:
	state_manager.init()

	process_manager.start()
	state_manager.init_item('temp_path', tempfile.gettempdir())
	state_manager.init_item('temp_frame_format', 'png')
	state_manager.init_item('output_image_quality', 100)
	state_manager.init_item('output_audio_encoder', 'aac')
	state_manager.init_item('output_audio_quality', 100)
	state_manager.init_item('output_audio_volume', 100)
	state_manager.init_item('output_video_encoder', 'libx264')
	state_manager.init_item('output_video_quality', 100)
	state_manager.init_item('output_video_preset', 'ultrafast')

	conditional_download(get_test_examples_directory(),
	[
		'https://github.com/facefusion/facefusion-assets/releases/download/examples-3.0.0/source.jpg',
		'https://github.com/facefusion/facefusion-assets/releases/download/examples-3.0.0/source.mp3',
		'https://github.com/facefusion/facefusion-assets/releases/download/examples-3.0.0/target-240p.mp4'
	])

	ffmpeg.run_ffmpeg(
		ffmpeg_builder.chain(
			ffmpeg_builder.set_input(get_test_example_file('source.mp3')),
			ffmpeg_builder.set_output(get_test_example_file('source.wav'))
		)
	).wait()
	ffmpeg.run_ffmpeg(
		ffmpeg_builder.chain(
			ffmpeg_builder.set_input(get_test_example_file('target-240p.mp4')),
			[
				'-vframes',
				'1'
			],
			ffmpeg_builder.set_output(get_test_example_file('target-240p.jpg'))
		)
	).wait()
	ffmpeg.run_ffmpeg(
		ffmpeg_builder.chain(
			ffmpeg_builder.set_input(get_test_example_file('source.wav')),
			[
				'-metadata',
				'title=invalid'
			],
			ffmpeg_builder.set_output(get_test_example_file('source-metadata.wav'))
		)
	).wait()

	for video_fps in [ 25, 30, 60 ]:
		ffmpeg.run_ffmpeg(
			ffmpeg_builder.chain(
				ffmpeg_builder.set_input(get_test_example_file('target-240p.mp4')),
				ffmpeg_builder.set_video_fps(video_fps),
				ffmpeg_builder.set_output(get_test_example_file('target-240p-' + str(video_fps) + 'fps.mp4'))
			)
		).wait()

	for output_video_format in [ 'avi', 'm4v', 'mkv', 'mov', 'mp4', 'webm', 'wmv' ]:
		ffmpeg.run_ffmpeg(
			ffmpeg_builder.chain(
				ffmpeg_builder.set_input(get_test_example_file('source.mp3')),
				ffmpeg_builder.set_input(get_test_example_file('target-240p.mp4')),
				ffmpeg_builder.set_audio_sample_rate(16000),
				ffmpeg_builder.set_output(get_test_example_file('target-240p-16khz.' + output_video_format))
			)
		).wait()

	ffmpeg.run_ffmpeg(
		ffmpeg_builder.chain(
			ffmpeg_builder.set_input(get_test_example_file('source.mp3')),
			ffmpeg_builder.set_input(get_test_example_file('target-240p.mp4')),
			ffmpeg_builder.set_audio_sample_rate(48000),
			ffmpeg_builder.set_output(get_test_example_file('target-240p-48khz.mp4'))
		)
	).wait()
	ffmpeg.run_ffmpeg(
		ffmpeg_builder.chain(
			ffmpeg_builder.set_input(get_test_example_file('target-240p.mp4')),
			ffmpeg_builder.set_video_encoder('libx265'),
			[
				'-an'
			],
			ffmpeg_builder.set_faststart('mp4'),
			ffmpeg_builder.set_output(get_test_example_file('target-240p-h265.mp4'))
		)
	).wait()
	ffmpeg.run_ffmpeg(
		ffmpeg_builder.chain(
			ffmpeg_builder.set_input(get_test_example_file('source.mp3')),
			ffmpeg_builder.set_input(get_test_example_file('target-240p.mp4')),
			ffmpeg_builder.set_output(get_test_example_file('target-240p-moov-end.mp4'))
		)
	).wait()
	ffmpeg.run_ffmpeg(
		ffmpeg_builder.chain(
			ffmpeg_builder.set_input(get_test_example_file('source.mp3')),
			ffmpeg_builder.set_audio_encoder('alac'),
			ffmpeg_builder.set_faststart('mp4'),
			ffmpeg_builder.set_output(get_test_example_file('source.m4a'))
		)
	).wait()
	ffmpeg.run_ffmpeg(
		ffmpeg_builder.chain(
			ffmpeg_builder.set_input(get_test_example_file('source.mp3')),
			ffmpeg_builder.set_audio_encoder('alac'),
			ffmpeg_builder.set_output(get_test_example_file('source-moov-end.m4a'))
		)
	).wait()
	ffmpeg.run_ffmpeg(
		ffmpeg_builder.chain(
			ffmpeg_builder.set_input(get_test_example_file('target-240p-h265.mp4')),
			ffmpeg_builder.copy_video_encoder(),
			[
				'-metadata',
				'title=invalid'
			],
			ffmpeg_builder.set_faststart('mp4'),
			ffmpeg_builder.set_output(get_test_example_file('target-240p-h265-metadata.mp4'))
		)
	).wait()
	ffmpeg.run_ffmpeg(
		ffmpeg_builder.chain(
			ffmpeg_builder.set_input(get_test_example_file('target-240p.mp4')),
			ffmpeg_builder.copy_video_encoder(),
			ffmpeg_builder.set_faststart('mp4'),
			ffmpeg_builder.set_output(get_test_example_file('target-240p.m4a'))
		)
	).wait()


@pytest.fixture(scope = 'function', autouse = True)
def before_each() -> None:
	prepare_test_output_directory()


def get_available_encoder_set() -> EncoderSet:
	if os.getenv('CI'):
		return\
		{
			'audio': [ 'aac' ],
			'image': [ 'png' ],
			'video': [ 'libx264' ]
		}
	return facefusion.ffmpeg.get_available_encoder_set()


def probe_title_tag(media_path : str) -> Dict[str, str]:
	commands = ffprobe_builder.chain(
		[
			'-show_entries',
			'format_tags=title'
		],
		ffprobe_builder.format_to_key_value(),
		ffprobe_builder.set_input(media_path)
	)
	output, _ = ffprobe.run_ffprobe(commands).communicate()
	return ffprobe.parse_entries(output)


def stop_processing(frame_index : int) -> None:
	process_manager.stop()


def test_run_ffmpeg() -> None:
	commands = ffmpeg_builder.chain(
		ffmpeg_builder.set_input(get_test_example_file('target-240p.mp4')),
		ffmpeg_builder.force_output(get_test_output_path('test-run-ffmpeg.mp4'))
	)

	assert run_ffmpeg(commands).wait() == 0


def test_render_progress() -> None:
	commands = ffmpeg_builder.chain(
		ffmpeg_builder.set_input(get_test_example_file('target-240p.mp4')),
		ffmpeg_builder.force_output(get_test_output_path('test-render-progress.mp4')),
		ffmpeg_builder.set_progress(),
		ffmpeg_builder.cast_stream()
	)
	process = run_ffmpeg(commands)

	with cli_progress.create(total = 270) as progress:
		render_progress(process, progress)

		assert progress.current == 270

	assert process.wait() == 0

	process = run_ffmpeg(commands)
	render_progress(process, SimpleNamespace(seek = stop_processing))

	assert process_manager.is_stopping() is True

	process.wait()
	process_manager.start()


def test_await_process(caplog : LogCaptureFixture) -> None:
	commands = ffmpeg_builder.chain(
		ffmpeg_builder.set_input(get_test_example_file('target-240p.mp4')),
		ffmpeg_builder.force_output(get_test_output_path('test-await-process.mp4'))
	)

	assert await_process(run_ffmpeg(commands)).returncode == 0

	commands = ffmpeg_builder.chain(
		ffmpeg_builder.set_input(get_test_example_file('target-240p.mp4')),
		ffmpeg_builder.set_video_encoder('libx265'),
		ffmpeg_builder.set_video_preset('libx265', 'slow'),
		ffmpeg_builder.force_output(get_test_output_path('test-await-process.mp4'))
	)

	assert await_process(run_ffmpeg(commands)).returncode == 0

	process_manager.end()
	process = await_process(run_ffmpeg(commands))

	assert process.returncode is None

	process.wait()
	process_manager.start()
	caplog.set_level(logging.DEBUG, logger = 'facefusion')
	state_manager.set_item('log_level', 'debug')
	process = await_process(run_ffmpeg(ffmpeg_builder.set_input('invalid')))
	state_manager.clear_item('log_level')

	assert process.returncode > 0
	assert caplog.messages[-1] == '[FACEFUSION.FFMPEG] Error opening input files: No such file or directory'

	process_manager.stop()

	assert not await_process(run_ffmpeg(commands)).wait() == 0

	process_manager.start()


def test_log_debug(caplog : LogCaptureFixture) -> None:
	caplog.set_level(logging.DEBUG, logger = 'facefusion')
	process = subprocess.Popen(ffmpeg_builder.run([ '-i', 'invalid' ]), stderr = subprocess.PIPE, stdout = subprocess.PIPE)
	log_debug(process)

	assert len(caplog.messages) == 3
	assert caplog.messages[1:] == [ '[FACEFUSION.FFMPEG] Error opening input file invalid.', '[FACEFUSION.FFMPEG] Error opening input files: No such file or directory' ]


def test_get_available_encoder_set() -> None:
	available_encoder_set = get_available_encoder_set()

	assert 'aac' in available_encoder_set.get('audio')
	assert 'png' in available_encoder_set.get('image')
	assert 'libx264' in available_encoder_set.get('video')


def test_extract_frames() -> None:
	test_set =\
	[
		(get_test_example_file('target-240p-25fps.mp4'), get_test_example_file('test-extract-frames-0-270.mp4'), 0, 270, 324),
		(get_test_example_file('target-240p-25fps.mp4'), get_test_example_file('test-extract-frames-224-270.mp4'), 224, 270, 55),
		(get_test_example_file('target-240p-25fps.mp4'), get_test_example_file('test-extract-frames-124-224.mp4'), 124, 224, 120),
		(get_test_example_file('target-240p-25fps.mp4'), get_test_example_file('test-extract-frames-0-100.mp4'), 0, 100, 120),
		(get_test_example_file('target-240p-30fps.mp4'), get_test_example_file('test-extract-frames-0-324.mp4'), 0, 324, 324),
		(get_test_example_file('target-240p-30fps.mp4'), get_test_example_file('test-extract-frames-224-324.mp4'), 224, 324, 100),
		(get_test_example_file('target-240p-30fps.mp4'), get_test_example_file('test-extract-frames-124-224.mp4'), 124, 224, 100),
		(get_test_example_file('target-240p-30fps.mp4'), get_test_example_file('test-extract-frames-0-100.mp4'), 0, 100, 100),
		(get_test_example_file('target-240p-60fps.mp4'), get_test_example_file('test-extract-frames-0-648.mp4'), 0, 648, 324),
		(get_test_example_file('target-240p-60fps.mp4'), get_test_example_file('test-extract-frames-224-648.mp4'), 224, 648, 212),
		(get_test_example_file('target-240p-60fps.mp4'), get_test_example_file('test-extract-frames-124-224.mp4'), 124, 224, 50),
		(get_test_example_file('target-240p-60fps.mp4'), get_test_example_file('test-extract-frames-0-100.mp4'), 0, 100, 50)
	]

	for target_path, output_path, trim_frame_start, trim_frame_end, frame_total in test_set:
		create_temp_directory(state_manager.get_temp_path(), output_path)

		assert extract_frames(target_path, output_path, (452, 240), 30.0, trim_frame_start, trim_frame_end) is True
		assert len(resolve_temp_frame_paths(state_manager.get_temp_path(), output_path, state_manager.get_item('temp_frame_format'))) == frame_total
		assert min(resolve_temp_frame_set(state_manager.get_temp_path(), output_path, state_manager.get_item('temp_frame_format'))) == trim_frame_start
		assert max(resolve_temp_frame_set(state_manager.get_temp_path(), output_path, state_manager.get_item('temp_frame_format'))) == trim_frame_start + frame_total - 1
		assert predict_video_frame_total(target_path, 30.0, trim_frame_start, trim_frame_end) == frame_total

		clear_temp_directory(state_manager.get_temp_path(), output_path)

	state_manager.init_item('temp_frame_format', 'jpg')
	target_path = get_test_example_file('target-240p-25fps.mp4')
	output_path = get_test_output_path('test-extract-frames.mp4')
	create_temp_directory(state_manager.get_temp_path(), output_path)

	assert extract_frames(target_path, output_path, (426, 226), 25.0, 0, 3) is True
	assert len(resolve_temp_frame_paths(state_manager.get_temp_path(), output_path, 'jpg')) == 3

	for temp_frame_path in resolve_temp_frame_paths(state_manager.get_temp_path(), output_path, 'jpg'):
		assert get_file_size(temp_frame_path) > 10000

	state_manager.init_item('temp_frame_format', 'png')
	clear_temp_directory(state_manager.get_temp_path(), output_path)


def test_spawn_frames() -> None:
	test_set =\
	[
		(get_test_example_file('source.jpg'), get_test_example_file('test-spawn-frames-0-100.mp4'), 0, 100, 30.0, 100),
		(get_test_example_file('source.jpg'), get_test_example_file('test-spawn-frames-0-150.mp4'), 0, 150, 30.0, 150),
		(get_test_example_file('source.jpg'), get_test_example_file('test-spawn-frames-50-100.mp4'), 50, 100, 25.0, 50),
		(get_test_example_file('source.jpg'), get_test_example_file('test-spawn-frames-0-300.mp4'), 0, 300, 60.0, 300),
		(get_test_example_file('source.jpg'), get_test_example_file('test-spawn-frames-100-200.mp4'), 100, 200, 30.0, 100)
	]

	for target_path, output_path, trim_frame_start, trim_frame_end, temp_video_fps, frame_total in test_set:
		create_temp_directory(state_manager.get_temp_path(), output_path)

		assert spawn_frames(target_path, output_path, (452, 240), temp_video_fps, trim_frame_start, trim_frame_end) is True
		assert len(resolve_temp_frame_paths(state_manager.get_temp_path(), output_path, state_manager.get_item('temp_frame_format'))) == frame_total

		clear_temp_directory(state_manager.get_temp_path(), output_path)


@pytest.mark.xfail(strict = True, raises = AssertionError, reason = 'TESTING_AND_FIXING.md #3')
def test_spawn_frames_with_trim_frame_start() -> None:
	output_path = get_test_output_path('test-spawn-frames-with-trim-frame-start.mp4')
	create_temp_directory(state_manager.get_temp_path(), output_path)
	spawn_frames(get_test_example_file('source.jpg'), output_path, (452, 240), 25.0, 50, 100)
	temp_frame_set = resolve_temp_frame_set(state_manager.get_temp_path(), output_path, state_manager.get_item('temp_frame_format'))
	clear_temp_directory(state_manager.get_temp_path(), output_path)

	assert min(temp_frame_set) == 50


def test_copy_image() -> None:
	target_path = get_test_example_file('target-240p.jpg')
	output_path = get_test_output_path('test-copy-image.jpg')
	create_temp_directory(state_manager.get_temp_path(), output_path)

	assert copy_image(target_path, output_path, (212, 112)) is True
	assert detect_image_resolution(get_temp_file_path(state_manager.get_temp_path(), output_path)) == (212, 112)
	assert copy_image(target_path, output_path, (426, 226)) is True
	assert detect_image_resolution(get_temp_file_path(state_manager.get_temp_path(), output_path)) == (426, 226)
	assert copy_image(get_test_example_file('invalid.jpg'), output_path, (426, 226)) is False

	clear_temp_directory(state_manager.get_temp_path(), output_path)


def test_finalize_image() -> None:
	target_path = get_test_example_file('target-240p.jpg')
	output_path = get_test_output_path('test-finalize-image.jpg')
	create_temp_directory(state_manager.get_temp_path(), output_path)
	copy_image(target_path, output_path, (426, 226))

	assert finalize_image(output_path, (212, 112)) is True
	assert detect_image_resolution(output_path) == (212, 112)
	assert finalize_image(output_path, (426, 226)) is True
	assert detect_image_resolution(output_path) == (426, 226)

	output_file_size = get_file_size(output_path)
	state_manager.init_item('output_image_quality', 10)

	assert finalize_image(output_path, (426, 226)) is True
	assert get_file_size(output_path) < output_file_size

	state_manager.init_item('output_image_quality', 100)
	clear_temp_directory(state_manager.get_temp_path(), output_path)


def test_merge_video() -> None:
	test_set =\
	[
		(get_test_example_file('target-240p-16khz.avi'), get_test_output_path('test-merge-video-240p-16khz.avi')),
		(get_test_example_file('target-240p-16khz.m4v'), get_test_output_path('test-merge-video-240p-16khz.m4v')),
		(get_test_example_file('target-240p-16khz.mkv'), get_test_output_path('test-merge-video-240p-16khz.mkv')),
		(get_test_example_file('target-240p-16khz.mp4'), get_test_output_path('test-merge-video-240p-16khz.mp4')),
		(get_test_example_file('target-240p-16khz.mov'), get_test_output_path('test-merge-video-240p-16khz.mov')),
		(get_test_example_file('target-240p-16khz.webm'), get_test_output_path('test-merge-video-240p-16khz.webm')),
		(get_test_example_file('target-240p-16khz.wmv'), get_test_output_path('test-merge-video-240p-16khz.wmv'))
	]
	output_video_encoders = get_available_encoder_set().get('video')

	for target_path, output_path in test_set:
		for output_video_encoder in output_video_encoders:
			state_manager.init_item('output_path', target_path)
			state_manager.init_item('output_video_fps', 25.0)
			state_manager.init_item('output_video_encoder', output_video_encoder)
			create_temp_directory(state_manager.get_temp_path(), output_path)
			extract_frames(target_path, output_path, (452, 240), 25.0, 0, 1)

			assert merge_video(target_path, output_path, 25.0, 25.0, (452, 240), 0, 1) is True

			clear_temp_directory(state_manager.get_temp_path(), output_path)

	state_manager.init_item('output_video_encoder', 'libx264')
	target_path = get_test_example_file('target-240p-25fps.mp4')
	output_path = get_test_output_path('test-merge-video.mp4')
	create_temp_directory(state_manager.get_temp_path(), output_path)
	extract_frames(target_path, output_path, (426, 226), 25.0, 50, 150)

	assert merge_video(target_path, output_path, 25.0, 25.0, (426, 226), 50, 150) is True

	video_metadata = extract_video_metadata(get_temp_file_path(state_manager.get_temp_path(), output_path))

	assert video_metadata.get('duration') == 4.0
	assert video_metadata.get('frame_total') == 100
	assert video_metadata.get('fps') == 25.0
	assert video_metadata.get('resolution') == (426, 226)

	assert merge_video(target_path, output_path, 25.0, 30.0, (212, 112), 50, 150) is True

	video_metadata = extract_video_metadata(get_temp_file_path(state_manager.get_temp_path(), output_path))

	assert video_metadata.get('duration') == 4.0
	assert video_metadata.get('frame_total') == 120
	assert video_metadata.get('fps') == 30.0
	assert video_metadata.get('resolution') == (212, 112)

	clear_temp_directory(state_manager.get_temp_path(), output_path)


def test_concat_video() -> None:
	output_path = get_test_output_path('test-concat-video.mp4')
	temp_output_paths =\
	[
		get_test_example_file('target-240p-16khz.mp4'),
		get_test_example_file('target-240p-16khz.mp4')
	]

	assert concat_video(output_path, temp_output_paths) is True
	assert probe_video_entries(output_path, [ 'nb_frames' ]) == { 'nb_frames': '540' }


def test_read_audio_buffer() -> None:
	assert isinstance(read_audio_buffer(get_test_example_file('source.mp3'), 1, 16, 1), bytes)
	assert isinstance(read_audio_buffer(get_test_example_file('source.wav'), 1, 16, 1), bytes)
	assert len(read_audio_buffer(get_test_example_file('source.mp3'), 44100, 16, 1)) == 334080
	assert len(read_audio_buffer(get_test_example_file('source.mp3'), 44100, 32, 1)) == 668160
	assert len(read_audio_buffer(get_test_example_file('source.mp3'), 48000, 16, 2)) == 727252
	assert len(read_audio_buffer(get_test_example_file('source.wav'), 16000, 16, 1)) == 121208
	assert read_audio_buffer(get_test_example_file('invalid.mp3'), 1, 16, 1) is None


def test_restore_audio() -> None:
	test_set =\
	[
		(get_test_example_file('target-240p-16khz.avi'), get_test_output_path('target-240p-16khz.avi')),
		(get_test_example_file('target-240p-16khz.m4v'), get_test_output_path('target-240p-16khz.m4v')),
		(get_test_example_file('target-240p-16khz.mkv'), get_test_output_path('target-240p-16khz.mkv')),
		(get_test_example_file('target-240p-16khz.mov'), get_test_output_path('target-240p-16khz.mov')),
		(get_test_example_file('target-240p-16khz.mp4'), get_test_output_path('target-240p-16khz.mp4')),
		(get_test_example_file('target-240p-48khz.mp4'), get_test_output_path('target-240p-48khz.mp4')),
		(get_test_example_file('target-240p-16khz.webm'), get_test_output_path('target-240p-16khz.webm')),
		(get_test_example_file('target-240p-16khz.wmv'), get_test_output_path('target-240p-16khz.wmv'))
	]
	output_audio_encoders = get_available_encoder_set().get('audio')

	for target_path, output_path in test_set:
		create_temp_directory(state_manager.get_temp_path(), output_path)

		for output_audio_encoder in output_audio_encoders:
			state_manager.init_item('output_audio_encoder', output_audio_encoder)
			copy_file(target_path, get_temp_file_path(state_manager.get_temp_path(), output_path))

			assert restore_audio(target_path, output_path, 0, 270) is True

		clear_temp_directory(state_manager.get_temp_path(), output_path)

	state_manager.init_item('output_audio_encoder', 'aac')
	state_manager.init_item('output_video_encoder', 'libx264')
	target_path = get_test_example_file('target-240p-48khz.mp4')
	trim_test_set =\
	[
		(get_test_output_path('test-restore-audio-0-50.mp4'), 0, 50, 2.0),
		(get_test_output_path('test-restore-audio-25-75.mp4'), 25, 75, 2.0),
		(get_test_output_path('test-restore-audio-50-150.mp4'), 50, 150, 1.8),
		(get_test_output_path('test-restore-audio-124-224.mp4'), 124, 224, 0)
	]

	for output_path, trim_frame_start, trim_frame_end, audio_duration in trim_test_set:
		create_temp_directory(state_manager.get_temp_path(), output_path)
		extract_frames(target_path, output_path, (426, 226), 25.0, trim_frame_start, trim_frame_end)
		merge_video(target_path, output_path, 25.0, 25.0, (426, 226), trim_frame_start, trim_frame_end)

		assert restore_audio(target_path, output_path, trim_frame_start, trim_frame_end) is True
		assert float(probe_audio_entries(output_path, [ 'duration' ]).get('duration', 0)) == approx(audio_duration, abs = 0.02)
		assert extract_video_metadata(output_path).get('frame_total') == trim_frame_end - trim_frame_start

		clear_temp_directory(state_manager.get_temp_path(), output_path)

	output_path = get_test_output_path('test-restore-audio.mp4')
	create_temp_directory(state_manager.get_temp_path(), output_path)
	extract_frames(target_path, output_path, (426, 226), 25.0, 0, 50)
	merge_video(target_path, output_path, 25.0, 25.0, (426, 226), 0, 50)

	assert restore_audio(target_path, output_path, 0, 100) is True
	assert probe_audio_entries(output_path, [ 'duration' ]) == { 'duration': '2.000000' }
	assert extract_video_metadata(output_path).get('frame_total') == 50

	clear_temp_directory(state_manager.get_temp_path(), output_path)


@pytest.mark.xfail(strict = True, raises = AssertionError, reason = 'TESTING_AND_FIXING.md #4')
def test_restore_audio_with_reused_output_path() -> None:
	target_path = get_test_example_file('target-240p-48khz.mp4')
	output_path = get_test_output_path('test-restore-audio-with-reused-output-path.mp4')

	for trim_frame_start, trim_frame_end in [ (0, 50), (50, 150) ]:
		create_temp_directory(state_manager.get_temp_path(), output_path)
		extract_frames(target_path, output_path, (426, 226), 25.0, trim_frame_start, trim_frame_end)
		merge_video(target_path, output_path, 25.0, 25.0, (426, 226), trim_frame_start, trim_frame_end)
		restore_audio(target_path, output_path, trim_frame_start, trim_frame_end)
		clear_temp_directory(state_manager.get_temp_path(), output_path)

	assert extract_video_metadata(output_path).get('frame_total') == 100


def test_replace_audio() -> None:
	test_set =\
	[
		(get_test_example_file('target-240p-16khz.avi'), get_test_output_path('target-240p-16khz.avi')),
		(get_test_example_file('target-240p-16khz.m4v'), get_test_output_path('target-240p-16khz.m4v')),
		(get_test_example_file('target-240p-16khz.mkv'), get_test_output_path('target-240p-16khz.mkv')),
		(get_test_example_file('target-240p-16khz.mov'), get_test_output_path('target-240p-16khz.mov')),
		(get_test_example_file('target-240p-16khz.mp4'), get_test_output_path('target-240p-16khz.mp4')),
		(get_test_example_file('target-240p-48khz.mp4'), get_test_output_path('target-240p-48khz.mp4')),
		(get_test_example_file('target-240p-16khz.webm'), get_test_output_path('target-240p-16khz.webm'))
	]
	output_audio_encoders = get_available_encoder_set().get('audio')

	for target_path, output_path in test_set:
		create_temp_directory(state_manager.get_temp_path(), output_path)

		for output_audio_encoder in output_audio_encoders:
			state_manager.init_item('output_audio_encoder', output_audio_encoder)
			copy_file(target_path, get_temp_file_path(state_manager.get_temp_path(), output_path))

			assert replace_audio(get_test_example_file('source.mp3'), output_path) is True
			assert replace_audio(get_test_example_file('source.wav'), output_path) is True

		clear_temp_directory(state_manager.get_temp_path(), output_path)

	state_manager.init_item('output_audio_encoder', 'aac')
	state_manager.init_item('output_video_encoder', 'libx264')
	target_path = get_test_example_file('target-240p-48khz.mp4')
	output_path = get_test_output_path('test-replace-audio.mp4')
	create_temp_directory(state_manager.get_temp_path(), output_path)
	extract_frames(target_path, output_path, (426, 226), 25.0, 0, 50)
	merge_video(target_path, output_path, 25.0, 25.0, (426, 226), 0, 50)

	assert replace_audio(get_test_example_file('source.mp3'), output_path) is True
	assert probe_audio_entries(output_path, [ 'duration' ]) == { 'duration': '2.000000' }
	assert extract_video_metadata(output_path).get('frame_total') == 50

	clear_temp_directory(state_manager.get_temp_path(), output_path)


def test_sanitize_audio_with_strict() -> None:
	with open(get_test_example_file('source.m4a'), 'rb') as file:
		assert sanitize_audio(file, get_test_output_path('test-sanitize-audio-with-strict-valid.m4a'), 'strict') is True
		assert probe_audio_entries(get_test_output_path('test-sanitize-audio-with-strict-valid.m4a'), [ 'codec_name' ]).get('codec_name') == 'aac'

	with open(get_test_example_file('source-moov-end.m4a'), 'rb') as file:
		assert sanitize_audio(file, get_test_output_path('test-sanitize-audio-with-strict-invalid-1.m4a'), 'strict') is False

	with open(get_test_example_file('target-240p.m4a'), 'rb') as file:
		assert sanitize_audio(file, get_test_output_path('test-sanitize-audio-with-strict-invalid-2.m4a'), 'strict') is False

	assert probe_title_tag(get_test_example_file('source-metadata.wav')) == { 'TAG:title': 'invalid' }

	with open(get_test_example_file('source-metadata.wav'), 'rb') as file:
		assert sanitize_audio(file, get_test_output_path('test-sanitize-audio-with-strict-metadata.mp3'), 'strict') is True
		assert probe_title_tag(get_test_output_path('test-sanitize-audio-with-strict-metadata.mp3')) == {}


def test_sanitize_audio_with_moderate() -> None:
	with open(get_test_example_file('source.m4a'), 'rb') as file:
		assert sanitize_audio(file, get_test_output_path('test-sanitize-audio-with-moderate-valid.m4a'), 'moderate') is True
		assert probe_audio_entries(get_test_output_path('test-sanitize-audio-with-moderate-valid.m4a'), [ 'codec_name' ]).get('codec_name') == 'alac'

	with open(get_test_example_file('source-moov-end.m4a'), 'rb') as file:
		assert sanitize_audio(file, get_test_output_path('test-sanitize-audio-with-moderate-invalid-1.m4a'), 'moderate') is False

	with open(get_test_example_file('target-240p.m4a'), 'rb') as file:
		assert sanitize_audio(file, get_test_output_path('test-sanitize-audio-with-moderate-invalid-2.m4a'), 'moderate') is False

	with open(get_test_example_file('source-metadata.wav'), 'rb') as file:
		assert sanitize_audio(file, get_test_output_path('test-sanitize-audio-with-moderate-metadata.wav'), 'moderate') is True
		assert probe_title_tag(get_test_output_path('test-sanitize-audio-with-moderate-metadata.wav')) == {}


def test_sanitize_image() -> None:
	file_path = get_test_example_file('source.jpg')
	output_path = get_test_output_path('test-sanitize-image.jpg')

	with open(file_path, 'rb') as file:
		assert sanitize_image(file, output_path) is True
		assert is_image(output_path) is True


def test_sanitize_video_with_strict() -> None:
	assert probe_title_tag(get_test_example_file('target-240p-h265-metadata.mp4')) == { 'TAG:title': 'invalid' }

	with open(get_test_example_file('target-240p-h265-metadata.mp4'), 'rb') as file:
		assert sanitize_video(file, get_test_output_path('test-sanitize-video-with-strict-valid.mp4'), 'strict') is True
		assert probe_video_entries(get_test_output_path('test-sanitize-video-with-strict-valid.mp4'), [ 'codec_name' ]).get('codec_name') == 'h264'
		assert probe_video_entries(get_test_output_path('test-sanitize-video-with-strict-valid.mp4'), [ 'nb_frames' ]).get('nb_frames') == '270'
		assert probe_title_tag(get_test_output_path('test-sanitize-video-with-strict-valid.mp4')) == {}

	with open(get_test_example_file('target-240p-moov-end.mp4'), 'rb') as file:
		assert sanitize_video(file, get_test_output_path('test-sanitize-video-with-strict-invalid-1.mp4'), 'strict') is False

	with open(get_test_example_file('source.m4a'), 'rb') as file:
		assert sanitize_video(file, get_test_output_path('test-sanitize-video-with-strict-invalid-2.mp4'), 'strict') is False


def test_sanitize_video_with_moderate() -> None:
	with open(get_test_example_file('target-240p-h265-metadata.mp4'), 'rb') as file:
		assert sanitize_video(file, get_test_output_path('test-sanitize-video-with-moderate-valid.mp4'), 'moderate') is True
		assert probe_video_entries(get_test_output_path('test-sanitize-video-with-moderate-valid.mp4'), [ 'codec_name' ]).get('codec_name') == 'hevc'
		assert probe_title_tag(get_test_output_path('test-sanitize-video-with-moderate-valid.mp4')) == {}

	with open(get_test_example_file('target-240p-moov-end.mp4'), 'rb') as file:
		assert sanitize_video(file, get_test_output_path('test-sanitize-video-with-moderate-invalid-1.mp4'), 'moderate') is False

	with open(get_test_example_file('source.m4a'), 'rb') as file:
		assert sanitize_video(file, get_test_output_path('test-sanitize-video-with-moderate-invalid-2.mp4'), 'moderate') is False


def test_fix_audio_encoder() -> None:
	assert fix_audio_encoder('avi', 'libopus') == 'aac'
	assert fix_audio_encoder('m4v', 'libopus') == 'aac'
	assert fix_audio_encoder('mpeg', 'libopus') == 'aac'
	assert fix_audio_encoder('wmv', 'libopus') == 'aac'
	assert fix_audio_encoder('mov', 'flac') == 'aac'
	assert fix_audio_encoder('mov', 'libopus') == 'aac'
	assert fix_audio_encoder('mxf', 'libopus') == 'pcm_s16le'
	assert fix_audio_encoder('webm', 'aac') == 'libopus'
	assert fix_audio_encoder('mp4', 'aac') == 'aac'
	assert fix_audio_encoder('avi', 'aac') == 'aac'


def test_fix_video_encoder() -> None:
	assert fix_video_encoder('m4v', 'libx265') == 'libx264'
	assert fix_video_encoder('mpeg', 'libx265') == 'libx264'
	assert fix_video_encoder('mxf', 'libx265') == 'libx264'
	assert fix_video_encoder('wmv', 'libx265') == 'libx264'
	assert fix_video_encoder('mkv', 'rawvideo') == 'libx264'
	assert fix_video_encoder('mp4', 'rawvideo') == 'libx264'
	assert fix_video_encoder('mov', 'libvpx-vp9') == 'libx264'
	assert fix_video_encoder('webm', 'libx264') == 'libvpx-vp9'
	assert fix_video_encoder('mp4', 'libx265') == 'libx265'
	assert fix_video_encoder('avi', 'rawvideo') == 'rawvideo'


