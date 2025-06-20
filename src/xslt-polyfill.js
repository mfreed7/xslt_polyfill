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
  const nativeSupported = 'XSLTProcessor' in window;
  if (nativeSupported && !window.xsltUsePolyfillAlways) {
    return;
  }

  class XSLTProcessor {
    #stylesheetText;
    #xslt;
    #xmlParser;

    constructor() { 
      this.#stylesheetText = null;
      this.#xmlParser = new globalThis.XsltProcessor.XmlParser();
      this.#xslt = new globalThis.XsltProcessor.Xslt();
    }
    isPolyfill() {
      return true;
    }

    importStylesheet(stylesheet) {
      this.#stylesheetText = (new XMLSerializer()).serializeToString(stylesheet);
    }

    transformToFragment(source, document) {
      const sourceXml = (new XMLSerializer()).serializeToString(source);
      const output = this.#xslt.xsltProcess(
        this.#xmlParser.xmlParse(sourceXml),
        this.#xmlParser.xmlParse(this.#stylesheetText)
      );
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

  // Initialize
  function init() {
    window.XSLTProcessor = XSLTProcessor;
    console.log(`XSLT polyfill installed (native supported: ${nativeSupported}).`);
  }
  init();
})();
