
# This project is not intended to replace `css-loader`, it just provides one more implementation possibility


# css-loader

The `css-loader` interprets `@import` and `url()` like `import/require()` and will resolve them.



For example:

**file.js**

```js
import "file.css";
```

**webpack.config.js**

```js
module.exports = {
	module: {
		rules: [
			{
				test: /\.css$/i,
				use: ["style-loader", "css-loader"],
			},
		],
	},
};
```

And run `webpack` via your preferred method.

If, for one reason or another, you need to extract CSS as a file (i.e. do not store CSS in a JS module) you might want to check out the [recommend example](https://github.com/webpack-contrib/css-loader#recommend).

## Options

- **[`url`](#url)**
- **[`import`](#import)**
- **[`modules`](#modules)** ❌
- **[`sourceMap`](#sourcemap)**
- **[`importLoaders`](#importloaders)** ❌
- **[`esModule`](#esmodule)** ❌
- **[`exportType`](#exporttype)** ❌

### `url`

Type:

```ts
type url =
	| boolean
	| {
			filter: (url: string, resourcePath: string) => boolean;
	  };
```

Default: `true`

Allow to enable/disables handling the CSS functions `url` and `image-set`.
If set to `false`, `css-loader` will not parse any paths specified in `url` or `image-set`.
A function can also be passed to control this behavior dynamically based on the path to the asset.
Starting with version [4.0.0](https://github.com/webpack-contrib/css-loader/blob/master/CHANGELOG.md#400-2020-07-25), absolute paths are parsed based on the server root.

Examples resolutions:

```js
url(image.png) => require('./image.png')
url('image.png') => require('./image.png')
url(./image.png) => require('./image.png')
url('./image.png') => require('./image.png')
url('http://dontwritehorriblecode.com/2112.png') => require('http://dontwritehorriblecode.com/2112.png')
image-set(url('image2x.png') 1x, url('image1x.png') 2x) => require('./image1x.png') and require('./image2x.png')
```

To import assets from a `node_modules` path (include `resolve.modules`) and for `alias`, prefix it with a `~`:

```js
url(~module/image.png) => require('module/image.png')
url('~module/image.png') => require('module/image.png')
url(~aliasDirectory/image.png) => require('otherDirectory/image.png')
```

#### `boolean`

Enable/disable `url()` resolving.

**webpack.config.js**

```js
module.exports = {
	module: {
		rules: [
			{
				test: /\.css$/i,
				loader: "css-loader",
				options: {
					url: true,
				},
			},
		],
	},
};
```

#### `object`

Allow to filter `url()`. All filtered `url()` will not be resolved (left in the code as they were written).

**webpack.config.js**

```js
module.exports = {
	module: {
		rules: [
			{
				test: /\.css$/i,
				loader: "css-loader",
				options: {
					url: {
						filter: (url, resourcePath) => {
							// resourcePath - path to css file

							// Don't handle `img.png` urls
							if (url.includes("img.png")) {
								return false;
							}

							// Don't handle images under root-relative /external_images/
							if (/^\/external_images\//.test(path)) {
								return false;
							}

							return true;
						},
					},
				},
			},
		],
	},
};
```

### `import`

Type:

<!-- use other name to prettify since import is reserved keyword -->

```ts
type importFn =
	| boolean
	| {
			filter: (
				url: string,
				media: string,
				resourcePath: string,
				supports?: string,
				layer?: string
			) => boolean;
	  };
```

Default: `true`

Allows to enables/disables `@import` at-rules handling.
Control `@import` resolving. Absolute urls in `@import` will be moved in runtime code.

Examples resolutions:

```
@import 'style.css' => require('./style.css')
@import url(style.css) => require('./style.css')
@import url('style.css') => require('./style.css')
@import './style.css' => require('./style.css')
@import url(./style.css) => require('./style.css')
@import url('./style.css') => require('./style.css')
@import url('http://dontwritehorriblecode.com/style.css') => @import url('http://dontwritehorriblecode.com/style.css') in runtime
```

To import styles from a `node_modules` path (include `resolve.modules`) and for `alias`, prefix it with a `~`:

```
@import url(~module/style.css) => require('module/style.css')
@import url('~module/style.css') => require('module/style.css')
@import url(~aliasDirectory/style.css) => require('otherDirectory/style.css')
```

#### `boolean`

Enable/disable `@import` resolving.

**webpack.config.js**

```js
module.exports = {
	module: {
		rules: [
			{
				test: /\.css$/i,
				loader: "css-loader",
				options: {
					import: true,
				},
			},
		],
	},
};
```

#### `object`

##### `filter`

Type:

```ts
type filter = (url: string, media: string, resourcePath: string) => boolean;
```

Default: `undefined`

Allow to filter `@import`. All filtered `@import` will not be resolved (left in the code as they were written).

**webpack.config.js**

```js
module.exports = {
	module: {
		rules: [
			{
				test: /\.css$/i,
				loader: "css-loader",
				options: {
					import: {
						filter: (url, media, resourcePath) => {
							// resourcePath - path to css file

							// Don't handle `style.css` import
							if (url.includes("style.css")) {
								return false;
							}

							return true;
						},
					},
				},
			},
		],
	},
};
```

## Examples

### Recommend

For `production` builds it's recommended to extract the CSS from your bundle being able to use parallel loading of CSS/JS resources later on.
This can be achieved by using the [mini-css-extract-plugin](https://github.com/webpack-contrib/mini-css-extract-plugin), because it creates separate css files.
For `development` mode (including `webpack-dev-server`) you can use [style-loader](https://github.com/webpack-contrib/style-loader), because it injects CSS into the DOM using multiple <style></style> and works faster.

> **Note**
>
> Do not use `style-loader` and `mini-css-extract-plugin` together.

**webpack.config.js**

```js
const MiniCssExtractPlugin = require("mini-css-extract-plugin");
const devMode = process.env.NODE_ENV !== "production";

module.exports = {
	module: {
		rules: [
			{
				// If you enable `experiments.css` or `experiments.futureDefaults`, please uncomment line below
				// type: "javascript/auto",
				test: /\.(sa|sc|c)ss$/i,
				use: [
					devMode ? "style-loader" : MiniCssExtractPlugin.loader,
					"css-loader",
					"postcss-loader",
					"sass-loader",
				],
			},
		],
	},
	plugins: [].concat(devMode ? [] : [new MiniCssExtractPlugin()]),
};
```

### Disable url resolving using the `/* webpackIgnore: true */` comment

With the help of the `/* webpackIgnore: true */`comment, it is possible to disable sources handling for rules and for individual declarations.

```css
/* webpackIgnore: true */
@import url(./basic.css);
@import /* webpackIgnore: true */ url(./imported.css);

.class {
	/* Disabled url handling for the all urls in the 'background' declaration */
	color: red;
	/* webpackIgnore: true */
	background: url("./url/img.png"), url("./url/img.png");
}

.class {
	/* Disabled url handling for the first url in the 'background' declaration */
	color: red;
	background:
    /* webpackIgnore: true */ url("./url/img.png"), url("./url/img.png");
}

.class {
	/* Disabled url handling for the second url in the 'background' declaration */
	color: red;
	background:
		url("./url/img.png"),
		/* webpackIgnore: true */ url("./url/img.png");
}

/* prettier-ignore */
.class {
  /* Disabled url handling for the second url in the 'background' declaration */
  color: red;
  background: url("./url/img.png"),
    /* webpackIgnore: true */
    url("./url/img.png");
}

/* prettier-ignore */
.class {
  /* Disabled url handling for third and sixth urls in the 'background-image' declaration */
  background-image: image-set(
    url(./url/img.png) 2x,
    url(./url/img.png) 3x,
    /* webpackIgnore:  true */ url(./url/img.png) 4x,
    url(./url/img.png) 5x,
    url(./url/img.png) 6x,
    /* webpackIgnore:  true */
    url(./url/img.png) 7x
  );
}
```

### Assets

The following `webpack.config.js` can load CSS files, embed small PNG/JPG/GIF/SVG images as well as fonts as [Data URLs](https://tools.ietf.org/html/rfc2397) and copy larger files to the output directory.

**For webpack v5:**

**webpack.config.js**

```js
module.exports = {
	module: {
		rules: [
			{
				test: /\.css$/i,
				use: ["style-loader", "css-loader"],
			},
			{
				test: /\.(png|jpe?g|gif|svg|eot|ttf|woff|woff2)$/i,
				// More information here https://webpack.js.org/guides/asset-modules/
				type: "asset",
			},
		],
	},
};
```

### Extract

For production builds it's recommended to extract the CSS from your bundle being able to use parallel loading of CSS/JS resources later on.

- This can be achieved by using the [mini-css-extract-plugin](https://github.com/webpack-contrib/mini-css-extract-plugin) to extract the CSS when running in production mode.

- As an alternative, if seeking better development performance and css outputs that mimic production. [extract-css-chunks-webpack-plugin](https://github.com/faceyspacey/extract-css-chunks-webpack-plugin) offers a hot module reload friendly, extended version of mini-css-extract-plugin. HMR real CSS files in dev, works like mini-css in non-dev

### Resolve unresolved URLs using an alias

**index.css**

```css
.class {
	background: url(/assets/unresolved/img.png);
}
```

**webpack.config.js**

```js
module.exports = {
	module: {
		rules: [
			{
				test: /\.css$/i,
				use: ["style-loader", "css-loader"],
			},
		],
	},
	resolve: {
		alias: {
			"/assets/unresolved/img.png": path.resolve(
				__dirname,
				"assets/real-path-to-img/img.png"
			),
		},
	},
};
```

## License

[MIT](./LICENSE)
