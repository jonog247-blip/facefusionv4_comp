# Typing TODO

The repo has 25 type ignores: 23 in `facefusion/`, 2 in `tests/`. With all of them removed and the fixes below applied, both CI steps pass (`mypy facefusion.py install.py`, `mypy facefusion tests`) and `flake8 facefusion tests` is clean. This was checked on a scratch copy with the local packages from `requirements.txt` installed (numpy 2.4.6, opencv 5.0, starlette 1.6).

- **Unused:** 11 ignores, delete them.
- **Needed:** 14 ignores, replace each with a fix.


## Labels

Every item was checked against local `v4` (0d86dd61, after the "make mypy happy" commits 6478ef24..0d86dd61) and local `master` (72470819), on throwaway worktrees with `mypy --warn-unused-ignores facefusion tests` (mypy 1.18.2, numpy 2.4.6, opencv 5.0). The 25 ignores above are exactly the ones on v4 today.

Scope (where to fix):
- **[master+v4]**: the issue exists on both. Fix on master, merge forward into v4. Master line numbers are given where they differ.
- **[v4-only]**: the code does not exist on master. Fix on v4.
- **[master-only]**: none of the items below. Master has extra findings not covered by this document: unused ignores in `args.py:110, 118`, `state_manager.py:10, 29`, `uis/components/job_runner.py:87`, `uis/components/instant_runner.py:95`, plus real gradio errors in `uis/core.py:80`, `uis/components/benchmark_options.py:30, 42` and `uis/components/face_selector.py:69, 74`.

Done items are struck through with the v4 commit that fixed them. None of the items below is done on v4: the mypy commits fixed other ignores (`asset_helper.py`, `endpoints/assets.py`, `endpoints/jobs.py`, `job_manager.py`, `normalizer.py`, `ffmpeg.py` encoder set), and 7d0884cb added the ignores for 2.5 and 2.6.


## Why CI did not see these

The CI lint job installs only flake8, flake8-import-order and mypy, not `requirements.txt`. `mypy.ini` sets `ignore_missing_imports = True`, so in CI everything from numpy, cv2 and starlette is `Any`, and `Any` never fails a check. Locally those packages ship type hints, so mypy really checks them.

To make CI as strict as local:
- add `pip install -r requirements.txt` to the lint job
- pin mypy (`pip install mypy==2.4.0`), so a new release does not break CI overnight. ~~2.4.0 broke `ffmpeg.py:30` on 2026-10-01.~~ **done on v4** (6478ef24), master never had the reassignment.
- after this TODO is done, add `warn_unused_ignores = True` to `mypy.ini`, so new ignores cannot go stale. Enable it only once CI installs the requirements; without them, numpy and cv2 ignores look unused in CI and needed locally.


## 1. Unused ignores (11): delete

mypy reports nothing on these lines without the ignore. They date from older numpy or opencv stubs.

| File | Line | Scope |
|------|------|-------|
| `facefusion/types.py` | 26, 27, 28, 29 (`FaceLandmarkSet`) | **[master+v4]** master 23-26 |
| `facefusion/face_masker.py` | 236 (`cv2.fillConvexPoly`) | **[master+v4]** |
| `facefusion/face_aligner.py` | 249 (`numpy.mean`) | **[master+v4]** master `face_landmarker.py:249` |
| `facefusion/face_helper.py` | 145 (`rotation_matrix[:, -1] +=`), 166 (`cv2.transform`) | **[master+v4]** |
| `facefusion/processors/modules/frame_colorizer/core.py` | 291, 312 | **[master+v4]** master 270, 291 |
| `facefusion/workflows/image_to_video.py` | 38. Its task list holds only plain functions, so mypy already infers a callable type; see 2.4 | **[master+v4]** master 37 |


## 2. Needed ignores (14): fix

### 2.1 `facefusion/state_manager.py:55`: `collect_state` **[v4-only]**

Master has no `collect_state`.

A dict comprehension is `dict[str, Any]`, and mypy cannot know that its keys form a `State`.

```python
from typing import Union, cast

return cast(Union[State, ProcessorState], state)
```

### 2.2 `facefusion/state_manager.py:59, 67`: `init_item` / `set_item` **[master+v4]**

Master has the same `literal-required` problem on its `STATE_SET` layout: `state_manager.py:24, 25, 34, 38` (`init_item`, `set_item`, `sync_item`). The fix has to be ported by hand, master has no `get_state()[key]` write.

A TypedDict only accepts string literal keys. Here `key` is a union of all state keys, only known at runtime. Write through a plain dict view instead:

```python
from facefusion.types import Content

cast(Content, get_state())[key] = value
```

### 2.3 `facefusion/ffmpeg.py:400`: `sanitize_video` strict encoder **[v4-only]**

