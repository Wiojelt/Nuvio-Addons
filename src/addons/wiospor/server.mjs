import http from 'node:http';
import { handleRequest } from './app.mjs';

const port = Number(process.env.PORT || 8787);
http.createServer(async (req, res) => {
  try {
    const result = await handleRequest(req.url || '/');
    res.writeHead(result.status, result.headers);
    res.end(result.body);
  } catch (error) {
    res.writeHead(500, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: error.message }));
  }
}).listen(port, () => console.log(`WioSpor addon: http://127.0.0.1:${port}/manifest.json`));
