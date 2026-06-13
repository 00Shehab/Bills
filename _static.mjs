import http from 'http';
import fs from 'fs';
import path from 'path';
const ROOT = path.join(process.cwd(), 'public');
const MIME = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.json':'application/json','.ttf':'font/ttf','.png':'image/png','.jpg':'image/jpeg'};
const server = http.createServer((req,res)=>{
  let p = decodeURIComponent((req.url||'/').split('?')[0]);
  if(p==='/') p='/index.html';
  const fp = path.join(ROOT, p);
  if(!fp.startsWith(ROOT)){ res.writeHead(403); return res.end('forbidden'); }
  fs.readFile(fp,(e,data)=>{
    if(e){ res.writeHead(404); return res.end('not found'); }
    res.writeHead(200,{'Content-Type':MIME[path.extname(fp)]||'application/octet-stream'});
    res.end(data);
  });
});
server.listen(8799, ()=>console.log('static server on http://localhost:8799'));