Master has no `sanitize_video` and no `video_set`.

Two mismatches:
- `get_file_format()` returns `str`, but `video_set` is keyed by `VideoFormat`
- `video_set` values are `str`, but `set_video_encoder`, `set_video_preset` and `set_pixel_format` expect `VideoEncoder`

```python
video_encoder = cast(VideoEncoder, facefusion.choices.video_set.get(cast(VideoFormat, video_format)))
```

The outer cast is not true for every format. `avi`, `mpeg`, `mxf` and `wmv` map to `mpeg4`, `mpeg1video`, `mpeg2video` and `msmpeg4`, which are not `VideoEncoder` literals. It holds in practice: `validate_asset_files` only lets a format through when its encoder is in `available_encoder_set['video']`, and that list only collects `VideoEncoder` literals. So those four formats never reach `sanitize_video`.

Side finding, needs a decision: by the same logic, `avi`, `mpeg`, `mxf` and `wmv` uploads are always rejected by the API. The alternative to the cast is to widen the type, e.g. a separate literal for the `video_set` values.

### 2.4 `facefusion/workflows/*.py`: `task()` (4 files) **[master+v4]**

`image_to_image.py` is **[master+v4]** (master line 23). `audio_to_image.py`, `audio_to_image_as_frames.py` and `image_to_video_as_frames.py` are **[v4-only]**.

`image_to_image.py:24`, `audio_to_image.py:28`, `audio_to_image_as_frames.py:26`, `image_to_video_as_frames.py:26`

The task list mixes plain functions with a `partial(...)`. mypy joins those types to `object`, which is not callable. Annotate the list:

```python
from typing import Callable, List

tasks : List[Callable[[], ErrorCode]] =\
[
	...
]
```

This is a real fix, not a cast.

### 2.5 `facefusion/face_masker.py:237`: `create_area_mask` **[master+v4]**

On master the line has no ignore, so mypy reports it there as an error today. On v4 the ignore was added in 7d0884cb.

The mask is created as float32. `(... - 0.5) * 2` on the blur result promotes it to float64, so the function silently returns a different dtype than it declares.

```python
area_mask = ((cv2.GaussianBlur(area_mask.clip(0, 1), (0, 0), 5).clip(0.5, 1) - 0.5) * 2).astype(numpy.float32)
```

### 2.6 `facefusion/audio.py:76`: `extract_audio_frames` (2 errors on one line) **[master+v4]**

On master (line 74) there is no ignore, so mypy reports both errors there today. On v4 the ignore was added in 7d0884cb.

`indices` is an int16 numpy array, so `index` is a numpy scalar. numpy's typing does not accept that as a slice bound.

```python
for index in indices.tolist():
```

This is a real fix: plain ints, same values.

### 2.7 `facefusion/apis/stream_event.py:17, 18`: callbacks on the event **[v4-only]**

The ctypes callbacks are attached to the `threading.Event` to keep them alive. Without a reference they are garbage collected while libdatachannel still calls them. `Event` has no such attributes, so mypy rejects the assignment.

```python
setattr(receive_event, 'frame_callback', frame_callback)
setattr(receive_event, 'close_callback', close_callback)
```

This keeps the behaviour and makes the dynamic attribute explicit. The cleaner long-term option is to hold the callbacks next to the track in the RTC store, instead of on the event.

### 2.8 `tests/test_state_manager.py:48`: partial state **[v4-only]**

Master has no `set_state`. Its test has a related, still needed ignore in `clear_state` (`tests/test_state_manager.py:15`, `typeddict-item`), which belongs to the master side of 2.2.

The test passes a deliberately partial state.

```python
from typing import Iterator, cast

from facefusion.types import State

set_state(cast(State, { 'video_memory_strategy': 'strict' }))
```

### 2.9 `tests/test_api_stream_video.py:179`: vpx codec **[v4-only]**

`video_codec` is `VideoCodec` (`av1`, `vp8`, `vp9`). The enclosing `if video_codec in [ 'vp8', 'vp9' ]` does not narrow it for mypy.

```python
from typing import Tuple, cast

from facefusion.types import ..., VideoCodec, VxpVideoCodec

video_encoder = vpx_encoder.create(cast(VxpVideoCodec, video_codec), (426, 226), 1000, 1, 0)
```

`VxpVideoCodec` is the existing alias name in `facefusion/types.py:115` (sic, "Vxp").


## Result

| | Ignores |
|---|---|
| today | 25 |
| after section 1 | 14 |
| after section 2 | 0 |

Real fixes: 2.4, 2.5 and 2.6. Casts: 2.1, 2.2, 2.3, 2.8 and 2.9. Explicit `setattr`: 2.7.
