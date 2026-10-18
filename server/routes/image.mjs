import { getImage } from '../git.mjs';

export async function serveImage(response, url, { root }) {
  const image = await getImage(
    root,
    url.searchParams.get('mode'),
    url.searchParams.get('path'),
    url.searchParams.get('side'),
  );
  if (!image) {
    response.writeHead(404).end('Image not found');
    return;
  }
  response.writeHead(200, {
    'content-type': image.mime,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  response.end(image.bytes);
}
