module.exports = loader;
const __AT_IMPORT__ = "@import";
const __IMAGE_SET__ = "image-set(";
const __URL__ = "url(";
const TYPE_IMPORT = "IMPORT";
const TYPE_URL = "URL";
const webpackIgnoreRE = /webpackIgnore:(\s)?true/;
function isDataURL(url) {
	return /data:/.test(url);
}
function sortMap(values) {
	return values.sort((a, b) => a.index - b.index).map((node) => node.value);
}
function isHttp(url) {
	return /http(s?)\:\/\//g.test(url);
}
function createURL(importName, importSource) {
	return `var ${importName} = new URL(${importSource}, import.meta.url);`;
}
function createImport(importName, importSource, features) {
	const options = JSON.stringify(features);

	const _import = (code) => `_import(${code},${options})`;
	if (!importName) {
		// @import(http://path/to/css)
		const code = JSON.stringify(`@import url(${importSource});`);
		return _import(`[[module.id,${code}]]`);
	}
	return `import ${importName} from ${importSource};${_import(importName)};`;
}

function getPreambleCode() {
	const preamble = `
	const CSS_MODULE=[];
	const _import =  (modules,{supports,media,layer})=>{
		for (let node  of modules){
			const [moduleId, code] = node
			CSS_MODULE.push([moduleId,code,media, "", supports, layer])
		}
	}
	const _push =(id, code , options )=> _import([[id, code]], options||{})
	export default CSS_MODULE;
	`.trim();
	return [preamble];
}

// ported from  css-loader/dist/utils.js
function getPreRequester({ loaders, loaderIndex }) {
	const req = loaders
		.slice(loaderIndex, loaderIndex + 1)
		.map((x) => x.request)
		.join("!");
	return `-!${req}!`;
}

// ported from  css-loader/dist/utils.js
function combineRequests(preRequest, url) {
	const idx = url.indexOf("!=!");
	return idx !== -1
		? url.slice(idx + 3) + preRequest + url.slice(idx + 3)
		: preRequest + url;
}
const MODULE_REQUEST = /^[^?]*~/;

function createRequestStringifier(loader) {
	const preRequest = getPreRequester(loader);
	const contextify = (url) => loader.utils.contextify(ctx, url);
	const ctx = loader.context || loader.rootContext;
	function stringifyRequest(url, shouldCombineRequest) {
		if (shouldCombineRequest) url = combineRequests(preRequest, url);
		url = contextify(url.replace(MODULE_REQUEST, ""));
		return url;
	}
	return (url, combineRequest) =>
		JSON.stringify(stringifyRequest(url, combineRequest));
}

function normalizeOptions(loader) {
	rawOptions = loader.getOptions();

	const url = typeof rawOptions.url === "boolean" ? rawOptions.url : true;
	const _import =
		typeof rawOptions.import === "boolean" ? rawOptions.import : true;

	let urlFilter = (v) => true;
	let importFilter = (v) => true;
	if (url && typeof url == "object" && typeof url.filter == "function")
		urlFilter = (value) => url.filter(value, loader.resourcePath);

	if (
		_import &&
		typeof _import == "object" &&
		typeof _import.filter == "function"
	)
		importFilter = (value, { media, supports, layer }) =>
			_import.filter(value, media, loader.resourcePath, supports, layer);

	const stringifyRequest = createRequestStringifier(loader);

	const sourceMap =
		typeof rawOptions.sourceMap == "boolean"
			? rawOptions.sourceMap
			: loader.sourceMap;

	return {
		url,
		import: _import,
		sourceMap,
		urlFilter,
		importFilter,
		stringifyRequest,
	};
}

function applyReplacments(source, replacements) {
	source = JSON.stringify(source);
	for (const [importName, replacement, needQuote] of replacements) {
		const value = needQuote ? `'${replacement}'` : replacement;
		source = source.replace(new RegExp(importName), value);
	}
	return [`_push(module.id,${source})`];
}
function loader(source) {
	const options = normalizeOptions(this);

	let imports = [];
	let urls = [];
	let replacements = [];
	function addImport(raw) {
		const rules = readRules(raw);
		let importSource = unquote(raw);
		if (!options.importFilter(importSource, rules)) return false;
		const needResolve = !isHttp(importSource) && !isDataURL(importSource);
		let create = !needResolve;
		let importName = null;
		if (options.import && needResolve) {
			create = true;
			importName = `${TYPE_IMPORT}_${imports.length}`;
			importSource = options.stringifyRequest(importSource, true);
		}
		if (create) {
			const value = createImport(importName, importSource, rules);
			imports.push({ value, index: imports.length });
		}
		return true;
	}
	function addURL(raw, needQuote) {
		let importSource = unquote(raw);
		if (!options.urlFilter(importSource)) return null;
		const http = isHttp(importSource);
		if (http) return null;
		let importName = `${TYPE_URL}_${urls.length}`;
		importSource = options.stringifyRequest(importSource);
		if (options.url) {
			replacements.push([importName, `"+ ${importName}+"`, needQuote]);
			const value = createURL(importName, importSource);
			urls.push({ value, index: urls.length });
		}
		return importName;
	}

	const _source = builder(source, { addImport, addURL });
	const returns = []
		.concat(getPreambleCode())
		.concat(sortMap(urls))
		.concat(sortMap(imports))
		.concat(applyReplacments(_source, replacements));
	return returns.join("\n");
}

