const UTILITIES = `
    function initProcessor(xml,xsl) {
        const parser = new window.DOMParser();
        const xmlDoc = parser.parseFromString(xml, "application/xml");
        const xslDoc = parser.parseFromString(xsl, "application/xml");
        const xsltProcessor = new window.XSLTProcessor();
        xsltProcessor.importStylesheet(xslDoc);
        return {xsltProcessor,xmlDoc};
    }
    function toFlatString(node) {
        if (!node) return '';
        const clone = node.cloneNode(true);
        if (clone.querySelectorAll) {
            clone.querySelectorAll('meta').forEach(m => m.remove());
        }
        const htmlString = Array.from(clone.childNodes).map(child => {
            return child.outerHTML || child.textContent;
        }).join('')
        return htmlString.replace(/\\s/g,'');
    }
`;

const testCases = [
  {
    name: 'Basic Transformation',
    xml: `<?xml version="1.0"?>
        <?xml-stylesheet type="text/xsl" href="{{XSL_HREF}}"?>
        <page>
            {{SCRIPT_INJECTION_LOCATION}}
            <message>FAIL!!!</message>
        </page>
    `,
    xsl: `<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
        <xsl:output method="html"/>
        <xsl:template match="/">
            <div style="color:green">PASS</div>
        </xsl:template>
        </xsl:stylesheet>`,
  },
  {
    name: 'EXSLT Support',
    xml: `<?xml version="1.0"?>
        <?xml-stylesheet type="text/xsl" href="{{XSL_HREF}}"?>
        <page>
            {{SCRIPT_INJECTION_LOCATION}}
            <first>FAIL!!!</first>
            <message>PASS</message>
        </page>`,
    xsl: `<xsl:stylesheet version="1.0"
            xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
            xmlns:exsl="http://exslt.org/common">
        <xsl:output method="html"/>
        <xsl:variable name="colorvar">
            <entry key="green">color: green</entry>
        </xsl:variable>
        <xsl:variable name="colors" select="exsl:node-set($colorvar)"/>
        <xsl:template match="/">
            <xsl:apply-templates select="/page/message"/>
        </xsl:template>
        <xsl:template match="/page/message">
            <div>
                <xsl:attribute name="style">
                    <xsl:value-of select="$colors/entry[@key='green']"/>
                </xsl:attribute>
                <xsl:value-of select="."/>
            </div>
        </xsl:template>
        </xsl:stylesheet>`,
  },
  {
    name: 'Script Execution in Output',
    xml: `<?xml version="1.0" encoding="UTF-8"?>
        <?xml-stylesheet type="text/xsl" href="{{XSL_HREF}}"?>
        <document>
            {{SCRIPT_INJECTION_LOCATION}}
            FAIL!!!
        </document>`,
    xsl: `<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
            <xsl:output method="html"/>
            <xsl:template match="/">
                <body>
                    <script>
                        const div = document.createElement('div');
                        div.style.color = 'green';
                        div.textContent = 'PASS';
                        document.body.appendChild(div);
                    </script>
                </body>
            </xsl:template>
        </xsl:stylesheet>`,
  },
  {
    name: "document('') Functionality",
    xml: `<?xml version="1.0"?>
        <?xml-stylesheet type="text/xsl" href="{{XSL_HREF}}"?>
        <content>
            {{SCRIPT_INJECTION_LOCATION}}
            FAIL!!!
        </content>`,
    xsl: `<xsl:stylesheet version="1.0"
            xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
            xmlns:doc="my-document-ns"
            exclude-result-prefixes="doc">
        <xsl:output method="html" indent="yes" omit-xml-declaration="yes" />
        <doc:MyData>
            <div style="color:green">PASS</div>
        </doc:MyData>
        <xsl:variable name="stylesheetData" select="document('')/*/doc:MyData"/>
        <xsl:template match="/content">
            <xsl:copy-of select="$stylesheetData/div"/>
        </xsl:template>
        </xsl:stylesheet>`,
  },
  {
    name: 'Blank result',
    html: `
        <!DOCTYPE html>
        <body>
        {{SCRIPT_INJECTION_LOCATION}}
        <div id="target" style="color:green"></div>
        <script>
        window.onload = () => {
            const xml = \`<?xml version="1.0" encoding="utf-8"?>
                <page><first>FAIL!!!</first></page>\`;
            const xsl = \`<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
                <xsl:output method="html"/>
                <xsl:template match="/"> </xsl:template>
                </xsl:stylesheet>\`;
            const parser = new window.DOMParser();
            const xmlDoc = parser.parseFromString(xml, "application/xml");
            const xslDoc = parser.parseFromString(xsl, "application/xml");
            const xsltProcessor = new window.XSLTProcessor();
            xsltProcessor.importStylesheet(xslDoc);
            const fragment = xsltProcessor.transformToFragment(xmlDoc, document);
            if (fragment instanceof DocumentFragment) {
                document.getElementById("target").textContent = 'PASS';
            }
        };
        </script>
        </body>`,
  },
  {
    name: 'Empty XML document source',
    html: `
        <!DOCTYPE html>
        <body>
        {{SCRIPT_INJECTION_LOCATION}}
        <div id="target" style="color:green">FAIL!!!</div>
        <script>
        window.onload = () => {
            const xmlDoc = document.implementation.createDocument(null, null, null);
            const xsl = \`<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
                <xsl:output method="xml"/>
                <xsl:template match="/">
                    <root>PASS</root>
                </xsl:template>
                </xsl:stylesheet>\`;
            const parser = new window.DOMParser();
            const xslDoc = parser.parseFromString(xsl, "application/xml");
            const xsltProcessor = new window.XSLTProcessor();
            xsltProcessor.importStylesheet(xslDoc);
            let docResult;
            let fragResult;
           
            docResult = xsltProcessor.transformToDocument(xmlDoc);
            fragResult = xsltProcessor.transformToFragment(xmlDoc, document);
           
            if (docResult === null && fragResult === null) {
                document.getElementById("target").textContent = 'PASS';
            }
        };
        </script>
        </body>`,
  },
  {
    name: 'Multiple root nodes',
    html: `
        <!DOCTYPE html>
        <body>
        {{SCRIPT_INJECTION_LOCATION}}
        <div id="target" style="color:green">FAIL!!!</div>
        <script>
        window.onload = () => {
            const xml = \`<?xml version="1.0" encoding="utf-8"?>
                <page>FAIL!!!</page>\`;
            const xsl = \`<xsl:stylesheet xmlns:xsl="http://www.w3.org/1999/XSL/Transform" version="1.0">
                <xsl:output method="xml"/>
                <xsl:template match="/">
                <div>node1</div>
                <div>node2</div>
                </xsl:template>
                </xsl:stylesheet>\`;
            ${UTILITIES}
            const {xsltProcessor,xmlDoc} = initProcessor(xml,xsl);
            const fragment = toFlatString(xsltProcessor.transformToFragment(xmlDoc, document));
            if (fragment !== '<div>node1</div><div>node2</div>') {
                document.getElementById("target").textContent = 'FAIL!!!';
                return;
            }
            document.getElementById("target").textContent = 'PASS';
        };
        </script>`,
  },
  {
    name: 'XSLTProcessor output (HTML)',
    html: `
        <!DOCTYPE html>
        <body>
        {{SCRIPT_INJECTION_LOCATION}}
        <div id="target" style="color:green">FAIL!!!</div>
        <script>
        window.onload = () => {
            const xml = \`<?xml version="1.0" encoding="utf-8"?>
                <page>FAIL!!!</page>\`;
            const xsl = \`<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
                <xsl:output method="html"/>
                <xsl:template match="/">
                <html>
                    <head><title>PASS</title></head>
                    <body><div>PASS</div></body>
                </html>
                </xsl:template>
                </xsl:stylesheet>\`;
            ${UTILITIES}
            const {xsltProcessor,xmlDoc} = initProcessor(xml,xsl);
            const fragment = toFlatString(xsltProcessor.transformToFragment(xmlDoc, document));
            if (fragment !== '<title>PASS</title><div>PASS</div>') {
                document.getElementById("target").textContent = 'FAIL!!!';
                return;
            }
            const doc = toFlatString(xsltProcessor.transformToDocument(xmlDoc));
            if (doc !== '<html><head><title>PASS</title></head><body><div>PASS</div></body></html>') {
                document.getElementById("target").textContent = 'FAIL!!!';
                return;
            }
            document.getElementById("target").textContent = 'PASS';
        };
        </script>`,
  },
  {
    name: 'XSLTProcessor output (XML)',
    html: `
        <!DOCTYPE html>
        <body>
        {{SCRIPT_INJECTION_LOCATION}}
        <div id="target" style="color:green">FAIL!!!</div>
        <script>
        window.onload = () => {
            const xml = \`<?xml version="1.0" encoding="utf-8"?>
                <page>FAIL!!!</page>\`;
            const xsl = \`<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
                <xsl:output method="xml"/>
                <xsl:template match="/">
                <html>
                    <head><title>PASS</title></head>
                    <body><div>PASS</div></body>
                </html>
                </xsl:template>
                </xsl:stylesheet>\`;
            ${UTILITIES}
            const {xsltProcessor,xmlDoc} = initProcessor(xml,xsl);
            const fragment = toFlatString(xsltProcessor.transformToFragment(xmlDoc, document));
            if (fragment !== '<html><head><title>PASS</title></head><body><div>PASS</div></body></html>') {
                document.getElementById("target").textContent = 'FAIL!!!';
                return;
            }
            const doc = toFlatString(xsltProcessor.transformToDocument(xmlDoc));
            if (doc !== '<html><head><title>PASS</title></head><body><div>PASS</div></body></html>') {
                document.getElementById("target").textContent = 'FAIL!!!';
                return;
            }
            document.getElementById("target").textContent = 'PASS';
        };
        </script>`,
  },
  {
    name: 'XSLTProcessor output (text)',
    html: `
        <!DOCTYPE html>
        <body>
        {{SCRIPT_INJECTION_LOCATION}}
        <div id="target" style="color:green">FAIL!!!</div>
        <script>
        window.onload = () => {
            const xml = \`<?xml version="1.0" encoding="utf-8"?>
                <page>FAIL!!!</page>\`;
            const xsl = \`<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
                <xsl:output method="text"/>
                <xsl:template match="/">
                <html>
                    <head><title>PASS</title></head>
                    <body><div>PASS</div></body>
                </html>
                </xsl:template>
                </xsl:stylesheet>\`;
            ${UTILITIES}
            const {xsltProcessor,xmlDoc} = initProcessor(xml,xsl);
            const fragment = toFlatString(xsltProcessor.transformToFragment(xmlDoc, document));
            if (fragment !== 'PASSPASS') {
                document.getElementById("target").textContent = 'FAIL!!!';
                return;
            }
            const doc = toFlatString(xsltProcessor.transformToDocument(xmlDoc));
            if (doc !== '<htmlxmlns="http://www.w3.org/1999/xhtml"><head><title></title></head><body><pre>PASSPASS</pre></body></html>') {
                document.getElementById("target").textContent = 'FAIL!!!';
                return;
            }
            document.getElementById("target").textContent = 'PASS';
        };
        </script>`,
  },
  {
    name: 'XSLTProcessor output (blank, html content)',
    html: `
        <!DOCTYPE html>
        <body>
        {{SCRIPT_INJECTION_LOCATION}}
        <div id="target" style="color:green">FAIL!!!</div>
        <script>
        window.onload = () => {
            const xml = \`<?xml version="1.0" encoding="utf-8"?>
                <page>FAIL!!!</page>\`;
            const xsl = \`<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
                <xsl:template match="/">
                <html>
                    <head><title>PASS</title></head>
                    <body><div>PASS</div></body>
                </html>
                </xsl:template>
                </xsl:stylesheet>\`;
            ${UTILITIES}
            const {xsltProcessor,xmlDoc} = initProcessor(xml,xsl);
            const fragment = toFlatString(xsltProcessor.transformToFragment(xmlDoc, document));
            if (fragment !== '<title>PASS</title><div>PASS</div>') {
                document.getElementById("target").textContent = 'FAIL!!!';
                return;
            }
            const doc = toFlatString(xsltProcessor.transformToDocument(xmlDoc));
            if (doc !== '<html><head><title>PASS</title></head><body><div>PASS</div></body></html>') {
                document.getElementById("target").textContent = 'FAIL!!!';
                return;
            }
            document.getElementById("target").textContent = 'PASS';
        };
        </script>`,
  },
  {
    name: 'XSLTProcessor output (blank, non-html content)',
    html: `
        <!DOCTYPE html>
        <body>
        {{SCRIPT_INJECTION_LOCATION}}
        <div id="target" style="color:green">FAIL!!!</div>
        <script>
        window.onload = () => {
            const xml = \`<?xml version="1.0" encoding="utf-8"?>
                <page>FAIL!!!</page>\`;
            const xsl = \`<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
                <xsl:template match="/">
                <root>
                    <div>PASS</div>
                </root>
                </xsl:template>
                </xsl:stylesheet>\`;
            ${UTILITIES}
            const {xsltProcessor,xmlDoc} = initProcessor(xml,xsl);
            const fragment = toFlatString(xsltProcessor.transformToFragment(xmlDoc, document));
            if (fragment !== '<root><div>PASS</div></root>') {
                document.getElementById("target").textContent = 'FAIL!!!';
                return;
            }
            const doc = toFlatString(xsltProcessor.transformToDocument(xmlDoc));
            if (doc !== '<root><div>PASS</div></root>') {
                document.getElementById("target").textContent = 'FAIL!!!';
                return;
            }
            document.getElementById("target").textContent = 'PASS';
        };
        </script>`,
  },
  {
    name: 'transformToDocument structure',
    html: `
        <!DOCTYPE html>
        <body>
        {{SCRIPT_INJECTION_LOCATION}}
        <div id="target" style="color:green">FAIL!!!</div>
        <script>
        window.onload = () => {
            const xml = \`<?xml version="1.0" encoding="utf-8"?>
                <page><first>FAIL!!!</first></page>\`;
            const xsl = \`<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
                <xsl:output method="html"/>
                <xsl:template match="/">
                <html>
                    <head>
                        <title>PASS</title>
                    </head>
                    <body>
                        <div>PASS</div>
                    </body>
                </html>
                </xsl:template>
                </xsl:stylesheet>\`;
            const parser = new window.DOMParser();
            const xmlDoc = parser.parseFromString(xml, "application/xml");
            const xslDoc = parser.parseFromString(xsl, "application/xml");
            const xsltProcessor = new window.XSLTProcessor();
            xsltProcessor.importStylesheet(xslDoc);
            const newDocument = xsltProcessor.transformToDocument(xmlDoc);
            const html = newDocument.firstElementChild;
            const head = html?.firstElementChild;
            const body = head?.nextElementSibling;
            if (html instanceof HTMLHtmlElement &&
                head instanceof HTMLHeadElement &&
                body instanceof HTMLBodyElement &&
                head?.children?.length === 2 &&
                body?.children?.length === 1) {
                document.getElementById("target").textContent = 'PASS';
            }
        };
        </script>
        </body>`,
  },
  {
    name: 'XML Output',
    xml: `<?xml version="1.0"?>
        <?xml-stylesheet type="text/xsl" href="{{XSL_HREF}}"?>
        <content>
            {{SCRIPT_INJECTION_LOCATION}}
            FAIL!!!
        </content>`,
    xsl: `<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
        <xsl:output method="xml"/>
        <xsl:template match="/">
            <body xmlns="http://www.w3.org/1999/xhtml" style="margin:8px">
                <div xmlns="http://www.w3.org/1999/xhtml" style="display:none"/>
                <div xmlns="http://www.w3.org/1999/xhtml" style="color:green">PASS</div>
            </body>
        </xsl:template>
        </xsl:stylesheet>`,
  },
  {
    name: 'Text Output',
    html: `
        <!DOCTYPE html>
        <body>
        {{SCRIPT_INJECTION_LOCATION}}
        <div id="target" style="color:green">FAIL!!!</div>
        <script>
        window.onload = () => {
            const xml = \`<page>Text</page>\`;
            const xsl = \`<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
                <xsl:output method="text"/>
                <xsl:template match="/">
                <xsl:value-of select="/page"/>
                </xsl:template>
            </xsl:stylesheet>\`;

            const parser = new window.DOMParser();
            const xmlDoc = parser.parseFromString(xml, "application/xml");
            const xslDoc = parser.parseFromString(xsl, "application/xml");
            const xsltProcessor = new window.XSLTProcessor();
            xsltProcessor.importStylesheet(xslDoc);
            const newDocument = xsltProcessor.transformToDocument(xmlDoc);
            
            // Check if result is wrapped in <pre>
            const html = newDocument.firstElementChild;
            const body = html?.firstElementChild?.nextElementSibling;
            const pre = body?.firstElementChild;
            if (pre instanceof HTMLPreElement &&
                pre.textContent === 'Text') {
                document.getElementById("target").textContent = 'PASS';
            }
        };
        </script>
        </body>`,
  },
  {
    name: 'Script Arrow Function',
    xml: `<?xml version="1.0" encoding="UTF-8"?>
        <?xml-stylesheet type="text/xsl" href="{{XSL_HREF}}"?>
        <document>
            {{SCRIPT_INJECTION_LOCATION}}
            FAIL!!!
        </document>`,
    xsl: `<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
        <xsl:output method="html"/>
        <xsl:template match="/">
            <body>
                <script>
                    // Make sure special characters like ">" are handled:
                    const f = kill => "foo";
                    if (f(1) === 'foo') {
                        const div = document.createElement('div');
                        div.style.color = 'green';
                        div.textContent = 'PASS';
                        document.body.appendChild(div);
                    }
                </script>
            </body>
        </xsl:template>
        </xsl:stylesheet>`,
  },
  {
    name: 'Script RegExp Entity',
    xml: `<?xml version="1.0" encoding="UTF-8"?>
        <?xml-stylesheet type="text/xsl" href="{{XSL_HREF}}"?>
        <document>
            {{SCRIPT_INJECTION_LOCATION}}
            FAIL!!!
        </document>`,
    xsl: `<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
        <xsl:output method="html"/>
        <xsl:template match="/">
            <body>
                <script>
                    // Make sure escaped entities like &amp; are are handled:
                    var showHideAllRegex = new RegExp("[\\?&amp;]");
                    // If no exception above, pass.
                    const div = document.createElement('div');
                    div.style.color = 'green';
                    div.textContent = 'PASS';
                    document.body.appendChild(div);
                </script>
            </body>
        </xsl:template>
        </xsl:stylesheet>`,
  },
  {
    name: 'Namespace URI in Fragment',
    html: `
        <!DOCTYPE html>
        <body>
        {{SCRIPT_INJECTION_LOCATION}}
        <div id="target" style="color:green">FAIL!!!</div>
        <script>
        window.onload = () => {
          const xml = \`<?xml version="1.0" encoding="utf-8"?>
              <page>FAIL!!!</page>\`;
          const xsl = \`<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
              <xsl:template match="/">
              <root>
                  <div>Should be XHTML</div>
              </root>
              </xsl:template>
              </xsl:stylesheet>\`;
          ${UTILITIES}
          const {xsltProcessor,xmlDoc} = initProcessor(xml,xsl);
          const fragment = xsltProcessor.transformToFragment(xmlDoc, document);
          const firstDiv = fragment.querySelector('div');
          const divIsXHTMLNamespace = firstDiv && firstDiv.namespaceURI === 'http://www.w3.org/1999/xhtml';
          document.getElementById("target").textContent = divIsXHTMLNamespace ? 'PASS' : 'FAIL';
        };
        </script>
        </body>`,
  },
  {
    name: 'Sorting Accents and Case',
    html: `
        <!DOCTYPE html>
        <body>
        {{SCRIPT_INJECTION_LOCATION}}
        <div id="target" style="color:green">FAIL!!!</div>
        <script>
        window.onload = () => {
            const xml = \`<?xml version="1.0" encoding="utf-8"?>
                <e:root xmlns:e="testCase">
                    <e:List>
                        <e:Item><e:NA>Z</e:NA></e:Item>
                        <e:Item><e:NA>A</e:NA></e:Item>
                        <e:Item><e:NA>z</e:NA></e:Item>
                        <e:Item><e:NA>a</e:NA></e:Item>
                        <e:Item><e:NA>&#x160;</e:NA></e:Item>
                        <e:Item><e:NA>S</e:NA></e:Item>
                    </e:List>
                </e:root>\`;
            const xsl = \`<?xml version="1.0" encoding="utf-8"?>
                <xsl:stylesheet xmlns:e="testCase" xmlns:xsl="http://www.w3.org/1999/XSL/Transform" version="1.0" exclude-result-prefixes="xsl e">
                    <xsl:output method="text" encoding="UTF-8"/>
                    <xsl:template match="/">
                        <xsl:for-each select="e:root/e:List/e:Item">
                            <xsl:sort select="e:NA"/>
                            <xsl:value-of select="e:NA"/>
                        </xsl:for-each>
                    </xsl:template>
                </xsl:stylesheet>\`;
            ${UTILITIES}
            const {xsltProcessor,xmlDoc} = initProcessor(xml,xsl);
            const fragment = xsltProcessor.transformToFragment(xmlDoc, document);
            const result = fragment.textContent.trim();
            
            if (result === "") {
                document.getElementById("target").textContent = 'FAIL: result is empty string';
                return;
            }

            const posA = result.indexOf('A');
            const posa = result.indexOf('a');
            const posS = result.indexOf('S');
            const posZ = result.indexOf('Z');
            const posz = result.indexOf('z');
            
            // Find Š by excluding known characters
            let posŠ = -1;
            for (let i=0; i<result.length; i++) {
                if (!['A','a','S','Z','z'].includes(result[i])) {
                    posŠ = i;
                    break;
                }
            }

            const isCaseInsensitiveish = Math.abs(posA - posa) === 1 && Math.abs(posZ - posz) === 1;
            const isAccentsNearBase = posS !== -1 && posŠ !== -1 && Math.abs(posS - posŠ) === 1;
            
            if (isCaseInsensitiveish && isAccentsNearBase) {
                document.getElementById("target").textContent = 'PASS';
            } else {
                document.getElementById("target").textContent = 'FAIL: "' + result + '" (A:'+posA+', a:'+posa+', S:'+posS+', Š:'+posŠ+', Z:'+posZ+', z:'+posz+')';
            }
        };
        </script>
        </body>`,
  },
  {
    name: 'Load and DOMContentLoaded Events',
    xml: `<?xml version="1.0" encoding="UTF-8"?>
        <?xml-stylesheet type="text/xsl" href="{{XSL_HREF}}"?>
        <document>
            {{SCRIPT_INJECTION_LOCATION}}
            FAIL!!!
        </document>`,
    xsl: `<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
        <xsl:output method="html"/>
        <xsl:template match="/">
            <body>
                <div id="target" style="color:red">FAIL!!!</div>
                <script>
                    const events = {};
                    const check = (e) => {
                        events[e.type] = true;
                        if (events['load'] &amp;&amp; events['DOMContentLoaded']) {
                            const div = document.getElementById('target');
                            div.style.color = 'green';
                            div.textContent = 'PASS';
                        }
                    };
                    window.addEventListener('load', check);
                    document.addEventListener('DOMContentLoaded', check);
                </script>
            </body>
        </xsl:template>
    </xsl:stylesheet>`,
  },
  {
    name: 'Synchronized External Script Loading',
    xml: `<?xml version="1.0" encoding="UTF-8"?>
        <?xml-stylesheet type="text/xsl" href="{{XSL_HREF}}"?>
        <document>
            {{SCRIPT_INJECTION_LOCATION}}
            FAIL!!!
        </document>`,
    get xsl() {
      // Use a large data URI to simulate a slow-loading external script.
      // This ensures the load event won't fire "accidentally" fast.
      const padding = ' '.repeat(1024 * 1024 * 2); // 2MB padding
      const scriptContent = 'window.externalScriptLoaded = true; /* ' + padding + ' */';
      const scriptSrc = 'data:text/javascript;base64,' + Buffer.from(scriptContent).toString('base64');

      return `<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
        <xsl:output method="html"/>
        <xsl:template match="/">
            <body>
                <div id="target" style="color:red">FAIL!!!</div>
                <script>window.externalScriptLoaded = false;</script>
                <script src="${scriptSrc}"></script>
                <script>
                    const div = document.getElementById('target');
                    if (window.externalScriptLoaded !== false) {
                        div.style.color = 'green';
                        div.textContent = 'PASS*'; // * because external script loaded too fast
                    } else {
                        window.addEventListener('load', (e) => {
                            if (window.externalScriptLoaded === true) {
                                div.style.color = 'green';
                                div.textContent = 'PASS';
                            } else {
                                div.textContent = 'FAIL: load event fired BEFORE external script loaded';
                            }
                        });
                    }
                </script>
            </body>
        </xsl:template>
    </xsl:stylesheet>`;
    },
  },
  {
    name: 'Import Attribute Merge',
    xml: `<?xml version="1.0"?>
        <?xml-stylesheet type="text/xsl" href="{{XSL_HREF}}"?>
        <page>
            {{SCRIPT_INJECTION_LOCATION}}
            <message>FAIL!!!</message>
        </page>
    `,
    xsl: `<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
        <xsl:import href="data:text/xml,&lt;xsl:stylesheet version='1.0' xmlns:xsl='http://www.w3.org/1999/XSL/Transform' my-imported-attr='PASS'&gt;&lt;/xsl:stylesheet&gt;"/>
        <xsl:output method="html"/>
        <xsl:template match="/">
            <div style="color:green">
                <xsl:value-of select="document('')/*/@my-imported-attr"/>
            </div>
        </xsl:template>
        </xsl:stylesheet>`,
  },
  {
    name: 'External document() call',
    xml: `<?xml version="1.0"?>
        <?xml-stylesheet type="text/xsl" href="{{XSL_HREF}}"?>
        <page>
            {{SCRIPT_INJECTION_LOCATION}}
            <message>FAIL!!!</message>
        </page>
    `,
    get xsl() {
      const xmlContent = '<root>PASS</root>';
      const base64Content = Buffer.from(xmlContent).toString('base64');
      const dataUri = `data:text/xml;base64,${base64Content}`;
      return `<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
        <xsl:output method="html"/>
        <!-- Use a base64 data URI to ensure valid URI syntax for libxml2 while triggering Asyncify suspension -->
        <xsl:variable name="external" select="document('${dataUri}')"/>
        <xsl:template match="/">
            <div id="target" style="color:green">
                <xsl:value-of select="$external/root"/>
            </div>
        </xsl:template>
        </xsl:stylesheet>`;
    },
  },
];

