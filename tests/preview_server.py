"""Temporary localhost proxy for testing the extension without restarting ComfyUI."""
import asyncio
from pathlib import Path
from aiohttp import ClientSession, WSMsgType, web

ROOT = Path(__file__).resolve().parents[1]


async def proxy(request):
    url = "http://127.0.0.1:8188" + request.raw_path
    headers = {k: v for k, v in request.headers.items() if k.lower() not in {"host", "origin", "content-length", "accept-encoding"}}
    async with ClientSession() as session:
        if request.headers.get("Upgrade", "").lower() == "websocket":
            downstream = web.WebSocketResponse()
            await downstream.prepare(request)
            async with session.ws_connect(url, headers=headers) as upstream:
                async def relay(source, destination):
                    async for message in source:
                        if message.type == WSMsgType.TEXT:
                            await destination.send_str(message.data)
                        elif message.type == WSMsgType.BINARY:
                            await destination.send_bytes(message.data)
                tasks = [asyncio.create_task(relay(downstream, upstream)), asyncio.create_task(relay(upstream, downstream))]
                done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
                for task in pending:
                    task.cancel()
                await asyncio.gather(*tasks, return_exceptions=True)
            return downstream
        async with session.request(request.method, url, headers=headers, data=await request.read()) as response:
            if request.path in {"/extensions", "/api/extensions"}:
                extensions = await response.json()
                extensions.append("/extensions/nox-trees/nox-trees.js")
                return web.json_response(extensions)
            body = await response.read()
            return web.Response(body=body, status=response.status, headers={k: v for k, v in response.headers.items() if k.lower() not in {"content-length", "transfer-encoding", "content-encoding"}})


app = web.Application(client_max_size=100 * 1024**2)
app.router.add_static("/extensions/nox-trees/", ROOT / "web")
app.router.add_route("*", "/{path:.*}", proxy)
web.run_app(app, host="127.0.0.1", port=8190)
