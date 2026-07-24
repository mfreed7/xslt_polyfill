<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform" xmlns:cap="urn:oasis:names:tc:emergency:cap:1.2" exclude-result-prefixes="cap">
<xsl:output method="html" indent="no"/>
<xsl:template match="/">
<html>
<head>
<title>CAP Alert</title>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
</head>
<body style="font-family:sans-serif;padding:20px;">
<h2><xsl:value-of select="//cap:headline"/></h2>
<p><strong>Sender:</strong> <xsl:value-of select="//cap:senderName"/> (<xsl:value-of select="//cap:sender"/>)</p>
<p><strong>Sent:</strong> <xsl:value-of select="//cap:sent"/></p>
<p><strong>Effective:</strong> <xsl:value-of select="//cap:effective"/></p>
<p><strong>Onset:</strong> <xsl:value-of select="//cap:onset"/></p>
<p><strong>Expires:</strong> <xsl:value-of select="//cap:expires"/></p>
<p><strong>Event:</strong> <xsl:value-of select="//cap:event"/></p>
<p><strong>Severity:</strong> <xsl:value-of select="//cap:severity"/></p>
<p><strong>Instructions:</strong> <xsl:value-of select="//cap:instruction"/></p>
<div id="map" style="height:400px;width:100%;margin-top:20px;"></div>
<script>
    var map = L.map('map');
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
    var poly = "<xsl:value-of select="//cap:polygon"/>".split(' ').map(function(c) {
        var p = c.split(',');
        return [parseFloat(p[0]), parseFloat(p[1])];
    });
    if (poly.length > 0 &amp;&amp; !isNaN(poly[0][0])) {
        var mapPoly = L.polygon(poly, {color: 'red'}).addTo(map);
        map.fitBounds(mapPoly.getBounds());
    }
</script>
</body>
</html>
</xsl:template>
</xsl:stylesheet>