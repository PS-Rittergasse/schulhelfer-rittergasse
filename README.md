# schulhelfer-rittergasse — Weiterleitung

Diese Repository hostet ausschliesslich eine **statische Weiterleitung** für die alte
Pages-URL `https://ps-rittergasse.github.io/schulhelfer-rittergasse/` auf die neue,
verkürzte Adresse:

> **https://ps-rittergasse.github.io/helferliste/**

Der eigentliche Code lebt unter
[`PS-Rittergasse/helferliste`](https://github.com/PS-Rittergasse/helferliste).

Die Umleitung erfolgt per `<meta http-equiv="refresh">` und JavaScript
(`location.replace`) — GitHub Pages erlaubt keine echten HTTP-301/302-Redirects.
`404.html` ist ein Spiegel von `index.html`, damit beliebige Pfade unter dem
alten Slug ebenfalls weitergeleitet werden.
