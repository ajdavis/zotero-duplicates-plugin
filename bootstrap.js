var FindDuplicates;

function log(msg) {
	Zotero.debug("Find Duplicates: " + msg);
}

function install() {
	log("Installed");
}

async function startup({ id, version, rootURI }) {
	log("Starting");
	Services.scriptloader.loadSubScript(rootURI + 'duplicates.js');
	FindDuplicates.init({ id, version, rootURI });
	FindDuplicates.addToAllWindows();
}

function onMainWindowLoad({ window }) {
	FindDuplicates.addToWindow(window);
}

function onMainWindowUnload({ window }) {
	FindDuplicates.removeFromWindow(window);
}

function shutdown() {
	log("Shutting down");
	FindDuplicates.removeFromAllWindows();
	FindDuplicates = undefined;
}

function uninstall() {
	log("Uninstalled");
}
