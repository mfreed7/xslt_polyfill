async function loadXsltPolyfill(pathToPolyfill,force) {
  const nativeSupported = 'XSLTProcessor' in window;
  if (nativeSupported && !force) {
    return;
  }
  window.xsltUsePolyfillAlways = true;
  const script = document.createElement('script');
  script.src = pathToPolyfill;
  script.type = 'module';
  const loaded = new Promise(resolve => script.addEventListener('load', resolve));
  document.head.appendChild(script);
  await loaded;
}
