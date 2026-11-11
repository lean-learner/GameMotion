# Installing GameMotion

GameMotion runs entirely on your computer: no account, no internet, and camera video
never leaves the machine. Everything it needs (tracking models included) is inside the
download.

## What you need

- **Windows 10/11 (64-bit), macOS 12 or newer (Intel or Apple Silicon), or a 64-bit
  Linux desktop** (e.g. Ubuntu 22.04 or newer).
- **A webcam** (720p or better). Place it at about chest height, facing the play area.
- **Room to move:** stand about 2–3 m from the camera (further for two players).
- **Graphics:** any GPU with WebGL 2 (most from the last 10 years). Without one,
  GameMotion still works on the CPU, more slowly.

## Pick your download

| System              | File                                                                           | How to run                                                                        |
| ------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| Windows (installer) | `GameMotion-<version>-win-x64.exe`                                             | Double-click and follow the steps. Start from the Start menu or desktop shortcut. |
| Windows (portable)  | `GameMotion-<version>-win-x64.zip`                                             | Unzip anywhere, run `gamemotion.exe`. Nothing is installed.                       |
| macOS               | `GameMotion-<version>-mac-arm64.dmg` (Apple Silicon) or `-mac-x64.dmg` (Intel) | Open the DMG, drag GameMotion to Applications.                                    |
| Linux               | `GameMotion-<version>-linux-x86_64.AppImage`                                   | `chmod +x GameMotion-*.AppImage`, then run it.                                    |
| Linux (no FUSE)     | `GameMotion-<version>-linux-x64.tar.gz`                                        | Extract, then run `./gamemotion` inside the folder.                               |

To check a download, compare it with `SHA256SUMS.txt`
(`sha256sum -c SHA256SUMS.txt` on Linux, `shasum -a 256 <file>` on macOS,
`Get-FileHash <file>` in Windows PowerShell).

## Desktop shortcut

- **Windows:** the installer adds Start menu and desktop shortcuts.
- **macOS:** after dragging GameMotion to Applications, find it in Launchpad. Right-click
  its Dock icon → _Options_ → _Keep in Dock_.
- **Linux (AppImage):** put the AppImage where you want to keep it (e.g. `~/Applications`),
  start it, open **Settings** and click **Add to desktop & app menu**. GameMotion then
  appears in the app grid and search (right-click → _Pin to Dash_), plus an icon on the
  desktop. If you move the AppImage later, click the button again.

## First start

1. Allow camera access when asked (macOS asks once; on Windows check
   _Settings → Privacy → Camera_ if the camera stays black).
2. GameMotion opens on the **launcher**. Stand back until your shoulders are in view.
3. Raise a hand: a cursor appears. Hold it on a button for 1 second to press it
   (a mouse click works too).
4. Optional: **Reach setup** fits the cursor to your arm reach.
5. **Esc** goes back to the launcher; in the launcher it leaves full screen. **F11** toggles full screen.

## Unsigned-app warnings

These builds aren't code-signed yet, so the first launch shows a warning:

- **Windows:** "Windows protected your PC" → _More info_ → _Run anyway_.
- **macOS:** right-click GameMotion in Applications → _Open_ → _Open_. If macOS says
  the app is damaged, run `xattr -dr com.apple.quarantine /Applications/GameMotion.app`.

## Where your data is kept

Player names, high scores and settings, plus test reports from Settings:

| System  | Folder                                     |
| ------- | ------------------------------------------ |
| Windows | `%APPDATA%\gamemotion`                     |
| macOS   | `~/Library/Application Support/gamemotion` |
| Linux   | `~/.config/gamemotion`                     |

Copy that folder to move your scores to another computer.

## Troubleshooting

- **"The camera could not be opened":** another app (video call, browser tab) is using
  it. Close that app and press Start again.
- **Slow or choppy tracking:** Settings shows _Execution_. If it says CPU, update your
  graphics drivers. Pick _Lite_ pose model for older computers.
- **Linux, dim room, webcam only at 15–20 fps:** install `v4l-utils`
  (`sudo apt install v4l-utils`). GameMotion then holds 30 fps while you play and
  restores the camera setting afterwards.
- **Linux, the AppImage won't start:** install FUSE (`sudo apt install libfuse2`) or use
  the `.tar.gz` build.

## Uninstall

- **Windows:** _Settings → Apps → GameMotion → Uninstall_ (portable: delete the folder).
- **macOS:** move GameMotion from Applications to the Bin.
- **Linux:** delete the AppImage or folder.

Then delete the data folder above if you also want to remove scores. If you turned on
_Start on login_, switch it off first.
