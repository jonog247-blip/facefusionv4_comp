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
7. offers to download all models

`windows_launch.bat` activates the environment, starts the app on <http://127.0.0.1:7860> and opens the browser. Arguments are passed through, for example `windows_launch.bat --execution-providers cpu`.


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

The classic layouts stay available with `--ui-layouts default`, `jobs`, `webcam` and `benchmark`.

The NSFW content filter is disabled by default, it can be enabled again with the checkbox in the hardware panel or with `--content-analyser-enabled`.


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
