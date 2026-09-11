# XSLT Polyfill

This is a polyfill for the [XSLT W3C 1.0](https://www.w3.org/TR/xslt-10/)
standard, roughly as shipped in the Chrome browser. It is intended as a
replacement for using the XSLT processing machinery built into browsers. It
does still rely on the XML parsing machinery (e.g. `parseFromString(xmlText,
"application/xml")`) for some things.

Note that the XSLT 1.0 standard is *very* old, and XSLT has evolved well
beyond the version shipped in web browsers. There are also more up-to-date
JS-based implementations of XSLT that support the most current standards.
One such example is [SaxonJS](https://www.saxonica.com/saxonjs/index.xml).
You should check that out if you're looking for "real" XSLT support; this
polyfill is intended merely as a stopgap that can be used to maintain
functionality.

## Usage

If you have an XML document that contains an XSL processing instruction, like
this:

```xml
<?xml version="1.0"?>
<?xml-stylesheet type="text/xsl" href="demo.xsl"?>
<page>
 <message>
  Hello World.
 </message>
</page>
```

You can convert it to use this polyfill by simply adding the polyfill directly
to the XML, like this (note the new `<script>` element):

```xml
<?xml version="1.0"?>
<?xml-stylesheet type="text/xsl" href="demo.xsl"?>
<page>
 <script src="../xslt-polyfill.min.js" xmlns="http://www.w3.org/1999/xhtml"></script>
 <message>
  Hello World.
 </message>
</page>
```

This will automatically load the XML and XSLT, process it with this
XSLT polyfill, and replace the page with the result of the transformation.
The example above is available in the `test/` folder of this repo:
[`demo.xml`](https://github.com/mfreed7/xslt_polyfill/blob/main/test/demo.xml).

The polyfill also provides a full implementation of the `XSLTProcessor` class,
so that code like this will also work:

```html
<!DOCTYPE html>
<script src="xslt-polyfill.min.js" charset="utf-8"></script>
<script>
const xsltProcessor = new XSLTProcessor();
xsltProcessor.importStylesheet(xsltDoc);
xsltProcessor.transformToFragment(xmlDoc, document);
</script>
```

The example above is available in the `test/` folder of this repo:
[`XSLTProcessor_example.html`](https://github.com/mfreed7/xslt_polyfill/blob/main/test/XSLTProcessor_example.html).

## Forcing the Polyfill

By default, the polyfill checks whether the browser has working native XSLT
support (i.e. whether `window.XSLTProcessor` exists, is native code, and can be
constructed). If native support is present, the polyfill does **not** install
itself, and `XSLTProcessor` remains the browser's built-in implementation.

To override that behavior and always use the polyfill, regardless of the
browser's built-in support, set `window.xsltUsePolyfillAlways` to `true`
*before* the polyfill script runs:

```html
<!DOCTYPE html>
<script>window.xsltUsePolyfillAlways = true;</script>
<script src="xslt-polyfill.min.js" charset="utf-8"></script>
```

The same works in an XML document, as long as the `<script>` elements are in
the XHTML namespace:

```xml
<script xmlns="http://www.w3.org/1999/xhtml">window.xsltUsePolyfillAlways = true;</script>
<script src="../xslt-polyfill.min.js" xmlns="http://www.w3.org/1999/xhtml"></script>
```

Notes:

- The flag is read once, when the polyfill script executes. Setting it
  afterwards has no effect.
- When forced, the polyfill replaces `window.XSLTProcessor` with its own
  implementation and exposes its helper functions
  (`xsltPolyfillReady()`, `loadXmlWithXsltFromUrl()`,
  `parseAndReplaceCurrentXMLDoc()`, etc.).
- This also applies to the automatic transformation of an XML document
  containing an `<?xml-stylesheet?>` processing instruction: with the flag set,
  the polyfill performs that transformation even in a browser with native XSLT
  support. (This only matters if the browser hasn't already transformed the
  document natively.) Use `window.xsltDontAutoloadXmlDocs = true` to suppress
  the automatic transformation.

## Loading Spinner

When the polyfill is used to automatically transform a page (e.g. via an
injected `<script>` tag), it can take a moment to fetch the necessary files and
compile the Wasm engine. To improve user experience, the polyfill can display a
loading spinner while processing.

To enable the loading spinner, you can configure the
`window.xsltPolyfillSpinner` property before the polyfill script initializes.
Set this property to the string you want to display to the user. When the
transformation completes, the polyfill or your scripts can clear the spinner by
setting it to `null`.

```html
<script xmlns="http://www.w3.org/1999/xhtml">
  // Enable the spinner by setting the text to display
  window.xsltPolyfillSpinner = 'Processing XSLT, please wait...';
</script>
<script src="../xslt-polyfill.min.js" xmlns="http://www.w3.org/1999/xhtml"></script>
```

You can also dynamically set or clear the spinner at runtime by modifying the
property:
```javascript
// Show the spinner with new text
window.xsltPolyfillSpinner = 'Updating content...';

// Hide the spinner and show the document body
window.xsltPolyfillSpinner = null;
```

## Implementation

The polyfill is powered by a WebAssembly port of the
[libxslt](https://gitlab.gnome.org/GNOME/libxslt) and
[libxml2](https://gitlab.gnome.org/GNOME/libxml2) C libraries, providing a
standards-compliant XSLT 1.0 engine.

- **XSLTProcessor Polyfill**: Implements the full `XSLTProcessor` API, including
  `importStylesheet`, `transformToDocument`, `transformToFragment`, and
  parameter management.
- **Automatic Transformation**: When included via a `<script>` tag in an XML
  document (and provided the `<script>` has
  `xmlns="http://www.w3.org/1999/xhtml"`), the polyfill automatically detects
  `<?xml-stylesheet?>` processing instructions. It fetches the linked XSLT,
  re-fetches the source document, performs the transformation, and replaces the
  document's content with the result.
- **Resource Fetching**: All external resources, including the XSLT itself and
  any files referenced via `<xsl:import>`, `<xsl:include>`, or `document()`, are
  fetched using the `fetch()` API and are thus subject to CORS. The source
  document is re-fetched to ensure the WebAssembly engine receives the clean,
  original byte stream, avoiding any modifications or tag stripping introduced
  by the browser's initial XML parsing.
- **Script Execution**: To ensure functionality in the transformed output, the
  polyfill manually re-creates and executes `<script>` elements and fires
  synthetic `DOMContentLoaded` and `load` events.
- **MIME Types & Namespaces**: Stylesheets must use `type="text/xsl"` or
  `type="application/xslt+xml"`. Because the underlying document remains an
  XML/XHTML document, the polyfill monkey-patches `document.createElement` to
  ensure new elements are created in the XHTML namespace.

## Limitations

Note that as of now, there are a few things that don't work perfectly:
 - For the *automatic* transformation of an XML document, you'll need to be
   running the polyfill in a browser with the native XSLT feature disabled. In
   Chrome, you can do this at `chrome://flags/#xslt`. The `XSLTProcessor` API
   can still be forced to use the polyfill via `window.xsltUsePolyfillAlways`,
   see [Forcing the Polyfill](#forcing-the-polyfill).
 - The `parseAndReplaceCurrentXMLDoc()` function will replace the contents of
   the *current* document (an `XHTML` document) with the transformed content.
   Because XHTML always renders in no-quirks mode, if the transformed (HTML)
   output content *doesn't* include a `<!DOCTYPE>`, then it ordinarily would
   have rendered in quirks mode, which is different.
 - Scripts in the transformed output must be "copied" to fresh `<script>`
   elements so that they execute. This means the behavior will be slightly
   different from native: all (legacy synchronous) scripts will see the full
   DOM, not just the DOM "above" the script. Also, a synthetic `load` event
   will be fired after all scripts are inserted, since no trusted load will be
   fired either.
 - Because the transformed HTML content can contain `<script>`'s, and those
   scripts likely expect the document to be an HTML document, and not the XML
   document mentioned above, some things need to be monkeypatched by this
   polyfill. For example, `document.createElement()` is patched so that it
   creates elements in the XHTML namespace.
 - Since the polyfill uses the Fetch API to request any additional resources
   linked via `<xsl:include>` or `<xsl:import>` in the XML source, these
   requests are subject to CORS, which might block the request. The browser-
   native XSLT processor is able to load these resources, despite the CORS
   violation, leading to a behavior difference.
 - Similarly, since fetch() needs to be used for included/imported resources,
   and the fetch API is asynchronous, the (synchronous) XSLTProcessor methods
   will fail in this case. I don't have a great solution for this, other than
   perhaps to make `XSLTProcessorAsync` which has async versions of its methods.
 - The Wasm code is embedded into a single file, for ease-of-use and file size,
   via the emcc SINGLE_FILE option. This means that the encoding must be UTF-8
   or that resource will be incorrectly decoded.
 - There are likely opportunities for performance improvement. In particular,
   there are a few places where the content takes extra passes through a
   parser, and those could likely be streamlined.

## Demos

There are a few tests and demos in the `test/` directory:

- `test_suite.html`: a test suite that runs through various cases, with and without
  the polyfill. To run this suite, you must generate the local test files, via
  `node test/testcase_generator.js`.
- `XSLTProcessor_example.html`: a test of the `XSLTProcessor` polyfill, which
  offers JS-based XSLT processing.
  \[[Run](https://mfreed7.github.io/xslt_polyfill/test/XSLTProcessor_example.html)\]
- `demo.xml`: a simple XML file that has the polyfill loaded by a single added
  `<script>` tag. The polyfill loads and automatically does the XSLT transformation,
  replacing the document.
  \[[Run](https://mfreed7.github.io/xslt_polyfill/test/demo.xml)\]
- `demo_large.xml`: a much larger example, taken from a public site, which
  does the same as `demo.xml`, but with a more complex/realistic document.
  \[[Run](https://mfreed7.github.io/xslt_polyfill/test/demo_large.xml)\]

## Contributing
### Dependencies
Make sure you checkout the repo including it's git submodules:
```
$ git clone --recursive https://github.com/mfreed7/xslt_polyfill.git
```

The build assumes several tools such as `emscripten` and `make`.

The package mangler/compressor `terser` is managed locally via npm:
```shell
npm install
```

### Building
Given the dependencies listed above, you must first install the npm dependencies:
```shell
npm install
```

Then, the polyfill can be built with one command:
```shell
npm run build
```

This will produce `xslt-polyfill.min.js`, which is the minified polyfill
suitable for production use.


## Improvements / Bugs

If you find issues with the polyfill, feel free to file them [here](https://github.com/mfreed7/xslt_polyfill/issues).
Even better, if you would like to contribute to this polyfill,
I'm happy to review [pull requests](https://github.com/mfreed7/xslt_polyfill/pulls).
Thanks in advance!

## Other Places

This polyfill is also published on npm:

- https://www.npmjs.com/package/xslt-polyfill

It is also incorporated into a Chrome extension, which automatically applies the polyfill to raw XML files that contain XSLT stylesheets:

- https://chromewebstore.google.com/detail/xslt-polyfill/hlahhpnhgficldhfioiafojgdhcppklm

