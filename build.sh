#!/bin/bash
set -e
cd "$(dirname "$0")"
rm -f zotero-duplicates.xpi
zip -r zotero-duplicates.xpi manifest.json bootstrap.js duplicates.js dialog.xhtml
echo "Built zotero-duplicates.xpi"
