module.exports = loader;

const IS_MODULE_REQUEST = /^[^?]*~/;
function stringifyRequest(loader, url) {
	const contextify = (url) =>
		JSON.stringify(
			loader.utils.contextify(loader.context || loader.rootContext, url)
		);

	if (url.charAt(0) === "/" || /^file:/i.test(url)) return contextify(url);
	// A `~` makes the url an module
	if (IS_MODULE_REQUEST.test(url)) url = url.replace(IS_MODULE_REQUEST, "");
	return contextify(url);
}

function loader(css) {
	try {
		const replacements = getReplacements(css);
		let code = JSON.stringify(css);
		const beforeCode = `
		var ___CSS_LOADER_EXPORT___ = [];
		export default ___CSS_LOADER_EXPORT___;	`.trim();
		let importCodes = "";
		for (const [replacementName, importName] of replacements.entries()) {
			let url = stringifyRequest(this, replacementName);
			importCodes += `var  ${importName} = new URL(${url}, import.meta.url);\n`;
			code = code.replace(
				new RegExp(replacementName, "g"),
				() => `" + ${importName} + "`
			);
		}
		// Indexes description:
		// 0 - module id
		// 1 - CSS code
		return `${beforeCode}//Imports \n${importCodes}// Module\n___CSS_LOADER_EXPORT___.push([module.id, ${code}]);\n`;
	} catch (error) {
		throw error;
	}
}

function getReplacements(source) {
	const replacements = new Map();
	let pos = -1;
	let end = source.length - 1;
	let ch = 0;
	source = source.trim();

	// 34 ""
	// 39 '
	// 105 i
	// 45 -
	// 117 u

	while (pos++ < end) {
		ch = source.charCodeAt(pos);
		if (ch === 32 || (ch < 14 && ch > 8)) continue;
		// url
		if (ch == 117) {
			if (source.startsWith("rl", pos + 1)) {
				pos++;
				tryParseUrlFunction();
			}
		}
		// 45 -   -webkit-image-set
		// 105 i  image-set
		if (ch == 105) {
			let isImageSet = source.slice(pos, pos + 9) == "image-set";
			if (isImageSet) tryParseImageSet();
		}
	}
	function tryParseImageSet() {
		pos += 10;
		let ch = 0;
		while (pos++ < end) {
			ch = source.charCodeAt(pos);
			if (ch == 32 || (ch > 8 && ch < 14)) continue;
			// image-set(url("url/to/file"))
			// -webkit-image-set(url("url/to/file"))
			if (ch == 117 && source.slice(pos, pos + 3) == "url") {
				pos++;
				tryParseUrlFunction();
			}

			//  image-set("url/to/file")
			//  -webkit-image-set("url/to/file")
			else if (ch == 34 || ch == 39) pos++;
		}
	}

	function tryParseUrlFunction() {
		pos += 3;
		let ch = source.charCodeAt(pos);
		if (ch == 34 || ch == 39) pos++;
		let endPos = -1;
		let startPos = pos;
		while (pos++ < end) {
			let ch = source.charCodeAt(pos);
			if (ch == 34 || ch == 39) continue;
			if (startPos == -1) startPos = pos;
			if (ch != 41) endPos = pos + 1;
			else break;
		}
		let replacementKey = source.slice(startPos, endPos);
		let replacementName = replacements.get(replacementKey);
		if (!replacementName) {
			replacementName = `___CSS_LOADER_URL_IMPORT_${replacements.size}`;
			replacements.set(replacementKey, replacementName);
		}
	}
	return replacements;
}
