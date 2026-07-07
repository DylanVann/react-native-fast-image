---
description: Capture a screenshot from the connected Android emulator/device and display it inline
---

Capture the current screen of the connected Android device/emulator and show it inline in this session.

Device serial: $ARGUMENTS (if empty, auto-detect the first device from `adb devices`)

Steps:
1. Run `adb devices` to find a device serial if `$ARGUMENTS` is empty. If none connected, stop and say so.
2. Run (device path must use `//sdcard/...` — a single leading slash gets mangled by Git Bash's path conversion on Windows):
   ```
   adb -s <serial> shell screencap -p //sdcard/claude_capture.png
   adb -s <serial> pull //sdcard/claude_capture.png "<scratchpad>/capture.png"
   ```
   Use the session's scratchpad directory for the local path, not the project directory.
3. Use the Read tool on the pulled local PNG path to display it inline.
4. Do not delete the on-device `//sdcard/claude_capture.png` unless asked — leave it, next run just overwrites it.

Keep the response after showing the image to one short line (what's on screen), not a re-description of every pixel.
