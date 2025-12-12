const testCases = [
{
    name: 'Basic Transformation',
    xml: `
    <?xml version="1.0"?>
    <?xml-stylesheet type="text/xsl" href="demo.xsl"?>
    <page>
        {{SCRIPT_INJECTION_LOCATION}}
        <message>FAIL</message>
    </page>
    `,
    xsl: `
    <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
        <xsl:output method="html"/>
        <xsl:template match="/">
        <xsl:apply-templates select="/page/message"/>
        </xsl:template>
        <xsl:template match="/page/message">
        <div style="color:green">
            <xsl:value-of select="."/>
        </div>
        </xsl:template>
    </xsl:stylesheet>
    `,
},
{
    name: 'EXSLT Support',
    xml: `
    <?xml version="1.0"?>
    <?xml-stylesheet type="text/xsl" href="{{XSL_HREF}}"?>
    <page>
        {{SCRIPT_INJECTION_LOCATION}}
        <message>PASS</message>
    </page>
    `,
    xsl: `
    <xsl:stylesheet version="1.0"
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
    </xsl:stylesheet>
    `,
},
{
    name: 'Script Execution in Output',
    xml: 
    `
    <?xml version="1.0" encoding="UTF-8"?>
    <?xml-stylesheet type="text/xsl" href="{{XSL_HREF}}"?>
    <document>
        {{SCRIPT_INJECTION_LOCATION}}
    </document>
    `,
    xsl: 
    `
    <?xml version="1.0" encoding="UTF-8"?>
    <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
        <xsl:output method="html"/>
        <xsl:template match="/">
        <html>
            <body>
            <script xmlns="http://www.w3.org/1999/xhtml">
                document.write('<div style="color:green">PASS</div>');
            <\/script>
            </body>
        </html>
        </xsl:template>
    </xsl:stylesheet>
    `,
},
{
    name: 'XHTML Transformation',
    xml: 
    `
    <?xml version="1.0" encoding="UTF-8"?>
    <?xml-stylesheet type="text/xsl" href="{{XSL_HREF}}"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
        <head>
            <title>Original XHTML Page</title>
            {{SCRIPT_INJECTION_LOCATION}}
        </head>
        <body>
            <h1 style="color:green">PASS</h1>
        </body>
    </html>
    `,
    xsl: 
    `
    <?xml version="1.0" encoding="UTF-8"?>
    <xsl:stylesheet version="1.0"
        xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
        xmlns:xhtml="http://www.w3.org/1999/xhtml"
        exclude-result-prefixes="xhtml">

        <xsl:output method="html" doctype-public="-//W3C//DTD HTML 4.01//EN" indent="yes"/>

        <xsl:template match="/">
            <xsl:apply-templates select="//xhtml:body/*"/>
        </xsl:template>

        <xsl:template match="@*|node()">
            <xsl:copy>
                <xsl:apply-templates select="@*|node()"/>
            </xsl:copy>
        </xsl:template>

    </xsl:stylesheet>
    `,
},
{
    name: '`document(\'\')` Functionality',
    xml: 
    `
    <?xml version="1.0"?>
    <?xml-stylesheet type="text/xsl" href="{{XSL_HREF}}"?>
    <content>
        {{SCRIPT_INJECTION_LOCATION}}
    </content>
    `,
    xsl: 
    `
    <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform" xmlns:doc="my-document-ns" exclude-result-prefixes="doc">
        <xsl:output method="html" indent="yes" omit-xml-declaration="yes" />
        <doc:MyData>
            <p style="color:green">PASS</p>
        </doc:MyData>
        <xsl:variable name="stylesheetData" select="document('')/*/doc:MyData"/>
        <xsl:template match="/content">
            <xsl:copy-of select="$stylesheetData/p"/>
        </xsl:template>
    </xsl:stylesheet>
    `,
},
{
    name: '`XSLTProcessor` API',
    html: `<!DOCTYPE html>
      <body>
      {{SCRIPT_INJECTION_LOCATION}}
      <div id="target"></div>
      <script>
        window.onload = () => {
            const xmlString = \`<page><message>PASS</message></page>\`;
            const xslString = \`<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
                <xsl:template match="/">
                <xsl:apply-templates select="/page/message"/>
                </xsl:template>
                <xsl:template match="/page/message">
                <div style="color:green"><xsl:value-of select="."/></div>
                </xsl:template>
            </xsl:stylesheet>\`;

            const parser = new window.DOMParser();
            const xmlDoc = parser.parseFromString(xmlString, "application/xml");
            const xslDoc = parser.parseFromString(xslString, "application/xml");
            const xsltProcessor = new window.XSLTProcessor();
            xsltProcessor.importStylesheet(xslDoc);
            const fragment = xsltProcessor.transformToFragment(xmlDoc, document);
            document.getElementById("target").appendChild(fragment);
        };
      <\/script>
      </body>
    `,
},
{
    name: 'Malformed XML',
    xml: 
    `
    <?xml version="1.0"?>
    <?xml-stylesheet type="text/xsl" href="{{XSL_HREF}}"?>
    <page>
        {{SCRIPT_INJECTION_LOCATION}}
        <message>PASS (raw xml)</message>
    </page>
    <malformed>
    `,
    xsl: 
    `
    <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
        <xsl:template match="/page/message">
        <div><xsl:value-of select="."/></div>
        </xsl:template>
    </xsl:stylesheet>
    `,
},
{
    name: 'Malformed XSLT',
    xml: 
    `
    <?xml version="1.0"?>
    <?xml-stylesheet type="text/xsl" href="{{XSL_HREF}}"?>
    <page>
        {{SCRIPT_INJECTION_LOCATION}}
        <message>PASS (raw xml)</message>
    </page>
    `,
    xsl: 
    `
    <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
        <xsl:template match="/page/message">
        <div><xsl:value-of select="."/></div>
        </xsl:template>
    </xsl:stylesheet>
    <malformed>
    `,
},
{
    name: 'Edge Case: Empty Inputs (Valid XML, Empty XSLT)',
    xml: 
    `
    <?xml version="1.0"?>
    <?xml-stylesheet type="text/xsl" href="{{XSL_HREF}}"?>
    <page>
        {{SCRIPT_INJECTION_LOCATION}}
        <message>PASS</message>
    </page>
    `,
    xsl: `<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform" />`,
},
{
    name: 'Edge Case: Empty Inputs (Empty XML, Valid XSLT)',
    xml: 
    `
    <?xml version="1.0"?>
    <?xml-stylesheet type="text/xsl" href="{{XSL_HREF}}"?>
    <root>
        {{SCRIPT_INJECTION_LOCATION}}
    </root>
    `,
    xsl: 
    `
    <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
        <xsl:template match="/">
        <div style="color:green">PASS</div>
        </xsl:template>
    </xsl:stylesheet>
    `,
},
{
    name: 'Edge Case: No Matching Templates',
    xml: 
    `
    <?xml version="1.0"?>
    <?xml-stylesheet type="text/xsl" href="{{XSL_HREF}}"?>
    <page>
        {{SCRIPT_INJECTION_LOCATION}}
        <message>PASS</message>
    </page>
    `,
    xsl: 
    `
    <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
        <xsl:template match="non-existing-element" />
    </xsl:stylesheet>
    `,
},
];

