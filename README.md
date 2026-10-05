FaceFusion
==========

> Industry leading face manipulation platform.

[![Build Status](https://img.shields.io/github/actions/workflow/status/facefusion/facefusion/ci.yml.svg?branch=master)](https://github.com/facefusion/facefusion/actions?query=workflow:ci)
[![Coverage Status](https://img.shields.io/coveralls/facefusion/facefusion.svg)](https://coveralls.io/r/facefusion/facefusion)
![License](https://img.shields.io/badge/license-OpenRAIL--AS-green)


Preview
-------

![Preview](https://raw.githubusercontent.com/facefusion/facefusion/master/.github/preview.png?sanitize=true)


Windows quick start (Windows 11 + NVIDIA GPU)
---------------------------------------------

Two batch files are included, run them in this order:

```
windows_install.bat   # creates the conda environment and installs every dependency
windows_launch.bat    # starts the Studio interface and opens the browser
```

`windows_install.bat` performs the following steps:

1. locates conda, or downloads and installs Miniconda when nothing was found
2. creates the conda environment `facefusion` with Python 3.12
3. installs `ffmpeg` and `ffprobe` into the environment
4. detects the NVIDIA driver and installs the CUDA 12.9.1 runtime and cuDNN 9.10.0 through the nvidia conda channel, with the pip wheels as a fallback, so no CUDA Toolkit installation is required
5. installs the Python libraries through `python install.py cuda@12` (`python install.py default` on machines without a NVIDIA GPU)
6. runs a self test that prints the available inference providers
7. offers to download the models for the detected hardware (recommended, default answer `Y`)

`windows_launch.bat` activates the environment, starts the app on <http://127.0.0.1:7860> and opens the browser. Arguments are passed through, for example `windows_launch.bat --execution-providers cpu`.


Models
------

Models are downloaded on demand, a full download is never required:

- on the first start the app downloads the models of the detected hardware preset (face detector, face landmarker, face recogniser, face masker, voice extractor and the configured face swapper)
- `python facefusion.py download-models` downloads exactly those models and exits, `--processors face_swapper face_enhancer` extends the selection
- the `DOWNLOAD MODELS` button in the `PERFORMANCE & DOWNLOADS` section downloads the models of every processor
- `python facefusion.py force-download` does the same on the command line

The models live in `.assets/models` next to `facefusion.py` and are validated by a hash on every start. Missing files are re-downloaded automatically, corrupt files are deleted and downloaded again.


Studio UI
---------

The Studio layout (`--ui-layouts studio`, the default) is a dark, Apple inspired interface that keeps every feature of the classic layout:

- guided flow: source and target, preview, processors, advanced options, run
- collapsible sections for face detection and masking, video and audio, and execution settings
- a sticky run panel with the instant runner, the job runner and the terminal
- a hardware panel that auto detects CPU, RAM, GPU, VRAM, driver, CUDA and the available video encoders
- automatic hardware presets that pre-configure the detector, the swapper, the pixel boost, the execution providers, the thread count, the memory strategy and the video encoder
- a `hardware-info` command that prints the detected hardware and the recommended settings in the terminal

The presets can be selected in the UI:

| profile | behaviour |
| --- | --- |
| Automatic (recommended) | picks conservative settings for the detected hardware |
| Maximum quality | largest models, highest pixel boost, lossless temp frames |
| Balanced | middle ground between quality and speed |
| Maximum speed | smallest models and JPEG temp frames |
| Low VRAM | reduces memory usage aggressively |

The preset is applied before the models are checked, so the models of the recommended settings are downloaded on the first start. Settings that are written into `facefusion.ini` are respected, the preset only fills in the settings that are left empty - remove a value from `facefusion.ini` to let the preset decide again.

The classic layouts stay available with `--ui-layouts default`, `jobs`, `webcam` and `benchmark`.

The NSFW content filter is disabled by default, it can be enabled again with the checkbox in the hardware panel or with `--content-analyser-enabled`.


Troubleshooting
---------------

`AttributeError: 'NoneType' object has no attribute 'get_inputs'`

A model that the selected processor needs is not downloaded. The terminal now prints the file name, for example:

```
[FACEFUSION.INFERENCE_MANAGER] model hyperswap_1a_256.onnx is not downloaded - download the models and try again
```

Click `DOWNLOAD MODELS` in the `PERFORMANCE & DOWNLOADS` section, or run one of these commands inside the activated environment:

```
python facefusion.py download-models
python facefusion.py force-download
```

If the download fails, check the internet connection, the antivirus or a firewall that blocks `github.com` and `huggingface.co`.

`the models could not be downloaded - check the internet connection and download again`

At least one model file could not be validated or downloaded. Run the download again, the app deletes incomplete files and retries automatically.

The app does not start and reports `CUDAExecutionProvider is not available`

The CUDA runtime or cuDNN could not be installed. Run `windows_install.bat` again on a machine with the latest NVIDIA driver, or run the app on the CPU with `windows_launch.bat --execution-providers cpu`.


Installation
------------

Be aware, the [installation](https://docs.facefusion.io/installation) needs technical skills and is not recommended for beginners. In case you are not comfortable using a terminal, our [Windows Installer](http://windows-installer.facefusion.io) and [macOS Installer](http://macos-installer.facefusion.io) get you started.


Usage
-----

Run the command:

```
python facefusion.py [commands] [options]

options:
  -h, --help                                      show this help message and exit
  -v, --version                                   show program's version number and exit

commands:
    run                                           run the program
    headless-run                                  run the program in headless mode
    batch-run                                     run the program in batch mode
    force-download                                force automate downloads and exit
    hardware-info                                 show the detected hardware and the recommended settings
    benchmark                                     benchmark the program
    job-list                                      list jobs by status
    job-create                                    create a drafted job
    job-submit                                    submit a drafted job to become a queued job
    job-submit-all                                submit all drafted jobs to become a queued jobs
    job-delete                                    delete a drafted, queued, failed or completed job
    job-delete-all                                delete all drafted, queued, failed and completed jobs
    job-add-step                                  add a step to a drafted job
    job-remix-step                                remix a previous step from a drafted job
    job-insert-step                               insert a step to a drafted job
    job-remove-step                               remove a step from a drafted job
    job-run                                       run a queued job
    job-run-all                                   run all queued jobs
    job-retry                                     retry a failed job
    job-retry-all                                 retry all failed jobs
```


Configuration
-------------

The defaults live in `facefusion.ini`, the most relevant options of this build are:

```
[uis]
open_browser =
ui_layouts = studio
ui_workflow =

[hardware]
hardware_auto_preset = True
hardware_preset_mode =

[content]
content_analyser_enabled = False
```

| option | description |
| --- | --- |
| `--hardware-auto-preset` | auto detect the hardware and apply the recommended settings on startup |
| `--hardware-preset-mode {auto,quality,balanced,speed,low_vram}` | choose the hardware preset profile |
| `--content-analyser-enabled` | enable the NSFW content filter (disabled by default) |

The same settings can be changed in the *Hardware & presets* section of the Studio UI. The checkboxes and the preset profile write their value back to `facefusion.ini`, so the choice is remembered on the next start.


Documentation
-------------

Read the [documentation](https://docs.facefusion.io) for a deep dive.