const fs = require('fs');
const path = require('path');

const outputDir = path.join(__dirname, 'generated');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir);
}

const scriptInjections = {
  native: '',
  source: `<script xmlns="http://www.w3.org/1999/xhtml">window.xsltUsePolyfillAlways = true;</script>
    <script src="../../dist/xslt-wasm.js" xmlns="http://www.w3.org/1999/xhtml" charset="utf-8"></script>
    <script src="../../src/xslt-polyfill-src.js" xmlns="http://www.w3.org/1999/xhtml"></script>`,
  minified: `<script xmlns="http://www.w3.org/1999/xhtml">window.xsltUsePolyfillAlways = true;</script>
    <script src="../../xslt-polyfill.min.js" xmlns="http://www.w3.org/1999/xhtml" charset="utf-8"></script>`,
};

const generatedTestCases = {};

testCases.forEach((testCase) => {
  const baseName = testCase.name.replace(/[^a-zA-Z0-9]/g, '_');

  if (!generatedTestCases[testCase.name]) {
    const testCaseEntry = { name: testCase.name };
    ['xml', 'xsl', 'html'].forEach((ext) => {
      if (testCase[ext]) {
        const fileName = `${baseName}_{{MODE}}.${ext}`;
        testCaseEntry[ext] = `generated/${fileName}`;
      }
    });
    generatedTestCases[testCase.name] = testCaseEntry;
  }

  Object.keys(scriptInjections).forEach((type) => {
    const suffix = `_${type}`;
    const scriptInjection = scriptInjections[type];

    ['xml', 'xsl', 'html'].forEach((ext) => {
      if (testCase[ext]) {
        let content = testCase[ext];
        const fileName = `${baseName}${suffix}.${ext}`;
        const filePath = path.join(outputDir, fileName);

        content = content.replace('{{SCRIPT_INJECTION_LOCATION}}', scriptInjection);

        if (ext === 'xml' && testCase.xsl) {
          const xslFileName = `${baseName}${suffix}.xsl`;
          content = content.replace('{{XSL_HREF}}', `./${xslFileName}`);
        }

        //This is a special case for the basic transform, which has a hard-coded XSLT href
        if (testCase.name === 'Basic Transformation' && ext === 'xml') {
          content = content.replace('demo.xsl', `${baseName}${suffix}.xsl`);
        }

        fs.writeFileSync(filePath, content.trim());
        console.log(`Generated ${filePath}`);
      }
    });
  });
});

const finalTestCases = Object.values(generatedTestCases);
fs.writeFileSync(path.join(outputDir, 'file_list.json'), JSON.stringify(finalTestCases, null, 2));
console.log(`Generated ${path.join(outputDir, 'file_list.json')}`);
