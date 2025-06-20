// Copyright (c) 2025, Mason Freed
// All rights reserved.
//
// This source code is licensed under the BSD-style license found in the
// LICENSE file in the root directory of this source tree.

// This is a polyfill for the XSLTProcessor API.
// See: https://developer.mozilla.org/en-US/docs/Web/API/XSLTProcessor

// The actual XSLT processing is performed by the xslt-processor package:
//   https://github.com/DesignLiquido/xslt-processor/tree/main
// Please see its copyright terms in src/xslt-processor/LICENSE.

import './xslt-processor.js'

(function() {  
  // Feature detection
  if (window.xsltPolyfillInstalled) {
    return;
  }
  window.xsltPolyfillInstalled = true;
  window.xsltUsePolyfillAlways = ('xsltUsePolyfillAlways' in window) ? window.xsltUsePolyfillAlways : true;
  const nativeSupported = 'XSLTProcessor' in window;
  if (nativeSupported && !window.xsltUsePolyfillAlways) {
    return;
  }

  function ParseXMLWithXSLT(xmlParser, xslt, sourceXML, sourceXSLT) {
    return xslt.xsltProcess(
      xmlParser.xmlParse(sourceXML),
      xmlParser.xmlParse(sourceXSLT).firstChild
    );
  }

  class XSLTProcessor {
    #stylesheetText;
    #xslt;
    #xmlParser;

    constructor() { 
      this.#stylesheetText = null;
      this.#xmlParser = new globalThis.XsltProcessor.XmlParser();
      const options = {
        cData: true,
        escape: false,
        selfClosingTags: false,
        outputMethod: 'html',
      };
      this.#xslt = new globalThis.XsltProcessor.Xslt(options);
    }
    isPolyfill() {
      return true;
    }

    importStylesheet(stylesheet) {
      this.#stylesheetText = (new XMLSerializer()).serializeToString(stylesheet);
    }

    transformToFragment(source, document) {
      const sourceXml = (new XMLSerializer()).serializeToString(source);
      const output = ParseXMLWithXSLT(this.#xmlParser, this.#xslt, sourceXml, this.#stylesheetText);
      // Eventually need to grab the output type, instead of assuming html:
      const doc = (new DOMParser()).parseFromString(output, 'text/html');
      const fragment = document.createDocumentFragment();
      fragment.appendChild(doc.documentElement);
      return fragment;
    }
    transformToDocument(source) {
      throw Error('Not implemented');
    }
    setParameter(namespaceURI, localName, value) {
      throw Error('Not implemented');
    }
    getParameter(namespaceURI, localName) {
      throw Error('Not implemented');
    }
    removeParameter(namespaceURI, localName) {
      throw Error('Not implemented');
    }
    clearParameters() {
      throw Error('Not implemented');
    }
    reset() {
      throw Error('Not implemented');
    }
  }

  function replaceDoc(text) {
    // This is a destructive action, replacing the current page.
    document.open();
    document.write(text);
    document.close();
  }
  async function loadXmlWithXslt(path) {
    // Fetch the XML file from provided path.
    const xmlResponse = await fetch(path);
    if (!xmlResponse.ok) {
      return replaceDoc(`Failed to fetch XML file: ${xmlResponse.statusText}`);
    }
    const xmlText = await xmlResponse.text();

    // Look inside XML file for a processing instruction with an XSLT file.
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, "application/xml");
    const parserError = xmlDoc.querySelector('parsererror');
    if (parserError) {
      return replaceDoc(`Error parsing XML file: ${parserError.textContent}`);
    }

    let xsltPath = null;
    for (const node of xmlDoc.childNodes) {
      if (node.nodeType === Node.PROCESSING_INSTRUCTION_NODE && node.target === 'xml-stylesheet') {
        const data = node.data;
        const hrefMatch = data.match(/href="([^"]+)"/);
        const typeMatch = data.match(/type="([^"]+)"/);
        if (hrefMatch?.[1] && typeMatch && (typeMatch[1] === 'text/xsl' || typeMatch[1] === 'application/xslt+xml')) {
          xsltPath = hrefMatch[1];
          break;
        }
      }
    }

    if (!xsltPath) {
      return replaceDoc(`No XSLT processing instruction found in ${path}`);
    }

    // Fetch the XSLT file, resolving its path relative to the XML file's URL.
    const xsltUrl = new URL(xsltPath, xmlResponse.url);
    const xsltResponse = await fetch(xsltUrl.href);
    if (!xsltResponse.ok) {
      return replaceDoc(`Failed to fetch XSLT file: ${xsltResponse.statusText}`);
    }
    const xsltText = await xsltResponse.text();

    // Process XML/XSLT with ParseXMLWithXSLT and replace the document.
    const xmlParser = new globalThis.XsltProcessor.XmlParser();
    const xslt = new globalThis.XsltProcessor.Xslt();
    let resultHtml;
    try {
      resultHtml = ParseXMLWithXSLT(xmlParser, xslt, xmlText, xsltText);
    } catch (e) {
      return replaceDoc(`Error processing XML/XSLT: ${e}`);
    }
    // Replace the document with the result
    replaceDoc(resultHtml);
  }

  // Initialize
  function init() {
    window.XSLTProcessor = XSLTProcessor;
    window.loadXmlWithXslt = loadXmlWithXslt;
    console.log(`XSLT polyfill installed (native supported: ${nativeSupported}).`);
  }
  init();
})();
