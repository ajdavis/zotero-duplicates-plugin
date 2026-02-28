FindDuplicates = {
	id: null,
	version: null,
	rootURI: null,
	addedElementIDs: [],

	init({ id, version, rootURI }) {
		this.id = id;
		this.version = version;
		this.rootURI = rootURI;
	},

	addToAllWindows() {
		var windows = Zotero.getMainWindows();
		for (let win of windows) {
			if (!win.ZoteroPane) continue;
			this.addToWindow(win);
		}
	},

	removeFromAllWindows() {
		var windows = Zotero.getMainWindows();
		for (let win of windows) {
			this.removeFromWindow(win);
		}
	},

	addToWindow(window) {
		let doc = window.document;
		let menuitem = doc.createXULElement('menuitem');
		menuitem.id = 'find-duplicates-menuitem';
		menuitem.setAttribute('label', 'Find Duplicate Items\u2026');
		menuitem.addEventListener('command', () => this.openDialog(window));
		doc.getElementById('menu_ToolsPopup').appendChild(menuitem);
		this.storeAddedElement(menuitem);
	},

	removeFromWindow(window) {
		let doc = window.document;
		for (let id of this.addedElementIDs) {
			let el = doc.getElementById(id);
			if (el) el.remove();
		}
	},

	storeAddedElement(elem) {
		if (!this.addedElementIDs.includes(elem.id)) {
			this.addedElementIDs.push(elem.id);
		}
	},

	openDialog(window) {
		window.openDialog(
			this.rootURI + 'dialog.xhtml',
			'find-duplicates-dialog',
			'chrome,centerscreen,resizable',
			{ FindDuplicates: this, Zotero }
		);
	},

	normalizeTitle(title) {
		if (!title) return '';
		return title.toLowerCase().replace(/[^a-z0-9]/g, '');
	},

	async hashPdfHead(attachment) {
		let path = await attachment.getFilePathAsync();
		if (!path) return null;
		let bytes;
		try {
			bytes = await IOUtils.read(path, { maxBytes: 1024 });
		} catch (e) {
			return null;
		}
		let hex = '';
		for (let b of bytes) {
			hex += b.toString(16).padStart(2, '0');
		}
		return hex;
	},

	async scan(progressCallback, cancelToken) {
		let items = await Zotero.Items.getAll(Zotero.Libraries.userLibraryID);
		let parentItems = items.filter(
			item => item.isRegularItem() && !item.parentItemID
		);

		let titleGroups = {};
		let hashGroups = {};
		let total = parentItems.length;
		let yieldCounter = 0;

		for (let i = 0; i < parentItems.length; i++) {
			if (cancelToken.cancelled) return [];

			let item = parentItems[i];
			progressCallback(i, total, item.getField('title'));

			// Title matching
			let norm = this.normalizeTitle(item.getField('title'));
			if (norm) {
				if (!titleGroups[norm]) titleGroups[norm] = [];
				titleGroups[norm].push(item);
			}

			// PDF hash matching
			let attachmentIDs = item.getAttachments();
			if (attachmentIDs.length > 0) {
				for (let attID of attachmentIDs) {
					let att = Zotero.Items.get(attID);
					if (att.attachmentContentType === 'application/pdf') {
						let hash = await this.hashPdfHead(att);
						if (hash) {
							if (!hashGroups[hash]) hashGroups[hash] = [];
							hashGroups[hash].push(item);
							break; // one PDF per parent is enough
						}
					}
				}
			} else {
				// Yield periodically for items without async attachment work
				if (++yieldCounter % 50 === 0) {
					await new Promise(r => setTimeout(r, 0));
				}
			}
		}

		progressCallback(total, total, 'Building results\u2026');

		// Merge groups: collect all sets of duplicates, dedup by item ID
		let seen = new Set();
		let groups = [];

		// PDF hash groups first (stronger signal)
		for (let [hash, items] of Object.entries(hashGroups)) {
			if (items.length < 2) continue;
			let ids = items.map(i => i.id);
			let key = ids.sort().join(',');
			if (seen.has(key)) continue;
			seen.add(key);
			groups.push({ type: 'pdf', items });
		}

		// Title groups
		for (let [norm, items] of Object.entries(titleGroups)) {
			if (items.length < 2) continue;
			let ids = items.map(i => i.id);
			let key = ids.sort().join(',');
			if (seen.has(key)) continue;
			seen.add(key);
			groups.push({ type: 'title', items });
		}

		return groups;
	},

	async tagDuplicates(groups) {
		await Zotero.DB.executeTransaction(async () => {
			for (let group of groups) {
				for (let item of group.items) {
					item.addTag('duplicate');
					await item.save();
				}
			}
		});
	}
};
