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

	openDialog(parentWindow) {
		let win = parentWindow.open(
			'about:blank',
			'find-duplicates-dialog',
			'chrome,centerscreen,resizable,width=600,height=500'
		);
		win.addEventListener('load', () => this._buildDialog(win, parentWindow));
	},

	_buildDialog(win, parentWindow) {
		let doc = win.document;
		doc.title = 'Find Duplicate Items';

		let style = doc.createElement('style');
		style.textContent = `
			body { font-family: -apple-system, sans-serif; padding: 12px; margin: 0; display: flex; flex-direction: column; height: 100vh; box-sizing: border-box; background: -moz-Dialog; color: -moz-DialogText; }
			.phase { display: none; flex-direction: column; flex: 1; min-height: 0; }
			.phase.active { display: flex; }
			.groups { flex: 1; overflow-y: auto; border: 1px solid #ccc; padding: 4px; margin: 8px 0; }
			.group { margin-bottom: 8px; padding: 6px; border: 1px solid #ddd; border-radius: 4px; }
			.group-header { font-weight: bold; }
			.group-item { margin-left: 24px; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
			.buttons { display: flex; justify-content: flex-end; gap: 8px; padding-top: 8px; }
			progress { width: 100%; margin: 8px 0; }
		`;
		doc.head.appendChild(style);

		// Phase 1: Scanning
		let scanPhase = this._el(doc, 'div', { className: 'phase active', id: 'scan-phase' });
		let scanStatus = this._el(doc, 'div', { textContent: 'Scanning items\u2026' });
		let scanProgress = doc.createElement('progress');
		scanProgress.value = 0;
		scanProgress.max = 100;
		let scanButtons = this._el(doc, 'div', { className: 'buttons' });
		let cancelScanBtn = this._el(doc, 'button', { textContent: 'Cancel' });
		scanButtons.appendChild(cancelScanBtn);
		scanPhase.append(scanStatus, scanProgress, scanButtons);

		// Phase 2: Results
		let resultsPhase = this._el(doc, 'div', { className: 'phase', id: 'results-phase' });
		let resultsSummary = this._el(doc, 'div');
		let resultsList = this._el(doc, 'div', { className: 'groups' });
		let resultsButtons = this._el(doc, 'div', { className: 'buttons' });
		let cancelResultsBtn = this._el(doc, 'button', { textContent: 'Cancel' });
		let tagBtn = this._el(doc, 'button', { textContent: 'Tag Duplicates' });
		resultsButtons.append(cancelResultsBtn, tagBtn);
		resultsPhase.append(resultsSummary, resultsList, resultsButtons);

		// Phase 3: No results
		let noResultsPhase = this._el(doc, 'div', { className: 'phase', id: 'noresults-phase' });
		let noResultsMsg = this._el(doc, 'div', { textContent: 'No duplicate items found.' });
		let noResultsButtons = this._el(doc, 'div', { className: 'buttons' });
		let closeBtn = this._el(doc, 'button', { textContent: 'Close' });
		noResultsButtons.appendChild(closeBtn);
		noResultsPhase.append(noResultsMsg, noResultsButtons);

		// Phase 4: Done
		let donePhase = this._el(doc, 'div', { className: 'phase', id: 'done-phase' });
		let doneLabel = this._el(doc, 'div');
		let doneButtons = this._el(doc, 'div', { className: 'buttons' });
		let doneCloseBtn = this._el(doc, 'button', { textContent: 'Close' });
		doneButtons.appendChild(doneCloseBtn);
		donePhase.append(doneLabel, doneButtons);

		doc.body.append(scanPhase, resultsPhase, noResultsPhase, donePhase);

		function showPhase(phase) {
			for (let p of [scanPhase, resultsPhase, noResultsPhase, donePhase]) {
				p.className = 'phase' + (p === phase ? ' active' : '');
			}
		}

		let cancelToken = { cancelled: false };
		cancelScanBtn.onclick = () => { cancelToken.cancelled = true; win.close(); };
		cancelResultsBtn.onclick = () => win.close();
		closeBtn.onclick = () => win.close();
		doneCloseBtn.onclick = () => win.close();

		// Run scan
		this.scan(
			(current, total, title) => {
				let pct = total > 0 ? Math.round((current / total) * 100) : 0;
				scanProgress.value = pct;
				scanStatus.textContent = `Scanning ${current}/${total}: ${title || ''}`;
			},
			cancelToken
		).then(groups => {
			if (cancelToken.cancelled) return;
			if (!groups || groups.length === 0) {
				showPhase(noResultsPhase);
				return;
			}

			showPhase(resultsPhase);
			let totalItems = groups.reduce((n, g) => n + g.items.length, 0);
			resultsSummary.textContent = `Found ${groups.length} group(s) with ${totalItems} total items.`;

			let checkboxes = [];
			for (let group of groups) {
				let groupDiv = this._el(doc, 'div', { className: 'group' });
				let header = this._el(doc, 'label', { className: 'group-header' });
				let cb = doc.createElement('input');
				cb.type = 'checkbox';
				cb.checked = true;
				checkboxes.push(cb);
				let typeText = group.type === 'pdf' ? ' [PDF match]' : ' [Title match]';
				header.append(cb, typeText);
				groupDiv.appendChild(header);

				for (let item of group.items) {
					let creators = item.getCreators();
					let author = creators.length > 0 ? creators[0].lastName : 'Unknown';
					let year = item.getField('date') ? item.getField('date').substring(0, 4) : '????';
					let title = item.getField('title') || '(no title)';
					let row = this._el(doc, 'div', {
						className: 'group-item',
						textContent: `${author} (${year}) \u2014 ${title}`
					});
					groupDiv.appendChild(row);
				}
				resultsList.appendChild(groupDiv);
			}

			tagBtn.onclick = async () => {
				let selected = groups.filter((g, i) => checkboxes[i].checked);
				if (selected.length === 0) { win.close(); return; }
				await this.tagDuplicates(selected);
				let count = selected.reduce((n, g) => n + g.items.length, 0);
				doneLabel.textContent = `Tagged ${count} items as "duplicate".`;
				showPhase(donePhase);
				let zp = parentWindow.ZoteroPane;
				if (zp && zp.tagSelector) {
					zp.tagSelector.selectedTags.clear();
					zp.tagSelector.selectedTags.add('duplicate');
					await zp.updateTagFilter();
				}
			};
		});
	},

	_el(doc, tag, props) {
		let el = doc.createElement(tag);
		if (props) Object.assign(el, props);
		return el;
	},

	normalizeTitle(title) {
		if (!title) return '';
		return title.toLowerCase().replace(/[^a-z0-9]/g, '');
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

			let norm = this.normalizeTitle(item.getField('title'));
			if (norm) {
				if (!titleGroups[norm]) titleGroups[norm] = [];
				titleGroups[norm].push(item);
			}

			let attachmentIDs = item.getAttachments();
			for (let attID of attachmentIDs) {
				let att = Zotero.Items.get(attID);
				let hash = att.attachmentContentType === 'application/pdf'
					&& att.attachmentSyncedHash;
				if (hash) {
					if (!hashGroups[hash]) hashGroups[hash] = [];
					hashGroups[hash].push(item);
					break;
				}
			}

			if (++yieldCounter % 50 === 0) {
				await new Promise(r => setTimeout(r, 0));
			}
		}

		progressCallback(total, total, 'Building results\u2026');

		let seen = new Set();
		let groups = [];

		for (let [, items] of Object.entries(hashGroups)) {
			if (items.length < 2) continue;
			let key = items.map(i => i.id).sort().join(',');
			if (seen.has(key)) continue;
			seen.add(key);
			groups.push({ type: 'pdf', items });
		}

		for (let [, items] of Object.entries(titleGroups)) {
			if (items.length < 2) continue;
			let key = items.map(i => i.id).sort().join(',');
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
