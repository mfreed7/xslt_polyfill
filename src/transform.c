#include <stdio.h>
#include <string.h>

// Emscripten header for exporting functions
#include <emscripten.h>

// Libxml2 and Libxslt headers
#include <libxml/parser.h>
#include <libxml/tree.h>
#include <libxml/xmlstring.h>
#include <libxslt/xslt.h>
#include <libxslt/xsltutils.h>
#include <libxslt/transform.h>
#include <libxslt/security.h>

/**
 * @brief Transforms an XML string using an XSLT string.
 *
 * This function is exposed to JavaScript. It takes two strings, parses them
 * as XML and XSLT documents, performs the transformation, and returns the
 * result as a string.
 *
 * IMPORTANT: The returned string is allocated in the WASM module's memory
 * and must be freed from the JavaScript side by calling `_free()`.
 *
 * @param xml_content A string containing the source XML document.
 * @param xslt_content A string containing the XSLT stylesheet.
 * @return A pointer to a new string containing the transformed document, or NULL on error.
 */
EMSCRIPTEN_KEEPALIVE
char* transform(const char* xml_content, const char* xslt_content) {
    xmlDocPtr xml_doc = NULL;
    xsltStylesheetPtr xslt_sheet = NULL;
    xmlDocPtr result_doc = NULL;
    xsltTransformContextPtr ctxt = NULL;
    xsltSecurityPrefsPtr sec_prefs = NULL;
    char* result_string = NULL;

    // Initialize the XML library. This is important for thread safety.
    xmlInitParser();

    // Parse the input strings into libxml2 documents.
    xml_doc = xmlParseDoc((const xmlChar*)xml_content);
    if (xml_doc == NULL) {
        goto cleanup;
    }

    // It's crucial to parse the stylesheet using the same context as the
    // document to handle entities and other references correctly.
    xslt_sheet = xsltParseStylesheetDoc(xmlParseDoc((const xmlChar*)xslt_content));
    if (xslt_sheet == NULL) {
        goto cleanup;
    }

    // 1. Omit the XML declaration (e.g., <?xml version="1.0"?>) from the output.
    // This is useful when the result is a fragment or will be parsed immediately.
    xslt_sheet->omitXmlDeclaration = 1;

    // 2. Double the number of max variables xslt uses internally.
    // This prevents crashes on complex stylesheets. The default is 10000.
    xsltMaxVars = 20000;

    // 3. Create a new transformation context.
    ctxt = xsltNewTransformContext(xslt_sheet, xml_doc);
    if (ctxt == NULL) {
        goto cleanup;
    }

    // 4. Set up security preferences to disable file and network access.
    sec_prefs = xsltNewSecurityPrefs();
    if (sec_prefs == NULL) {
        goto cleanup;
    }
    xsltSetSecurityPrefs(sec_prefs, XSLT_SECPREF_WRITE_FILE, xsltSecurityForbid);
    xsltSetSecurityPrefs(sec_prefs, XSLT_SECPREF_CREATE_DIRECTORY, xsltSecurityForbid);
    xsltSetSecurityPrefs(sec_prefs, XSLT_SECPREF_WRITE_NETWORK, xsltSecurityForbid);

    if (xsltSetCtxtSecurityPrefs(sec_prefs, ctxt) != 0) {
        goto cleanup;
    }

    const char *params[] = {
		// "example_param_name", "'example_param_value'",
        NULL
    };

    // 6. Apply the transformation using the configured context and parameters.
    result_doc = xsltApplyStylesheetUser(xslt_sheet, xml_doc, (const char**)params, NULL, NULL, ctxt);

    if (result_doc == NULL) {
        goto cleanup;
    }

    // 7. Serialize the result document to a string.
    xmlChar* result_buffer = NULL;
    int result_len = 0;
    xsltSaveResultToString(&result_buffer, &result_len, result_doc, xslt_sheet);

    if (result_buffer == NULL) {
        goto cleanup;
    }
    // The result_buffer was allocated by libxml2. We will return it directly.
    result_string = (char*)result_buffer;


cleanup:
    // Clean up all the allocated resources in reverse order of creation.
    if (result_doc) xmlFreeDoc(result_doc);
    if (sec_prefs) xsltFreeSecurityPrefs(sec_prefs);
    if (ctxt) xsltFreeTransformContext(ctxt);
    if (xslt_sheet) xsltFreeStylesheet(xslt_sheet);
    if (xml_doc) xmlFreeDoc(xml_doc);

    // Clean up the parser variables.
    xsltCleanupGlobals();
    xmlCleanupParser();

    // Return the allocated string (or NULL on failure).
    return result_string;
}
