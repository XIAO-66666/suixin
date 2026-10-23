"""Start the same-origin app behind a managed HTTPS proxy."""
import os
from pathlib import Path
import sys
from urllib.parse import urlsplit


def command(env):
    origin=(env.get('SUIXIN_PUBLIC_ORIGIN') or env.get('RENDER_EXTERNAL_URL') or '').strip().rstrip('/')
    parsed=urlsplit(origin)
    if parsed.scheme!='https' or not parsed.hostname or parsed.username or parsed.password or parsed.path or parsed.query or parsed.fragment:
        raise ValueError('Set SUIXIN_PUBLIC_ORIGIN to the public HTTPS origin, without a path. Render may supply RENDER_EXTERNAL_URL automatically.')
    try:
        port=int(env.get('PORT','8082'))
        if not 1<=port<=65535: raise ValueError()
        parsed.port
    except ValueError:
        raise ValueError('PORT or public HTTPS port is invalid') from None
    filename=env.get('SUIXIN_DB_PATH','').strip()
    if not filename or not Path(filename).is_absolute():
        raise ValueError('Set SUIXIN_DB_PATH to an absolute path on a persistent disk.')
    return origin,[sys.executable,str(Path(__file__).with_name('server.py')),'--host','0.0.0.0','--port',str(port),'--db',filename]


if __name__=='__main__':
    try:
        origin,args=command(os.environ)
    except ValueError as error:
        raise SystemExit(str(error)) from None
    os.environ['SUIXIN_PUBLIC_ORIGIN']=origin
    os.execv(sys.executable,args)
