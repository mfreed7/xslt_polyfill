<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0"
    xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
    xmlns:xhtml="http://www.w3.org/1999/xhtml"
    exclude-result-prefixes="xhtml">

    <xsl:output method="html" doctype-public="-//W3C//DTD HTML 4.01//EN" indent="yes"/>

    <xsl:template match="/">
        <html>
            <head>
                <title>Transformed Page</title>
            </head>
            <body>
                <div class="container">
                    <h2>Transformed Content</h2>
                    <xsl:apply-templates select="//xhtml:body/*"/>
                </div>
            </body>
        </html>
    </xsl:template>

    <xsl:template match="@*|node()">
        <xsl:copy>
            <xsl:apply-templates select="@*|node()"/>
        </xsl:copy>
    </xsl:template>

</xsl:stylesheet>

