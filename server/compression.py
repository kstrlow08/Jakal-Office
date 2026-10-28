"""Compress large, complete API JSON responses; leave file/stream transport alone."""
import gzip

from starlette.concurrency import run_in_threadpool
from starlette.datastructures import MutableHeaders

from .static import accepts_gzip


class ApiCompression:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope['type'] != 'http' or not scope.get('path', '').startswith('/api/'):
            return await self.app(scope, receive, send)
        request_headers = dict(scope.get('headers', []))
        compress = accepts_gzip(request_headers.get(b'accept-encoding', b'').decode('latin-1'))
        initial = None
        started = False

        async def transmit(message):
            nonlocal initial, started
            if message['type'] == 'http.response.start':
                headers = MutableHeaders(scope=message)
                eligible = (headers.get('content-type', '').split(';')[0] == 'application/json'
                    and not headers.get('content-encoding') and b'range' not in request_headers
                    and message['status'] not in {204, 206, 304} and scope.get('method') != 'HEAD')
                if not eligible:
                    started = True
                    await send(message)
                    return
                headers.add_vary_header('Accept-Encoding')
                initial = message
                return
            if message['type'] == 'http.response.body' and not started and initial is not None:
                headers = MutableHeaders(scope=initial)
                body = message.get('body', b'')
                if compress and not message.get('more_body', False) and len(body) >= 1024:
                    if len(body) >= 128 * 1024:
                        encoded = await run_in_threadpool(gzip.compress, body, compresslevel=4, mtime=0)
                    else:
                        encoded = gzip.compress(body, compresslevel=4, mtime=0)
                    if len(encoded) < len(body):
                        headers['content-encoding'] = 'gzip'
                        headers['content-length'] = str(len(encoded))
                        message = {**message, 'body': encoded}
                started = True
                await send(initial)
            await send(message)

        await self.app(scope, receive, transmit)
