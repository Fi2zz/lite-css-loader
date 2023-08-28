module.exports = loader;
const __AT_IMPORT__ = "@import";
const __IMAGE_SET__ = "image-set(";
const __URL__ = "url(";
const TYPE_IMPORT = "IMPORT";
const TYPE_URL = "URL";
const isDataURL = (url) => /data:/.test(url);

function isHttp(url) {
	return /http(s?)\:\/\//g.test(url);
}
function getImportCode(imports, requires) {
	const _imports = imports
		.filter((node) => !node.http)
		.map(({ supports, media, layer, importName, importSource }) => {
			return `
			import ${importName} from ${importSource};
			_import(${importName}, ${JSON.stringify({ supports, media, layer })});
			`.trim();
		});
	const _requires = requires
		.filter((node) => !node.http)
		.map(
			({ importName, importSource }) =>
				`var ${importName} = new URL(${importSource}, import.meta.url);`
		);
	return _imports.concat(_requires);
}

function getPreambleCode() {
	const preamble = `
	var  CSS_MODULE=[];
	function wrappSupports(code, supports){
		supports = supports.replace('supports(','').replace(')','');
		return "@supports("+ supports +"){\\n"   + code +"\\n}"
	}
	function wrappMedia(code , media){
		return "@media "+ media +"{\\n"   + code +"\\n}"
	}
	function wrappLayer(code, layer){
		layer = layer.replace('layer(','').replace(')','');
		return "@layer "+layer +"{\\n"   + code +"\\n}"
	}
	const _import =(modules , {supports , media, layer} ={})=>{
		for (let node  of modules){
			const moduleId = node[0];
			let code=node[1];
			code =!layer ? code : wrappLayer(code, layer)
			code =!media? code: wrappMedia(code, media)
			code = !supports ? code: wrappSupports(code, supports)
			CSS_MODULE.push([moduleId,code])
		}
	}
	const _push =(id, code , options )=> _import([[id, code]], options )
	// Exports
	export default  CSS_MODULE;
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

const createRequestStringifier = (loader) => {
	const preRequest = getPreRequester(loader);
	const contextify = (url) => loader.utils.contextify(ctx, url);
	const ctx = loader.context || loader.rootContext;
	function stringifyRequest(url, type, http) {
		if (http) return url;
		if (type == TYPE_IMPORT) url = combineRequests(preRequest, url);
		url = contextify(url.replace(MODULE_REQUEST, ""));
		return url;
	}
	return (url, type, http) => JSON.stringify(stringifyRequest(url, type, http));
};
const normalizeOptions = (raw) => {
	return {
		url: typeof raw.url == "boolean" ? raw.url : true,
		import: typeof raw.import == "boolean" ? raw.import : true,
	};
};

function getModuleCode(source, _urls, _imports) {
	function replaces(code, replacements, skipHttp) {
		for (const node of replacements) {
			if (skipHttp && node.http) continue;
			code = code.replace(node.replaceName, () => node.replaceValue);
		}
		return code;
	}
	// @import("some/path/file.css") -> ''
	// @import("/some/path/file.css") -> ''
	// @import("./some/path/file.css") -> ''
	// @import("http://some.com/some.css") -> ''
	source = replaces(source, _imports, false);
	source = JSON.stringify(source);
	//  background-image:url(http://some.com/some.jpg) -> bakckground-image:url(http://some.com/some.jpg)
	//  background-image:url(./some.com/some.jpg) 	   ->  background-image:url(" + URL_index + ")
	//  background-image:url(/some.com/some.jpg) 	   ->  background-image:url(" + URL_index + ")
	//  background-image:url(some.com/some.jpg) 	   ->  background-image:url(" + URL_index + ")
	source = replaces(source, _urls, true);
	return [`_push(module.id,${source})`];
}

function loader(source) {
	const loader = this;
	const options = normalizeOptions(this.getOptions());
	const [urls, atImports] = urlParser(source, options);
	const stringifyRequest = createRequestStringifier(loader);
	const _urls = getReplacements(urls, stringifyRequest);
	const _imports = getReplacements(atImports, stringifyRequest);
	const returns = []
		.concat(getPreambleCode())
		.concat(getImportCode(_imports, _urls))
		.concat(getAtImportModuleCode(_imports))
		.concat(getModuleCode(source, _urls, _imports));
	return returns.join("\n");
}

function getAtImportModuleCode(importsReplacements) {
	function atImportTemplate({ url, supports, media, layer }) {
		let tpl = `@import url(${url})`;
		if (layer) tpl += `${layer}`;
		if (supports) tpl += ` ${supports}`;
		if (media) tpl += ` ${media}`;
		tpl += ";";
		tpl = JSON.stringify(tpl);
		return `_push(module.id,  ${tpl})`;
	}
	return importsReplacements.filter((node) => node.http).map(atImportTemplate);
}

function getReplacements(urls, noralizeRequest) {
	return urls.map(([replaceName, type, url, supports, media, layer], index) => {
		const http = isHttp(url);
		const importName = `${type}_${index}`;
		const replaceValue = type == TYPE_IMPORT ? "" : `" + ${importName} + "`;
		const importSource = noralizeRequest(url, type, http || isDataURL(url));
		return {
			url,
			http: http || isDataURL(url),
			importName,
			replaceName,
			replaceValue,
			importSource,
			supports,
			media,
			layer,
			type,
		};
	});
}

function urlParser(source, options) {
	if (!options.url && !options.import) return [[], []];

	const RESupports = /supports\(.*.+\)(\s?)/g;
	const REScreen = /screen(\s+)and(\s+)\(.*\)/;
	const RELayer = /layer(\(.*\))?/;
	const values = [];
	const imports = [];
	let pos = -1;
	let end = source.length;
	// 34 ""
	// 39 '
	// 105 i
	// 45 -
	// 117 u
	// 40 (
	// 41 )
	const isImageSet = () => source.slice(pos, pos + 10) == __IMAGE_SET__;
	const isURL = () => source.slice(pos, pos + 4) == __URL__;
	const isAtImport = () => source.slice(pos, pos + 7) == __AT_IMPORT__;
	const push = (s, e, t) => {
		if (!options.import && t == TYPE_IMPORT) return;
		if (!options.url && t == TYPE_URL) return;
		if (t == TYPE_URL) values.push([s, e, t]);
		if (t == TYPE_IMPORT) imports.push([s, e, t]);
	};

	function trimImport(value) {
		const openIndex = value.indexOf("(");
		const closeIndex = value.indexOf(")");
		if (openIndex == -1 || closeIndex == -1) return value;
		return value
			.slice(openIndex + 1, closeIndex)
			.replace(/^["']/, "")
			.replace(/["']$/, "");
	}

	function extractSupports(value) {
		if (!RESupports.test(value)) return null;
		const result = value.match(RESupports);
		if (!result) return null;
		value = result[0].trim();
		const openIndex = value.indexOf("supports(");
		const closeIndex = value.indexOf(")") + 1;
		if (closeIndex == 0 || openIndex < 0) return null;
		let slice = value.slice(openIndex, closeIndex + 1);
		return slice || null;
	}
	function doMatch(value, RE) {
		if (!RE.test(value)) return null;
		const result = value.match(RE);
		return result ? result[0] : null;
	}

	function extractMedia(value) {
		return doMatch(value, REScreen);
	}

	function extractLayer(value) {
		return doMatch(value, RELayer);
	}

	function read([s, e, type]) {
		const value = source.slice(s, e);
		return [
			value,
			type,
			trimImport(value),
			extractSupports(value, RESupports),
			extractMedia(value, REScreen),
			extractLayer(value, RELayer),
		];
	}
	function tryParseUrl() {
		pos += 4;
		let startPos = pos;
		let ch = source.charCodeAt(pos);
		if (ch == 34 || ch == 39) {
			pos++;
		} else if (ch == 47) {
			//  url (/*comment */ "some/url/to/image")
			ch = commentWhitespace();
			/* / */
			if (ch == 47) pos++;
			ch = source.charCodeAt(pos);
			if (ch == 34 || ch == 39) pos++;
		}
		startPos = pos;
		while (pos++ < end) {
			ch = source.charCodeAt(pos);
			if (ch === 32 || (ch < 14 && ch > 8)) continue;
			//  url (/*comment */ "some/url/to/image")
			//  url ( "some/url/to/image" /*comment */)
			if (ch == 47) {
				commentWhitespace();
				pos++;
			}
			// url(/image/url)
			// url("/image/url")
			// url('/image/url')
			if (ch == 34 || ch == 39 || ch == 41) {
				push(startPos, pos, TYPE_URL);
				break;
			}
		}
	}

	/*
	image-set("url/to/path/1","url/to/path/2")
	image - set(
		"url/to/path/1",
		"url/to/path/2",
		"url/to/path/2" type(image/jpg),
		"url/to/path/2",
		"url/to/path/2" type("image/jpg")
	)
	*/
	function tryParseStringUrl() {
		pos++;
		let startPos = pos;
		while (pos++ < end) {
			let ch = source.charCodeAt(pos);
			if (ch == 32 || (ch < 14 && ch > 8)) continue;
			if (ch != 34 && ch != 39) continue;
			push(startPos, pos, TYPE_URL);
			let next_ch = source.charCodeAt(pos + 1);

			// ,
			if (next_ch == 44) {
				pos++;
				if (ch == 34 || ch == 39) stringLiteral(ch);
				ch = commentWhitespace();
				tryParseStringUrl();
			}
			//  whitespace
			else if (next_ch == 32) {
				ch = commentWhitespace();
				if (ch == 34 || ch == 39) stringLiteral(ch);
				pos++;
				next_ch = source.charCodeAt(pos + 1);
				if (next_ch == 32 || (next_ch < 14 && next_ch > 8)) pos++;
				next_ch = commentWhitespace();
				if (next_ch == 34 || next_ch == 39) tryParseStringUrl();
			}
			break;
		}
	}

	let _unnamed_layer = "layer;";

	function isUnamedLayer() {
		return (
			source.slice(pos - _unnamed_layer.length + 1, pos + 1) == _unnamed_layer
		);
	}

	function parseAtImport() {
		let startPos = pos;
		pos += 7;
		while (pos++ < end) {
			let ch = source.charCodeAt(pos);
			if (ch === 32 || (ch < 14 && ch > 8)) continue;

			// @import url('some/css.css') layer;
			if (ch == 59 && isUnamedLayer()) {
				push(startPos, pos + 1, TYPE_IMPORT);
				break;
			}
			// @import url('some/css.css');
			// @import url('some/css.css') layer(some-layer);
			// @import url('some/css.css') screen and (max-width: 1200px);
			// @import url('some/css.css') supports(display: grid);
			// @import url('some/css.css') supports(display: grid) screen and (max-width: 1200px);
			if (ch == 41 && source.charCodeAt(pos + 1) == 59) {
				pos++;
				push(startPos, pos + 1, TYPE_IMPORT);
				break;
			}
		}
	}
	function parseImageSet() {
		pos += 10;
		let ch = commentWhitespace();
		//  image-set(url(url/to/image))
		if (ch == 117) tryParseUrl();
		//  image-set("url/to/image")
		else if (ch == 34 || ch == 39) tryParseStringUrl();
	}

	function main() {
		while (pos++ < end) {
			let ch = source.charCodeAt(pos);
			if (ch === 32 || (ch < 14 && ch > 8)) continue;
			switch (ch) {
				case 47:
					blockComment();
					break;
				//  @import
				case 64:
					if (isAtImport()) parseAtImport();
					break;
				// url
				case 117:
					if (isURL()) tryParseUrl();
					break;
				//  105 -> i
				//  image-set()
				//  -webkit-image-set()
				case 105:
					if (isImageSet()) parseImageSet();
					break;
			}
		}
		return [values.map(read), imports.map(read)];
	}
	return main();
	// Ported from es-module-lexer
	function commentWhitespace() {
		const isBrOrWs = (ch) => (ch > 8 && ch < 14) || ch === 32 || ch === 160;
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
	// css only have block comment
	function blockComment() {
		pos++;
		while (pos++ < end) {
			const ch = source.charCodeAt(pos);
			if (ch === 42 /***/ && source.charCodeAt(pos + 1) === 47 /*/*/) {
				pos++;
				return;
			}
		}
	}
	//  backgrond-image: url("image/url")
	//  @import url("css/url")
	function stringLiteral(quote) {
		while (pos++ < end) {
			let ch = source.charCodeAt(pos);
			if (ch === quote) return;
			if (ch === 92 /*\*/) {
				ch = source.charCodeAt(++pos);
				if (ch === 13 /*\r*/ && source.charCodeAt(pos + 1) === 10 /*\n*/) pos++;
			} else if (ch === 13 /*\r*/ || ch === 10 /*\n*/) break;
		}
	}
}
