import { handleRequest } from '../src/addons/wiospor/app.mjs';

export default async function handler(req, res) {
  const result = await handleRequest(req.url || '/');
  for (const [key, value] of Object.entries(result.headers)) res.setHeader(key, value);
  res.status(result.status).send(result.body);
}
