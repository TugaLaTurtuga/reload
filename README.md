# Reload

Reload is an Electron music player for people who keep their library organised on disk and want more control than a browser tab or a generic streaming UI gives them.

It scans folders, reads track metadata, builds album views, supports a separate mini player window, and exposes a lot of the app's behaviour through editable settings, themes, looks, and shortcuts.

## What It Does

- Plays music from a local folder-based library.
- Builds album views from on-disk metadata and cover art.
- Keeps playback state, queue history, and resume position between launches.
- Includes a mini player window with backend-controlled play, pause, previous, and next.
- Supports favourites, a built-in finder, keyboard shortcuts, and controller-oriented navigation.
- Includes a metadata editor for album and track info.
- Includes a theme editor, custom CSS "looks", and Pywal integration.
- Handles multiple external Reload windows while keeping playback state in sync.

## Current Feature Set

### Library and Playback

- Scans one or more library folders.
- Reads tags using `music-metadata`.
- Supports common audio formats and attempts M4P playback through `ffmpeg`.
- Tracks previous and next history for playback navigation.
- Exposes media session controls for OS-level playback actions.

### UI and Customisation

- Main library window.
- Mini player window.
- Settings window.
- Theme editor.
- CSS look editor.
- Custom shortcuts editor.
- Automatic theme switching from system theme settings.
- Optional Pywal theme syncing.

### Editing and Organisation

- Track and album metadata editing UI.
- Favourites sidebar with ordering support.
- Search and highlight through the library.
- Playback weighting settings for algorithm-based song selection.

## Project Structure

```text
app/                    Renderer HTML, CSS, and client-side JS
electron/               Electron main process and backend helpers
electron/user-data/     Default looks and shortcut templates
app/html/               Extra windows such as settings and editors
app/js/                 Playback, library rendering, finder, favourites, UI logic
```

## Getting Started

### Requirements

- bun

### Installation

#### Install bun ( if you don't have it )

- MacOS or Linux
```bash
curl -fsSL https://bun.sh/install | bash
```

- Windows
```powershell
powershell -c "irm bun.sh/install.ps1 | iex"
```

#### Clone repository
```bash
git clone https://github.com/TugaLaTurtuga/reload.git
```

#### Install dependencies
- Inside the cloned repository directory
```bash
./depedenciesInstallScript.sh
```

### Run

```bash
bun start
```

On first launch, Reload creates user data inside Electron's app data directory and copies the default looks and shortcut files there.

## Library Setup

By default, Reload looks in a `reload` folder inside your Documents directory. You can add or change library paths from the Settings window.

The app expects a reasonably organised folder structure and works best when album folders include:

- tagged audio files
- embedded or sidecar cover art
- consistent metadata such as title, artist, year, genre, and rating

## Customisation

Reload is intentionally editable.

- Themes live in the shared theme CSS and can be changed through the theme editor.
- Looks are user CSS overrides stored in the app's user data folder.
- Shortcuts are JSON files that can be edited from the settings UI.
- Pywal support can rewrite the Pywal theme block in the app CSS when a Pywal theme changes.

## Notes and Caveats

- This project is actively evolving and some parts are rough around the edges.
- The codebase mixes renderer logic and Electron IPC heavily, so behaviour is feature-rich but not yet especially clean.
- Some advanced functionality depends on platform-specific behaviour, local files, or external tools.

## Development

Useful commands:

```bash
bun start
```

There is currently no formal build, lint, or test script defined in `package.json`.

## License

MIT. See [LICENSE](./LICENSE).
