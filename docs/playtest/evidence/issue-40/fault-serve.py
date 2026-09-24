#!/usr/bin/env python3
"""issue #40 fault server.

Wraps the booth serve.Handler and, for ONE target path, RSTs the connection
instead of ever sending a response — a genuine pre-response transport failure
that surfaces to Playwright as `requestfailed` (never as a `response`). Every
other path is served normally.

Used to prove, end-to-end against the REAL rig, that a response-listener network
gate is blind to such failures (origin/main) while the #40 requestfailed listener
catches them.

Usage:
  fault-serve.py --root <repo-root> --port P [--abort /levels/<id>/level.json]
"""
import argparse
import os
import socket
import struct
import sys
from http.server import ThreadingHTTPServer
from urllib.parse import urlparse


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", required=True, help="repo root to serve")
    ap.add_argument("--port", type=int, required=True)
    ap.add_argument("--abort", default="/levels/ian-spence-rewind-loop/level.json")
    args = ap.parse_args()

    sys.path.insert(0, os.path.abspath(args.root))
    import serve as booth  # reuse the booth static+api handler; ROOT resolves inside it

    abort_path = urlparse(args.abort).path

    class Fault(booth.Handler):
        def do_GET(self):
            if urlparse(self.path).path == abort_path:
                try:  # SO_LINGER(1,0) -> RST on close, so the client sees a reset
                    self.connection.setsockopt(socket.SOL_SOCKET, socket.SO_LINGER,
                                               struct.pack("ii", 1, 0))
                except Exception:
                    pass
                self.close_connection = True
                try:
                    self.connection.shutdown(socket.SHUT_RDWR)
                except Exception:
                    pass
                try:
                    self.connection.close()
                except Exception:
                    pass
                return
            return super().do_GET()

    httpd = ThreadingHTTPServer(("127.0.0.1", args.port), Fault)
    print("fault-serve up on %d, RST on %s" % (args.port, abort_path), flush=True)
    httpd.serve_forever()


if __name__ == "__main__":
    main()
