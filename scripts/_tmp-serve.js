'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.png': 'image/png',
};
http
  .createServer(function (req, res) {
    var p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/') p = '/index.html';
    var f = path.normalize(path.join(root, p));
    if (f.indexOf(root) !== 0) {
      res.writeHead(403);
      res.end();
      return;
    }
    fs.readFile(f, function (e, d) {
      if (e) {
        res.writeHead(404);
        res.end('no');
        return;
      }
      res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' });
      res.end(d);
    });
  })
  .listen(8766, function () {
    console.log('up');
  });
