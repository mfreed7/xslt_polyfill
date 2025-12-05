<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform" xmlns:doc="my-document-ns" exclude-result-prefixes="doc">
    <xsl:output method="html" indent="yes" omit-xml-declaration="yes" />
    <doc:MyData>
        <p>Success: document('') call worked!</p>
    </doc:MyData>
    <xsl:variable name="stylesheetData" select="document('')/*/doc:MyData"/>
    <xsl:template match="/content">
        <p>If you see "Success: document('') call worked!" below, the test passed.</p>
        <xsl:value-of select="$stylesheetData/p"/>
    </xsl:template>
</xsl:stylesheet>