function unquote(string) {
	let pos = -1;

	let openPos = null;
	let closePos = null;
	let leftQuote = null;
	let rightQuote = null;
	while (pos++ < string.length) {
		let ch = string.charCodeAt(pos);

		// console.log({ ch });

		if (ch == 40 && openPos == null) {
			openPos = pos;
			// pos++;
		}

		if (ch == 39 || ch == 34) {
			if (leftQuote != null && rightQuote == null) {
				rightQuote = pos;
				break;
			}
			if (leftQuote == null) leftQuote = pos + 1;
		}
		if (ch == 41 && closePos == null) {
			closePos = pos;
			if (leftQuote == null) break;
		}
	}

	// remove `(` and  `)`
	if (openPos != null && closePos != null)
		string = string.substring(openPos + 1, closePos);
	// remove `"` and `'`
	if (leftQuote != null && rightQuote != null)
		string = string.substring(leftQuote, rightQuote);
	return string.trim();
}

function readRules(raw) {
	let layer;
	let supports;
	let media;
	const layerOpen = `layer(`;
	const supportsOpen = "supports(";
	const screenOpen = "screen ";
	if (raw.includes("layer ") || raw.endsWith("layer;")) {
		layer = "";
	} else if (raw.includes(layerOpen)) {
		const open = raw.indexOf(layerOpen);
		if (open > 0) {
			raw = raw.substring(open).trim();
			const close = raw.indexOf(")");
			layer = raw.substring(layerOpen.length, close);
			raw = raw.substring(close + 1).trim();
		}
	}
	if (raw.includes(supportsOpen)) {
		const open = raw.indexOf(supportsOpen);
		raw = raw.substring(open).trim();
		const close = raw.indexOf(")");
		supports = raw.substring(supportsOpen.length, close);
		raw = raw.substring(close + 1).trim();
	}
	if (raw.includes(screenOpen)) {
		const open = raw.indexOf(screenOpen);
		media = raw.substring(open).replace(";", "").trim();
	}
	return { layer, supports, media };
}
function builder(input, { addImport, addURL }) {
	let webpackIgnore = false;
	let source = input;
	let pos = -1;
	let end = source.length;
	const isImageSet = () => source.slice(pos, pos + 10) == __IMAGE_SET__;
	const isURL = () => source.slice(pos, pos + 4) == __URL__;
	const isAtImport = () => source.slice(pos, pos + 7) == __AT_IMPORT__;
	function checkWebpackIgnore(startPos, endPos) {
		webpackIgnore = false;
		const slice = source.slice(startPos, endPos);
		if (!webpackIgnoreRE.test(slice)) return;
		const ch = source.charCodeAt(endPos);
		webpackIgnore = ch == 10 || ch == 32;
	}

	function updateSource(startPos, endPos, { replacement, offset }) {
		webpackIgnore = false;

		let part1 = source.substring(0, startPos);
		let part2 = source.substring(endPos, source.length);
		// update source
		source = part1 + replacement + part2;
		pos = part1.length + offset;
		// update end
		end = source.length;
	}
	function read(type, startPos, endPos, needQuote) {
		if (webpackIgnore) {
			webpackIgnore = false;
			return;
		}
		let replacement;
		let offset = 0;
		const raw = source.slice(startPos, endPos);
		if (type == TYPE_IMPORT) {
			const added = addImport(raw);
			if (added) replacement = "\n";
		} else if (type == TYPE_URL) {
			replacement = addURL(raw, needQuote);
		}
		if (!replacement) return;
		updateSource(startPos, endPos, {
			offset,
			replacement,
		});
	}

	// 34 ""
	// 39 '
	// 105 i
	// 45 -
	// 117 u
	// 40 (
	// 41 )

	function main() {
		while (pos++ < end) {
			let ch = source.charCodeAt(pos);
			if (ch === 32 || (ch < 14 && ch > 8)) continue;
			switch (ch) {
				// /
				case 47:
					checkComment(ch);
					break;
				//  @import
				case 64:
					if (isAtImport()) parseAtImport();
					break;
				// url
				case 117:
					if (isURL()) parseURL(4, false);
					break;
				//  105 -> i
				//  image-set()
				//  -webkit-image-set()
				case 105:
					if (isImageSet()) parseImageSet();
					break;
			}
		}
		return source;
	}
	return main();
	function parseURL(forward = 4, needQuote) {
		let ch = source.charCodeAt(pos);
		pos += forward;
		let startPos = pos;
		ch = source.charCodeAt(pos);
		if (ch == 34 || ch == 39) pos++;
		startPos = pos;
		while (pos++ < end) {
			ch = source.charCodeAt(pos);
			if (ch === 32 || (ch < 14 && ch > 8)) continue;

			// image-set("image/path")
			// image-set(url("image/path"))
			// url("/image/url")
			// url('/image/url')
			if (ch == 34 || ch == 39) {
				read(TYPE_URL, startPos - 1, pos + 1, needQuote);
				break;
			}
			// image-set(url(image/path))
			// url(/image/url)
			if (ch == 41) {
				read(TYPE_URL, startPos, pos, false);
				break;
			}
		}
	}

	function readBreakOfLine() {
		while (pos++ < end) {
			ch = source.charCodeAt(pos);
			if (ch == 32) continue;
			if (ch < 14 && ch > 8) continue;
			if (ch == 59) {
				let next_ch = source.charCodeAt(pos + 1);
				if (next_ch == 10) {
					pos += 1;
					return true;
				}
			}
		}
		return false;
	}

	function parseAtImport() {
		let startPos = pos;
		pos += 7;
		let ch = commentWhitespace();
		checkComment(ch);
		if (ch != 117 && ch != 34 && ch != 39) return;
		const _isURL = isURL();
		const _stringLiteral = ch == 34 || ch == 39;
		const shouldRead = _isURL || _stringLiteral;
		if (!shouldRead) return;
		if (_stringLiteral) stringLiteral(ch);
		const isBOL = readBreakOfLine();
		if (!isBOL) return;
		// @import url(path/to/css);
		// @import url(path/to/css) layer;
		// @import url(path/to/css) layer(named);
		// @import url(path/to/css) layer(named) supports(feature);
		// @import url(path/to/css) layer(named) supports(feature) screen and (max-width:any);

		// @import url("path/to/css");
		// @import url("path/to/css") layer;
		// @import url("path/to/css") layer(named);
		// @import url("path/to/css") layer(named) supports(feature);
		// @import url("path/to/css") layer(named) supports(feature) screen and (max-width:any);

		// @import "path/to/css";
		// @import "path/to/css" layer;
		// @import "path/to/css" layer(named);
		// @import "path/to/css" layer(named) supports(feature);
		// @import "path/to/css" layer(named) supports(feature) screen and (max-width:any);
		read(TYPE_IMPORT, startPos, pos);
	}

	function checkComment(ch) {
		if (ch !== 47) return;
		if (source.charCodeAt(pos + 1) != 42) return;
		blockComment();
	}

	/*
	image-set("url/to/path/1","url/to/path/2")
	image-set(url(url/to/path/1),url("url/to/path/2"))
	image-set(url(url/to/path/1) type(mime-type),url("url/to/path/2") type(mime-type))
	image - set(
		"url/to/path/1",
		"url/to/path/2",
		"url/to/path/2" type(image/jpg),
		"url/to/path/2",
		"url/to/path/2" type("image/jpg")
	)
	*/
	function parseImageSet() {
		pos += 10;
		let ch = commentWhitespace();
		checkComment(ch);
		if (ch == 34 || ch == 39) parseURL(0, true);
		if (ch == 117 && isURL()) parseURL(4, false);
		while (pos++ < end) {
			let ch = source.charCodeAt(pos);
			if (ch == 32 || (ch < 14 && ch > 8)) continue;
			checkComment(ch);
			if (ch == 34 || ch == 39) parseURL(0, true);
			if (ch == 117 && isURL()) parseURL(4, false);
		}
	}

	// css only have block comment
	function blockComment() {
		let startPos = pos;
		pos++;
		while (pos++ < end) {
			const ch = source.charCodeAt(pos);
			if (ch === 42 /***/ && source.charCodeAt(pos + 1) === 47 /*/*/) {
				pos++;
				//  /* webpackIgnore:true */
				checkWebpackIgnore(startPos, pos + 1);
				return;
			}
		}
	}

	// Ported from es-module-lexer
	function isBrOrWs(ch) {
		return (ch > 8 && ch < 14) || ch === 32 || ch === 160;
	}
	function commentWhitespace() {
		let ch;
		do {
			ch = source.charCodeAt(pos);
			if (ch === 47 /*/*/) {
				const next_ch = source.charCodeAt(pos + 1);
				if (next_ch === 42 /***/) blockComment();
				else return ch;
			} else if (!isBrOrWs(ch)) return ch;
		} while (pos++ < end);
		return ch;
	}
	function stringLiteral(quote) {
		while (pos++ < end) {
			let ch = source.charCodeAt(pos);
			if (ch === quote) return;
			if (ch === 92 /*\*/) {
				ch = source.charCodeAt(++pos);
				if (ch === 13 /*\r*/ && source.charCodeAt(pos + 1) === 10 /*\n*/) pos++;
			} else if (ch == 13 || ch == 10) break;
		}
	}
}
