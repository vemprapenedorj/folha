import { handler } from '../server.mjs';

export default function (req, res) {
  const url = new URL(req.url, 'http://localhost');
  const route = url.searchParams.get('__route');
  if (route) {
    url.searchParams.delete('__route');
    req.url = `/api/${route}${url.search}`;
  }
  return handler(req, res);
}
