const testCases = [
{
    name: 'Basic Transformation',
    xml: `
        <?xml version="1.0"?>
        <?xml-stylesheet type="text/xsl" href="{{XSL_HREF}}"?>
        <page>
            {{SCRIPT_INJECTION_LOCATION}}
            <message>FAIL</message>
        </page>
    `,
    xsl: `
        <?xml version="1.0" encoding="UTF-8"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
        <xsl:output method="html"/>
        <xsl:template match="/">
            <div style="color:green">PASS</div>
        </xsl:template>
        </xsl:stylesheet>`,
},
{
    name: 'EXSLT Support',
    xml: `
        <?xml version="1.0"?>
        <?xml-stylesheet type="text/xsl" href="{{XSL_HREF}}"?>
        <page>
            {{SCRIPT_INJECTION_LOCATION}}
            <first>FAIL</first>
            <message>PASS</message>
        </page>`,
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
        </xsl:stylesheet>`,
},
{
    name: 'Script Execution in Output',
    xml: `
        <?xml version="1.0" encoding="UTF-8"?>
        <?xml-stylesheet type="text/xsl" href="{{XSL_HREF}}"?>
        <document>
            {{SCRIPT_INJECTION_LOCATION}}
            FAIL
        </document>`,
    xsl: `
        <?xml version="1.0" encoding="UTF-8"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
            <xsl:output method="html"/>
            <xsl:template match="/">
                <body>
                    <script>
                        document.write('<div style="color:green">PASS</div>');
                    </script>
                </body>
            </xsl:template>
        </xsl:stylesheet>`,
},
{
    name: 'document(\'\') Functionality',
    xml: `
        <?xml version="1.0"?>
        <?xml-stylesheet type="text/xsl" href="{{XSL_HREF}}"?>
        <content>
            {{SCRIPT_INJECTION_LOCATION}}
            FAIL
        </content>`,
    xsl: `
        <xsl:stylesheet version="1.0"
            xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
            xmlns:doc="my-document-ns"
            exclude-result-prefixes="doc">
        <xsl:output method="html" indent="yes" omit-xml-declaration="yes" />
        <doc:MyData>
            <p style="color:green">PASS</p>
        </doc:MyData>
        <xsl:variable name="stylesheetData" select="document('')/*/doc:MyData"/>
        <xsl:template match="/content">
            <xsl:copy-of select="$stylesheetData/p"/>
        </xsl:template>
        </xsl:stylesheet>`,
},
{
    name: 'XSLTProcessor API',
    html: `
        <!DOCTYPE html>
        <body>
        {{SCRIPT_INJECTION_LOCATION}}
        <div id="target"></div>
        <script>
        window.onload = () => {
            const xmlString = \`<page>
                <first>FAIL</first>
                <message>PASS</message>
            </page>\`;
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
        </script>
        </body>
    `,
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
  source: '<script src="../dist/xslt_wasm.js" xmlns="http://www.w3.org/1999/xhtml" charset="utf-8"></script><script src="../src/xslt-polyfill-src.js" xmlns="http://www.w3.org/1999/xhtml"><\/script>',
  minified: '<script src="../xslt-polyfill.min.js" xmlns="http://www.w3.org/1999/xhtml" charset="utf-8"></script>',
};

const generatedTestCases = {};

testCases.forEach(testCase => {
  const baseName = testCase.name.replace(/[^a-zA-Z0-9]/g, '_');
  
  if (!generatedTestCases[testCase.name]) {
    const testCaseEntry = { name: testCase.name };
    ['xml', 'xsl', 'html'].forEach(ext => {
      if (testCase[ext]) {
        const fileName = `${baseName}_{{MODE}}.${ext}`;
        testCaseEntry[ext] = `generated/${fileName}`;
      }
    });
    generatedTestCases[testCase.name] = testCaseEntry;
  }

  Object.keys(scriptInjections).forEach(type => {
    const suffix = `_${type}`;
    const scriptInjection = scriptInjections[type];

    ['xml', 'xsl', 'html'].forEach(ext => {
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

