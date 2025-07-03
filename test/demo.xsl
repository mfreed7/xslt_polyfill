<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
  <xsl:output method="html"/>
  <xsl:template match="/">
    <xsl:apply-templates select="/page/message"/>
  </xsl:template>
  <xsl:template match="/page/message">
    <body>
    Should be green:
    <div style="color:green">
      <xsl:value-of select="."/>
    </div>
    </body>
  </xsl:template>
</xsl:stylesheet>