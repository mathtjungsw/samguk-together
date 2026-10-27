import http from 'node:http';
import path from 'node:path';
import {readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
const build=spawn(process.execPath,['tools/build.mjs'],{stdio:'inherit'});await new Promise((resolve,reject)=>build.on('exit',code=>code===0?resolve():reject(Error('빌드에 실패했습니다.'))));
const root=path.resolve('dist'),port=Number(process.env.PORT||4190);
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.txt':'text/plain; charset=utf-8','.webp':'image/webp','.png':'image/png'};
http.createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost'),relative=url.pathname==='/'?'index.html':decodeURIComponent(url.pathname).replace(/^\//,''),file=path.resolve(root,relative);if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}const body=await readFile(file);res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(body);}catch{res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});res.end('페이지를 찾을 수 없습니다.');}}).listen(port,'127.0.0.1',()=>console.log(`Local: http://127.0.0.1:${port}`));
