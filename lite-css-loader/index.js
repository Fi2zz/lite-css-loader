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
	const urls = urlParser(css);
	let code = JSON.stringify(css);
	const beforeCode = `var CSS_CHUNK = [];export default CSS_CHUNK;`.trim();
	let importCodes = "";
	let index = 0;
	for (let [startPos, endPos] of urls) {
		const urlValue = css.slice(startPos, endPos);
		const importName = `___CSS_LOADER_URL_IMPORT_${index}`;
		const importUrl = stringifyRequest(this, urlValue);
		importCodes += `var  ${importName} = new URL(${importUrl}, import.meta.url);\n`;
		code = code.replace(
			new RegExp(urlValue, "g"),
			() => `" + ${importName} + "`
		);
		index++;
	}
	// Indexes description:
	// 0 - module id
	// 1 - CSS code
	return `${beforeCode}//Imports\n${importCodes}// Module\nCSS_CHUNK.push([module.id, ${code}]);\n`;
}

function urlParser(source) {
	const urlsPositions = new Set();
	let pos = -1;
	let max = source.length;
	// 34 ""
	// 39 '
	// 105 i
	// 45 -
	// 117 u
	// 40 (
	// 41 )

	function tryParseUrl() {
		pos += 4;
		let startPos = pos;
		let ch = source.charCodeAt(pos);
		if (ch == 34 || ch == 39) {
			pos++;
			startPos = pos;
		}
		while (pos++ < max) {
			ch = source.charCodeAt(pos);
			if (ch === 32 || (ch < 14 && ch > 8)) continue;
			// ")
			if (ch == 34 || ch == 39) ch = source.charCodeAt(pos + 1);
			if (ch == 41) {
				urlsPositions.add([startPos, pos]);
				break;
			}
		}
	}
	function tryParseQuoteUrl() {
		pos++;
		let startPos = pos;
		let ch = commentWhitespace(true);
		while (pos++ < max) {
			ch = source.charCodeAt(pos);
			if (ch != 34 && ch != 39) continue;
			let next_ch = source.charCodeAt(pos + 1);
			urlsPositions.add([startPos, pos]);
			/*
			image-set("url/to/path/1","url/to/path/2")
			image - set(
				"url/to/path/1",
				"url/to/path/2"
			)
			 */
			if (next_ch == 44) {
				pos++;
				if (ch == 34) stringLiteral(ch);
				ch = commentWhitespace(true);
				tryParseQuoteUrl();
			} else if (next_ch == 32) {
				/*
			image - set(
				"url/to/path/1"  type(mime-type),
				"url/to/path/2"  type(mime-type)
			)
			 */
				ch = commentWhitespace(true);
				const stash = pos;
				while (pos++ < max) {
					let ch = source.charCodeAt(pos);
					if (ch == 32 || (ch < 14 && ch > 8)) continue;
					if (ch == 116 && source.slice(pos, pos + 5) == "type(") {
						pos += 5;
						ch = commentWhitespace(true);
						stringLiteral(ch);
						if (ch == 34 || ch == 39) {
							pos += 1;
							ch = commentWhitespace(true);
							// )
							if (ch == 41) pos += 1;
							// ),
							ch = source.charCodeAt(pos);
							if (ch == 44) {
								pos += 1;
								commentWhitespace(true);
								tryParseQuoteUrl();
							}
							break;
						}
					}
				}
				pos = stash;
			}

			break;
		}
	}

	function mainParser() {
		while (pos++ < max) {
			let ch = source.charCodeAt(pos);
			if (ch === 32 || (ch < 14 && ch > 8)) continue;

			// 117 - u  url()
			if (ch == 117) {
				let atImportRule = `@import `;
				if (source.slice(pos, pos + 4) == "url(") {
					let part = source.slice(pos - atImportRule.length - 1, pos).trim();
					if (part == "@import") continue;
					tryParseUrl();
				}
			}
			//  105 -> i
			//  image-set()
			//  -webkit-image-set()
			if (ch == 105) {
				const isImageSet = source.slice(pos, pos + 10) == "image-set(";
				if (isImageSet) {
					pos += 10;
					ch = commentWhitespace(true);
					//  image-set(url(url/to/image))
					if (ch == 117) tryParseUrl();
					//  image-set("url/to/image")
					if (ch == 34 || ch == 39) tryParseQuoteUrl();
				}
			}
		}
		return urlsPositions;
	}
	return mainParser();
	// Ported from es-module-lexer
	function isBr(c) {
		return c === 13 /*\r*/ || c === 10 /*\n*/;
	}

	function isWsNotBr(c) {
		return c === 9 || c === 11 || c === 12 || c === 32 || c === 160;
	}

	function isBrOrWs(c) {
		return (c > 8 && c < 14) || c === 32 || c === 160;
	}
	function commentWhitespace(br) {
		let ch;
		do {
			ch = source.charCodeAt(pos);
			if (ch === 47 /*/*/) {
				const next_ch = source.charCodeAt(pos + 1);
				if (next_ch === 47 /*/*/) lineComment();
				else if (next_ch === 42 /***/) blockComment(br);
				else return ch;
			} else if (br ? !isBrOrWs(ch) : !isWsNotBr(ch)) {
				return ch;
			}
		} while (pos++ < max);
		return ch;
	}

	function blockComment(br) {
		pos++;
		while (pos++ < max) {
			const ch = source.charCodeAt(pos);
			if (!br && isBr(ch)) return;
			if (ch === 42 /***/ && source.charCodeAt(pos + 1) === 47 /*/*/) {
				pos++;
				return;
			}
		}
	}

	function lineComment() {
		while (pos++ < max) {
			const ch = source.charCodeAt(pos);
			if (ch === 10 /*\n*/ || ch === 13 /*\r*/) return;
		}
	}

	function stringLiteral(quote) {
		while (pos++ < max) {
			let ch = source.charCodeAt(pos);
			if (ch === quote) return;
			if (ch === 92 /*\*/) {
				ch = source.charCodeAt(++pos);
				if (ch === 13 /*\r*/ && source.charCodeAt(pos + 1) === 10 /*\n*/) pos++;
			} else if (isBr(ch)) break;
		}
	}
}
