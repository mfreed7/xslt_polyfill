const puppeteer = require('puppeteer');

(async () => {
  const targetUrl = process.argv[2];

  if (!targetUrl) {
    console.error('Error: A target URL pointing to the test_suite.html file');
    console.error('is required as a command-line parameter. Note: the URL must');
    console.error('not be a file:// URL.');
    console.error('Usage: node run-tests.js <URL>');
    process.exit(1);
  }

  // 1. Launch headless browser
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--disable-web-security'],
  });

  const page = await browser.newPage();

  try {
    console.log(`Loading test suite: ${targetUrl} ...`);

    // 2. Wait for the network to be completely idle
    await page.goto(targetUrl, { waitUntil: 'networkidle0' });

    // 3. Wait for iframes to load/error, then extract and concatenate their text
    const fullTextOutput = await page.evaluate(async () => {
      // Wait for at least one iframe to be added to the DOM
      const iframes = await new Promise((resolve) => {
        const check = () => {
          const found = Array.from(document.querySelectorAll('iframe'));
          if (found.length > 0) resolve(found);
          else setTimeout(check, 100);
        };
        check();
      });

      // Wait for all tests to finish (reaching PASS or FAIL state)
      // These variables are global in test_suite.html
      await new Promise((resolve) => {
        const check = () => {
          if (
            typeof passCount !== 'undefined' &&
            typeof failCount !== 'undefined' &&
            passCount + failCount === iframes.length
          ) {
            resolve();
          } else {
            setTimeout(check, 100);
          }
        };
        check();
      });

      // Recursive text extraction to maintain DOM order
      function extractSequentialText(node) {
        // Handle text nodes directly
        if (node.nodeType === Node.TEXT_NODE) {
          return node.textContent.trim();
        }

        // Skip anything that isn't a standard element
        if (node.nodeType !== Node.ELEMENT_NODE) {
          return '';
        }

        // Skip scripts and styles
        if (node.tagName === 'SCRIPT' || node.tagName === 'STYLE') {
          return '';
        }

        // If we hit an iframe, extract its internal body text
        if (node.tagName === 'IFRAME') {
          try {
            const doc = node.contentDocument || node.contentWindow.document;
            if (!doc) return '';

            // XHTML/XML docs might not have a .body, fallback to documentElement
            const rootNode = doc.body || doc.documentElement;
            if (!rootNode) return '';

            return extractSequentialText(rootNode);
          } catch (e) {
            return '[Error reading iframe content]';
          }
        }

        // If this branch of the DOM doesn't contain any iframes,
        // we can safely use the native innerText to get clean, formatted text
        if (!node.querySelector('iframe')) {
          return node.innerText ? node.innerText.trim() : '';
        }

        // Otherwise, it contains an iframe somewhere inside, so recurse through its children
        let parts = [];
        for (const child of node.childNodes) {
          const text = extractSequentialText(child);
          if (text) {
            parts.push(text);
          }
        }

        // Formatting: Join children of block-level container elements with newlines.
        // TR is deliberately omitted so its children (columns/TDs) join inline with a space.
        const isBlockLevel = ['TABLE', 'TBODY', 'THEAD', 'DIV', 'P', 'UL', 'SECTION', 'MAIN', 'BODY'].includes(
          node.tagName,
        );
        return parts.join(isBlockLevel ? '\n' : ' ');
      }

      const resultsTable = document.getElementById('results');
      if (resultsTable) {
        return extractSequentialText(resultsTable);
      } else {
        return 'Error: Could not find <table id="results"> on the page.';
      }
    });

    // 4. Print the final unified output
    console.log(fullTextOutput.trim());
  } catch (error) {
    console.error('Fatal Error running tests:', error);
    process.exitCode = 1;
  } finally {
    // 5. Cleanup
    await browser.close();
  }
})();
