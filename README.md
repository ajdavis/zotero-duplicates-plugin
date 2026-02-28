# Zotero Duplicate Finder

Finds duplicate parent items in your Zotero library by PDF content hash and title similarity, and tags them `duplicate` for easy cleanup.

## Build

```
bash build.sh
```

Produces `zotero-duplicates.xpi`.

## Install

1. In Zotero: Tools → Plugins → ⚙ → Install Plugin From File
2. Select `zotero-duplicates.xpi`
3. Restart Zotero

## Usage

Tools → Find Duplicate Items… → review groups → Tag Duplicates. The main window automatically filters to show tagged items.

## Release

1. Bump `version` in `manifest.json` and `update.json`
2. `bash build.sh`
3. Commit and push
4. `gh release create vX.Y zotero-duplicates.xpi`

## License

AGPL-3.0. See [LICENSE](LICENSE).
