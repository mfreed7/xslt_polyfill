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

You can convert it to use this polyfill by generating a new HTML file like this:

```html
<!DOCTYPE html>

<script src="xslt-polyfill.min.js"></script>
<script>
  window.loadXmlUrlWithXsltWhenReady('./demo.xml');
</script>
```

This will load the XML file, look for an XML stylesheet, process it with this
XSLT polyfill, and replace the page with the result of the transformation.

The polyfill (as loaded in the code snippet above) also provides a full
implementation of the `XSLTProcessor` class, so that code like this will
also work:

```javascript
const xsltProcessor = new XSLTProcessor();
xsltProcessor.importStylesheet(xsltDoc);
xsltProcessor.transformToFragment(xmlDoc, document);
```

### Limitations

Note that as of now, there are a few things that don't work perfectly:
 - The output of the transformation is assumed to be HTML in a few places.
   If the output is something else, like text or XML, things will likely break.
 - The `loadXmlUrlWithXsltWhenReady()` function will replace the contents of
   the *current* document (an `XHTML` document) with the transformed content.
   Because XHTML always renders in no-quirks mode, if the transformed (HTML)
   output content *doesn't* include a `<!DOCTYPE>`, then it ordinarily would
   have rendered in quirks mode, which is different.
 - There are likely opportunities for performance improvement. In particular,
   there are a few places where the content takes extra passes through a
   parser, and those could likely be streamlined.

## Demos

There are a few demos in the `test/` directory, both the XML/XSL source files
and the corresponding `.html` files that use the polyfill to load and process
the XSLT. In particular:

- `basic_example.html`: a test of the `XSLTProcessor` polyfill, which offers
  JS-based XSLT processing.
  \[[Run](https://mfreed7.github.io/xslt_polyfill/test/basic_example.html)\]
- `demo.html`: a polyfill "replacement" of an XML document, `demo.xml`. This
  example uses the `loadXmlUrlWithXsltWhenReady()` function to load `demo.xml`,
  find its contained XSL processing instruction pointing to `demo.xsl`, load
  that file, and then process them together, replacing the document.
  \[[Run](https://mfreed7.github.io/xslt_polyfill/test/demo.html)\]
  \[Compare to [native XML/XSLT](https://mfreed7.github.io/xslt_polyfill/test/demo.xml)\]
- `demo_large.html`: a much larger example, taken from a public site, which
  does the same as `demo.html`, but with a more complex/realistic document.
  \[[Run](https://mfreed7.github.io/xslt_polyfill/test/demo_large.html)\]
  \[Compare to [native XML/XSLT](https://mfreed7.github.io/xslt_polyfill/test/demo_large.xml)\]

## Building

The build assumes several tools such as `emscripten` and `make`. But the entire
polyfill can be built with one command:

```
$ ./build.sh
```

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

