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
<script src="../xslt-polyfill.min.js"></script>
<script>
const xsltProcessor = new XSLTProcessor();
xsltProcessor.importStylesheet(xsltDoc);
xsltProcessor.transformToFragment(xmlDoc, document);
</script>
```

The example above is available in the `test/` folder of this repo:
[`XSLTProcessor_example.html`](https://github.com/mfreed7/xslt_polyfill/blob/main/test/XSLTProcessor_example.html).


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

There are a few demos in the `test/` directory:

- `XSLTProcessor_example.html`: a test of the `XSLTProcessor` polyfill, which
  offers JS-based XSLT processing.
  \[[Run](https://mfreed7.github.io/xslt_polyfill/test/XSLTProcessor_example.html)\]
- `demo.xml`: a simple XML file that has the polyfill loaded by a single added
  `<script>` tag. The polyfill loads and automatically does the XSLT transformation,
  replacing the document.
  \[[Run](https://mfreed7.github.io/xslt_polyfill/test/demo.xml)\]
- `demo_large.xml`: a much larger example, taken from a public site, which
  does the same as `demo.xml`, but with a more complex/realistic document.
  \[[Run](https://mfreed7.github.io/xslt_polyfill/test/demo_large.html)\]
- `demo_html.html`: a polyfill "replacement" of an XML document, `demo.xml`. This
  example uses the `loadXmlUrlWithXsltWhenReady()` function from the polyfill to
  load `demo.xml`, find its contained XSL processing instruction pointing to
  `demo.xsl`, load that file, and then process them together, replacing the document.
  \[[Run](https://mfreed7.github.io/xslt_polyfill/test/demo.html)\]

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

