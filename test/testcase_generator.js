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
    function setResult(passed, message) {
        const target = document.getElementById("target");
        if (passed) {
            target.textContent = 'PASS';
            target.style.color = 'green';
        } else {
            target.textContent = 'FAIL' + (message ? ': ' + message : '');
            target.style.color = 'red';
        }
    }
`;

const testCases = [
  {
    name: 'Basic Transformation',
    xml: `<?xml version="1.0"?>
        <?xml-stylesheet type="text/xsl" href="{{XSL_HREF}}"?>
        <page>
            {{SCRIPT_INJECTION_LOCATION}}
            <message>INIT</message>
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
            <first>INIT</first>
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
            INIT
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
            INIT
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
                <page><first>INIT</first></page>\`;
            const xsl = \`<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
                <xsl:output method="html"/>
                <xsl:template match="/"> </xsl:template>
                </xsl:stylesheet>\`;
            ${UTILITIES}
            const {xsltProcessor,xmlDoc} = initProcessor(xml,xsl);
            const fragment = xsltProcessor.transformToFragment(xmlDoc, document);
            setResult(fragment instanceof DocumentFragment);
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
        <div id="target" style="color:green">INIT</div>
        <script>
        window.onload = () => {
            const xmlDoc = document.implementation.createDocument(null, null, null);
            const xsl = \`<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
                <xsl:output method="xml"/>
                <xsl:template match="/">
                    <root>PASS</root>
                </xsl:template>
                </xsl:stylesheet>\`;
            ${UTILITIES}
            const parser = new window.DOMParser();
            const xslDoc = parser.parseFromString(xsl, "application/xml");
            const xsltProcessor = new window.XSLTProcessor();
            xsltProcessor.importStylesheet(xslDoc);
            let docResult;
            let fragResult;
           
            docResult = xsltProcessor.transformToDocument(xmlDoc);
            fragResult = xsltProcessor.transformToFragment(xmlDoc, document);
           
            setResult(docResult === null && fragResult === null);
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
        <div id="target" style="color:green">INIT</div>
        <script>
        window.onload = () => {
            const xml = \`<?xml version="1.0" encoding="utf-8"?>
                <page>INIT</page>\`;
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
            setResult(fragment === '<div>node1</div><div>node2</div>');
        };
        </script>`,
  },
  {
    name: 'XSLTProcessor output (HTML)',
    html: `
        <!DOCTYPE html>
        <body>
        {{SCRIPT_INJECTION_LOCATION}}
        <div id="target" style="color:green">INIT</div>
        <script>
        window.onload = () => {
            const xml = \`<?xml version="1.0" encoding="utf-8"?>
                <page>INIT</page>\`;
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
            const doc = toFlatString(xsltProcessor.transformToDocument(xmlDoc));
            setResult(fragment === '<title>PASS</title><div>PASS</div>' &&
                      doc === '<html><head><title>PASS</title></head><body><div>PASS</div></body></html>');
        };
        </script>`,
  },
  {
    name: 'XSLTProcessor output (XML)',
    html: `
        <!DOCTYPE html>
        <body>
        {{SCRIPT_INJECTION_LOCATION}}
        <div id="target" style="color:green">INIT</div>
        <script>
        window.onload = () => {
            const xml = \`<?xml version="1.0" encoding="utf-8"?>
                <page>INIT</page>\`;
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
            const doc = toFlatString(xsltProcessor.transformToDocument(xmlDoc));
            setResult(fragment === '<html><head><title>PASS</title></head><body><div>PASS</div></body></html>' &&
                      doc === '<html><head><title>PASS</title></head><body><div>PASS</div></body></html>');
        };
        </script>`,
  },
  {
    name: 'XSLTProcessor output (text)',
    html: `
        <!DOCTYPE html>
        <body>
        {{SCRIPT_INJECTION_LOCATION}}
        <div id="target" style="color:green">INIT</div>
        <script>
        window.onload = () => {
            const xml = \`<?xml version="1.0" encoding="utf-8"?>
                <page>INIT</page>\`;
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
            const doc = toFlatString(xsltProcessor.transformToDocument(xmlDoc));
            setResult(fragment === 'PASSPASS' &&
                      doc === '<htmlxmlns="http://www.w3.org/1999/xhtml"><head><title></title></head><body><pre>PASSPASS</pre></body></html>');
        };
        </script>`,
  },
  {
    name: 'XSLTProcessor output (blank, html content)',
    html: `
        <!DOCTYPE html>
        <body>
        {{SCRIPT_INJECTION_LOCATION}}
        <div id="target" style="color:green">INIT</div>
        <script>
        window.onload = () => {
            const xml = \`<?xml version="1.0" encoding="utf-8"?>
                <page>INIT</page>\`;
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
            const doc = toFlatString(xsltProcessor.transformToDocument(xmlDoc));
            setResult(fragment === '<title>PASS</title><div>PASS</div>' &&
                      doc === '<html><head><title>PASS</title></head><body><div>PASS</div></body></html>');
        };
        </script>`,
  },
  {
    name: 'XSLTProcessor output (blank, non-html content)',
    html: `
        <!DOCTYPE html>
        <body>
        {{SCRIPT_INJECTION_LOCATION}}
        <div id="target" style="color:green">INIT</div>
        <script>
        window.onload = () => {
            const xml = \`<?xml version="1.0" encoding="utf-8"?>
                <page>INIT</page>\`;
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
            const doc = toFlatString(xsltProcessor.transformToDocument(xmlDoc));
            setResult(fragment === '<root><div>PASS</div></root>' &&
                      doc === '<root><div>PASS</div></root>');
        };
        </script>`,
  },
  {
    name: 'transformToDocument structure',
    html: `
        <!DOCTYPE html>
        <body>
        {{SCRIPT_INJECTION_LOCATION}}
        <div id="target" style="color:green">INIT</div>
        <script>
        window.onload = () => {
            const xml = \`<?xml version="1.0" encoding="utf-8"?>
                <page><first>INIT</first></page>\`;
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
            ${UTILITIES}
            const parser = new window.DOMParser();
            const xmlDoc = parser.parseFromString(xml, "application/xml");
            const xslDoc = parser.parseFromString(xsl, "application/xml");
            const xsltProcessor = new window.XSLTProcessor();
            xsltProcessor.importStylesheet(xslDoc);
            const newDocument = xsltProcessor.transformToDocument(xmlDoc);
            const html = newDocument.firstElementChild;
            const head = html?.firstElementChild;
            const body = head?.nextElementSibling;
            const passed = html instanceof HTMLHtmlElement &&
                head instanceof HTMLHeadElement &&
                body instanceof HTMLBodyElement &&
                head?.children?.length === 2 &&
                body?.children?.length === 1;
            setResult(passed);
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
            INIT
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
        <div id="target" style="color:green">INIT</div>
        <script>
        window.onload = () => {
            const xml = \`<page>Text</page>\`;
            const xsl = \`<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
                <xsl:output method="text"/>
                <xsl:template match="/">
                <xsl:value-of select="/page"/>
                </xsl:template>
            </xsl:stylesheet>\`;

            ${UTILITIES}
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
            const passed = pre instanceof HTMLPreElement &&
                pre.textContent === 'Text';
            setResult(passed);
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
            INIT
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
            INIT
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
        <div id="target" style="color:green">INIT</div>
        <script>
        window.onload = () => {
          const xml = \`<?xml version="1.0" encoding="utf-8"?>
              <page>INIT</page>\`;
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
          setResult(divIsXHTMLNamespace);
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
        <div id="target" style="color:green">INIT</div>
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
                setResult(false, 'result is empty string');
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
            
            const message = '"' + result + '" (A:'+posA+', a:'+posa+', S:'+posS+', Š:'+posŠ+', Z:'+posZ+', z:'+posz+')';
            setResult(isCaseInsensitiveish && isAccentsNearBase, message);
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
            INIT
        </document>`,
    xsl: `<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
        <xsl:output method="html"/>
        <xsl:template match="/">
            <body>
                <div id="target" style="color:red">INIT</div>
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
            INIT
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
                <div id="target" style="color:red">INIT</div>
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
            <message>INIT</message>
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
            <message>INIT</message>
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
  {
    name: 'Uppercase Attributes',
    html: `
        <!DOCTYPE html>
        <body>
        {{SCRIPT_INJECTION_LOCATION}}
        <div id="target" style="color:red">INIT</div>
        <script>
        window.onload = () => {
            const xml = \`<?xml version="1.0" encoding="utf-8"?>
                <page><message>Hello World.</message></page>\`;
            const xsl = \`<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
                <xsl:template match="/page/message">
                  <root>
                    <a data-name="some name" dataName="uppercase attribute">click me</a>
                  </root>
                </xsl:template>
                </xsl:stylesheet>\`;
            ${UTILITIES}
            const {xsltProcessor,xmlDoc} = initProcessor(xml,xsl);
            const fragment = xsltProcessor.transformToFragment(xmlDoc, document);
            const a = fragment.querySelector('a');
            const dataNameUpper = a.getAttribute('dataName');
            const dataNameLower = a.getAttribute('data-name');
            setResult(dataNameUpper === 'uppercase attribute' && dataNameLower === 'some name', 'upper: ' + dataNameUpper + ', lower: ' + dataNameLower);
        };
        </script>
        </body>`,
  },
  {
    name: 'Direct XSL Loading',
    xml: `<?xml version="1.0" encoding="UTF-8"?>
        <?xml-stylesheet type="text/xsl" href="#"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:output method="html" encoding="UTF-8"/>
          <xsl:template match="/">
            <html>
              <body>
                {{SCRIPT_INJECTION_LOCATION}}
                <div id="target" style="color:green">PASS</div>
              </body>
            </html>
          </xsl:template>
        </xsl:stylesheet>`,
  },
  {
    name: 'setParameter with special characters',
    html: `
        <!DOCTYPE html>
        <body>
        {{SCRIPT_INJECTION_LOCATION}}
        <div id="target" style="color:red">INIT</div>
        <script>
        ${UTILITIES}
        window.onload = () => {
            const xml = \`<?xml version="1.0" encoding="utf-8"?><root/>\`;
            const xsl = \`<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
                <xsl:output method="html"/>
                <xsl:param name="p1"/>
                <xsl:param name="p2"/>
                <xsl:param name="p3"/>
                <xsl:param name="p4"/>
                <xsl:template match="/">
                    <div id="r1"><xsl:value-of select="$p1"/></div>
                    <div id="r2"><xsl:value-of select="$p2"/></div>
                    <div id="r3"><xsl:value-of select="$p3"/></div>
                    <div id="r4"><xsl:value-of select="$p4"/></div>
                </xsl:template>
            </xsl:stylesheet>\`;
            const parser = new window.DOMParser();
            const xmlDoc = parser.parseFromString(xml, "application/xml");
            const xslDoc = parser.parseFromString(xsl, "application/xml");
            const xsltProcessor = new window.XSLTProcessor();
            xsltProcessor.importStylesheet(xslDoc);
            xsltProcessor.setParameter(null, 'p1', "O'Brien");
            xsltProcessor.setParameter(null, 'p2', 'say "hello"');
            xsltProcessor.setParameter(null, 'p3', "it's a \\"test\\"");
            xsltProcessor.setParameter(null, 'p4', 'normal');
            const frag = xsltProcessor.transformToFragment(xmlDoc, document);
            const r1 = frag?.querySelector('#r1')?.textContent;
            const r2 = frag?.querySelector('#r2')?.textContent;
            const r3 = frag?.querySelector('#r3')?.textContent;
            const r4 = frag?.querySelector('#r4')?.textContent;
            const passed = r1 === "O'Brien" &&
                           r2 === 'say "hello"' &&
                           r3 === "it's a \\"test\\"" &&
                           r4 === 'normal';
            setResult(passed, \`r1=\${r1}, r2=\${r2}, r3=\${r3}, r4=\${r4}\`);
        };
        </script>
        </body>`,
  },
  {
    name: 'getParameter returns falsy values',
    html: `
        <!DOCTYPE html>
        <body>
        {{SCRIPT_INJECTION_LOCATION}}
        <div id="target" style="color:green">INIT</div>
        <script>
        ${UTILITIES}
        window.onload = () => {
            const xsltProcessor = new window.XSLTProcessor();

            xsltProcessor.setParameter(null, 'emptyString', '');
            xsltProcessor.setParameter(null, 'zero', 0);
            xsltProcessor.setParameter(null, 'falseVal', false);

            const emptyString = xsltProcessor.getParameter(null, 'emptyString');
            const zero = xsltProcessor.getParameter(null, 'zero');
            const falseVal = xsltProcessor.getParameter(null, 'falseVal');
            const unset = xsltProcessor.getParameter(null, 'unset');

            xsltProcessor.removeParameter(null, 'emptyString');
            const removed = xsltProcessor.getParameter(null, 'emptyString');

            const passed = emptyString === '' &&
                           zero === 0 &&
                           falseVal === false &&
                           unset === null &&
                           removed === null;
            setResult(passed, \`emptyString=\${emptyString}, zero=\${zero}, falseVal=\${falseVal}, unset=\${unset}, removed=\${removed}\`);
        };
        </script>
        </body>`,
  },
  {
    name: 'Performance: Split Benchmarks',
    html: `
        <!DOCTYPE html>
        <body>
        {{SCRIPT_INJECTION_LOCATION}}
        <div id="target" style="color:red">INIT</div>
        <script>
        window.onload = () => {
            const items = 500;
            const largeWit = Array.from({length: items}, (_, i) => '#w' + i).join(' ');
            const xml = \`<?xml version="1.0" encoding="utf-8"?>
                <page><item wit="\${largeWit}" /></page>\`;
            const xsl = \`<xsl:stylesheet version="1.0"
                    xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
                    xmlns:str="http://exslt.org/strings"
                    extension-element-prefixes="str">
                <xsl:output method="html"/>
                <xsl:template match="/">
                    <div id="result">
                        <div id="recursive">
                            <xsl:apply-templates select="//item" mode="recursive"/>
                        </div>
                        <div id="exslt">
                            <xsl:apply-templates select="//item" mode="exslt"/>
                        </div>
                    </div>
                </xsl:template>

                <!-- Case 1: Recursive Split -->
                <xsl:template match="item" mode="recursive">
                    <xsl:call-template name="splitwit">
                        <xsl:with-param name="corresp" select="'some-corresp'"/>
                    </xsl:call-template>
                </xsl:template>

                <xsl:template name="splitwit">
                  <xsl:param name="mss">
                    <xsl:choose>
                      <xsl:when test=" @wit"><xsl:value-of select="concat( @wit,' ')"/></xsl:when>
                      <xsl:when test=" @select"><xsl:value-of select="concat( @select,' ')"/></xsl:when>
                      <xsl:otherwise/>
                    </xsl:choose>
                  </xsl:param>
                  <xsl:param name="rdggrp" select="local-name() = 'rdgGrp'"/>
                  <xsl:param name="corresp"/>
                  <xsl:call-template name="splitloop">
                    <xsl:with-param name="rdggrp" select="\$rdggrp"/>
                    <xsl:with-param name="corresp" select="\$corresp"/>
                    <xsl:with-param name="thisms" select="substring-before(\$mss,' ')"/>
                  </xsl:call-template>
                  <xsl:variable name="nextstr" select="substring-after(\$mss, ' ')"/>
                  <xsl:if test="\$nextstr != ''">
                    <xsl:text>&#x200B;</xsl:text>
                    <xsl:call-template name="splitwit">
                      <xsl:with-param name="mss" select="\$nextstr"/>
                      <xsl:with-param name="corresp" select="\$corresp"/>
                    </xsl:call-template>
                  </xsl:if>
                </xsl:template>

                <!-- Case 2: str:split -->
                <xsl:template match="item" mode="exslt">
                    <xsl:call-template name="splitwit2">
                        <xsl:with-param name="corresp" select="'some-corresp'"/>
                        <xsl:with-param name="mss" select="string(@wit)"/>
                    </xsl:call-template>
                </xsl:template>

                <xsl:template name="splitwit2">
                  <xsl:param name="mss" select=" @wit | @select"/>
                  <xsl:param name="rdggrp" select="local-name() = 'rdgGrp'"/>
                  <xsl:param name="corresp"/>
                  <xsl:for-each select="str:split(\$mss,' ')">
                    <xsl:call-template name="splitloop">
                      <xsl:with-param name="rdggrp" select="\$rdggrp"/>
                      <xsl:with-param name="corresp" select="\$corresp"/>
                    </xsl:call-template>
                    <xsl:if test="position() != last()">
                      <xsl:text>&#x200B;</xsl:text>
                    </xsl:if>
                  </xsl:for-each>
                </xsl:template>

                <xsl:template name="splitloop">
                  <xsl:param name="thisms" select="."/>
                  <span><xsl:value-of select="\$thisms"/></span>
                </xsl:template>
                </xsl:stylesheet>\`;
            ${UTILITIES}
            let passed = true;
            for(let repeats=0; repeats<100; ++repeats) {
              const {xsltProcessor,xmlDoc} = initProcessor(xml,xsl);
              const fragment = xsltProcessor.transformToFragment(xmlDoc, document);
              const recursiveSpans = fragment.querySelector('#recursive').querySelectorAll('span');
              const exsltSpans = fragment.querySelector('#exslt').querySelectorAll('span');
              const recursivePassed = recursiveSpans.length === items && recursiveSpans[0].textContent === '#w0';
              const exsltPassed = exsltSpans.length === items && exsltSpans[0].textContent === '#w0';
              passed = passed && recursivePassed && exsltPassed;
            }
            setResult(passed);
        };
        </script>
        </body>`,
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
