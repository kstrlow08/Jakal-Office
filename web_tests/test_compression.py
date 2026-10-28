import asyncio
import gzip
import json

import pytest

from server.compression import ApiCompression


def exchange(body, accept='gzip', content_type='application/json', *, stream=False, path='/api/documents', extra=()):
    sent = []

    async def application(scope, receive, send):
        await send({'type': 'http.response.start', 'status': 200, 'headers': [
            (b'content-type', content_type.encode()), (b'content-length', str(len(body)).encode()),
            (b'cache-control', b'no-store'), (b'vary', b'Cookie'), *extra]})
        if content_type == 'text/event-stream':
            assert sent and sent[0]['type'] == 'http.response.start'
        await send({'type': 'http.response.body', 'body': body, 'more_body': stream})
        if stream:
            await send({'type': 'http.response.body', 'body': b'last'})

    async def send(message):
        sent.append(message)

    async def receive():
        return {'type': 'http.request', 'body': b''}

    asyncio.run(ApiCompression(application)({'type': 'http', 'method': 'GET', 'path': path,
        'headers': [(b'accept-encoding', accept.encode())]}, receive, send))
    return dict(sent[0]['headers']), sent[1:]


@pytest.mark.parametrize('count', [1000, 100000])
def test_large_json_compression_retains_exact_bytes_and_private_policy(count):
    body = json.dumps({'text': '문서와 각주 데이터 ' * count}, ensure_ascii=False).encode()
    headers, messages = exchange(body)
    assert headers[b'content-encoding'] == b'gzip'
    assert headers[b'cache-control'] == b'no-store'
    assert set(headers[b'vary'].decode().split(', ')) == {'Cookie', 'Accept-Encoding'}
    assert int(headers[b'content-length']) == len(messages[0]['body'])
    assert gzip.decompress(messages[0]['body']) == body
    assert len(messages[0]['body']) < len(body) // 10


@pytest.mark.parametrize('accept', ['identity', 'gzip;q=0', 'gzip;q=0, *;q=1', 'gzip;q=invalid'])
def test_negotiation_respects_disabled_compression(accept):
    body = b'{}' * 1000
    headers, messages = exchange(body, accept)
    assert b'content-encoding' not in headers
    assert messages[0]['body'] == body


@pytest.mark.parametrize('options', [
    {'content_type': 'application/hwp+zip'}, {'content_type': 'application/x-hwp'},
    {'content_type': 'text/event-stream', 'stream': True}, {'stream': True},
    {'path': '/studio/assets/app.js'}, {'extra': [(b'content-encoding', b'br')]},
])
def test_files_streams_and_existing_compression_are_not_reencoded(options):
    body = b'large payload' * 1000
    headers, messages = exchange(body, **options)
    assert headers.get(b'content-encoding') == (b'br' if options.get('extra') else None)
    assert messages[0]['body'] == body


def test_small_json_not_compressed():
    headers, messages = exchange(b'{"ok":true}')
    assert b'content-encoding' not in headers
    assert messages[0]['body'] == b'{"ok":true}'


def test_real_app_keeps_session_headers_and_vary_when_compressing(tmp_path):
    from fastapi.testclient import TestClient
    from server.app import create_app

    app = create_app(tmp_path / 'data', run_worker=False)

    @app.get('/api/compression-test')
    def large_response():
        return {'paragraphs': ['공개되지 않는 본문 테스트입니다.'] * 10000}

    # The application mounts its static fallback last; put this test route before it.
    app.router.routes.insert(0, app.router.routes.pop())

    with TestClient(app) as client:
        compressed = client.get('/api/compression-test', headers={'Accept-Encoding': 'gzip'})
        plain = client.get('/api/compression-test', headers={'Accept-Encoding': 'identity'})
        assert compressed.json() == plain.json()
        assert compressed.headers['content-encoding'] == 'gzip'
        assert compressed.headers['cache-control'] == 'no-store'
        assert compressed.headers['x-jakal-workspace'] == plain.headers['x-jakal-workspace']
        assert {'cookie', 'accept-encoding'} <= {part.strip().lower() for part in compressed.headers['vary'].split(',')}
        assert int(compressed.headers['content-length']) < int(plain.headers['content-length']) // 10
