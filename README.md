# node-red-plugin-file-browser

A minimal Node-RED editor plugin that adds a Files sidebar tab:

- 📁 Browse folders (tree, subfolders)
- 📝 Open & edit text files (UTF-8) with Monaco (VS Code’s editor) or a textarea fallback
- ➕ Create files & folders
- 💾 Save changes
- 🔒 Sandboxed to a base directory (configurable from the sidebar; persisted in userDir)

No extra Dashboard nodes needed. Works fully inside the Node-RED editor (http://host:1880).

---

## Install

From Manage Palette (recommended)
1. Open Node-RED → Menu → Manage palette → Install
2. Search for node-red-plugin-file-browser
3. Install and reload the editor.

From npm/CLI
Install into your userDir (Docker userDir is /data):

    cd ~/.node-red            # or /data in Docker
    npm i node-red-plugin-file-browser
    # restart Node-RED

If you have the plugin sources locally (e.g., inside a project), you can install from path:

    cd /data
    npm i /data/projects/YourProject/file-browser-plugin

---

## Usage

1. Open the editor and click the Files sidebar tab.
2. In the left panel header:
   - Base shows the current base folder.
   - Click Change base… to set a new base (must be under userDir, e.g., /data/projects/YourProject in Docker).
   - Click Refresh to re-scan the current folder.
3. Click folders to drill down and click files to open them.
4. Use New file, New folder, and Save in the right toolbar.

Persistence: The selected base folder is saved to ~/.node-red/.filebrowser.config.json (Docker: /data/.filebrowser.config.json) and is re-used on restart.

---

## Security & Limits

- All HTTP endpoints are served via RED.httpAdmin (protected by the editor’s login if adminAuth is enabled).
- All file operations are sandboxed to the base folder (which itself must be inside userDir).
- Editing is text-only; binary files are rejected.
- Default file size limit is 5 MB (configurable by editing the config JSON manually).

---

## Why this plugin?

- Native to the editor (no Dashboard or external UI).
- Zero config step: pick your base folder in the sidebar; no settings.js edits required.
- Minimal dependencies: Monaco is loaded from CDN with a textarea fallback if blocked/offline.

---

## Uninstall

    cd ~/.node-red  # or /data
    npm remove node-red-plugin-file-browser
    # restart Node-RED

---

## Development

    # link or pack for local dev
    cd /path/to/file-browser-plugin
    npm pack        # optional: inspect the tarball
    # or install into your userDir directly:
    cd ~/.node-red
    npm i /path/to/file-browser-plugin

Commit guidelines:
- Conventional commits (feat:, fix:, chore:) are appreciated.
- npm version <patch|minor|major> will auto-tag releases.

---

## License

MIT (see LICENSE)
