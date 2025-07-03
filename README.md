# XSLT Polyfill

This is a polyfill for the XSLT W3C 1.0 web standard, roughly as shipped in
the Chrome browser. It is intended as a replacement for using the XSLT
processing machinery built into browsers. It does still rely on the XML
parsing machinery (e.g. `parseFromString(xmlText, "application/xml")`) for
some things.

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
  window.loadXmlWithXsltWhenReady('./demo.xml');
</script>
```

This will load the XML file, look for an XML stylesheet, process it with this
XSLT polyfill, and replace the page with the result of the transformation.

## Demos

There are a few demos in the `test/` directory, both the XML/XSL source files
and the corresponding `.html` files that use the polyfill to load and process
the XSLT.

## Building

The build assumes several tools such as emscripten and make. But the entire
polyfill can be built with one command:

```
$ ./build.sh
```
