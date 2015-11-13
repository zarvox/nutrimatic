#!env/bin/python

import os
import json
import signal

import tornado.gen
import tornado.ioloop
from tornado.options import define, options, parse_command_line
import tornado.process
import tornado.web
import tornado.websocket

define("port", default=8888, help="run on the given port", type=int)
define("debug", default=False, help="run in debug mode")

PWD=os.path.dirname(os.path.abspath(__file__))
GIT_ROOT = os.path.dirname(PWD)
FIND_EXPR_PATH = os.path.join(GIT_ROOT, "bin", "find-expr")
INDEX_PATH = os.path.join(GIT_ROOT, "wikipedia.index")

class MainHandler(tornado.web.RequestHandler):
    def get(self):
        self.render("index.html")

class ConnectionHandle(object):
    def __init__(self, parent, socket_handler, on_search_stopped=None):
        self.parent = parent # we may need this to plumb through events?
        self.socket_handler = socket_handler
        self.search_handle = None
        self._on_search_stopped = on_search_stopped

    def start_search(self, search_string): # TODO: support custom search depth?
        # If this client was already running a search, kill it.
        if self.search_handle:
            self.search_handle.abort()
        self.search_handle = SearchHandle(search_string,
                add_result_cb=self.search_found_result,
                on_exit_cb=self.search_stopped,
                error_cb=self.search_error,
                )

    def abort_search(self):
        if self.search_handle: self.search_handle.abort()

    def search_stopped(self, exit_code, abort_message):
        self.search_handle = None
        # Tell the websocket the search stopped.
        msg = json.dumps({
            "method": "search_stopped",
            "value": {
                "exit_code": exit_code,
                "message": abort_message or ""
            }
        });
        self.socket_handler.write_message(msg)
        if self._on_search_stopped: self._on_search_stopped(exit_code)

    def search_error(self, message):
        print("Search error:", message)

    def search_found_result(self, match, strength):
        print("Found match:", strength, match)
        msg = json.dumps({
            "method": "search_result_found",
            "value": {
                "strength": strength,
                "match": match
            }
        })
        self.socket_handler.write_message(msg)

class SearchHandle(object):
    def __init__(self, search_string, add_result_cb=None, on_exit_cb=None, error_cb=None):
        self.search_string = search_string
        self._add_result_cb = add_result_cb
        self._on_exit_cb = on_exit_cb
        self._error_cb = error_cb

        self.aborted = False
        self.abort_reason = None
        self.search_depth = 1000000 # TODO: support custom search depth
        self.max_results = 100 # TODO: support custom result list length?
        self.result_count = 0

        # Starts find-expr as a child process, with some supervision.
        print("starting search for", search_string)
        self.process_handle = tornado.process.Subprocess([FIND_EXPR_PATH, INDEX_PATH, search_string],
                preexec_fn=lambda: signal.signal(signal.SIGPIPE, signal.SIG_DFL),
                stdout=tornado.process.Subprocess.STREAM,
                stderr=tornado.process.Subprocess.STREAM,
        )
        self.process_handle.set_exit_callback(self.on_child_exit)
        self.process_handle.stdout.read_until(b'\n', callback=self.on_stdout_line)
        self.process_handle.stderr.read_until_close(callback=self.on_stderr)

    def on_stdout_line(self, data):
        print("subprocess stdout:", data)

        if data.startswith(b'#'):
            # Search progress line.
            search_depth = int(data[2:])
            # TODO: send progress to client via callback
            if search_depth > self.search_depth:
                self.abort("Computation limit reached")
                return
        else:
            # Parse out match and strength, then notify caller
            strength, match = data.strip().split(b' ', 1)
            self.result_count = self.result_count + 1
            if self._add_result_cb: self._add_result_cb(match.decode('utf-8'), float(strength))

        # If we've seen enough results, kill the search
        if self.result_count >= self.max_results:
            self.abort("Reached result cap")
            return

        # Otherwise, schedule another read.
        self.process_handle.stdout.read_until(b'\n', callback=self.on_stdout_line)

    def on_stderr(self, data):
        # Do something with the stderr data.
        if len(data) > 0 and self._error_cb:
            print("subprocess stderr:", data)
            self._error_cb(data)

    def on_child_exit(self, exit_code):
        print("child process exited", exit_code)
        self.aborted = True
        self.process_handle = None
        if self._on_exit_cb: self._on_exit_cb(exit_code, self.abort_reason)

    def abort(self, reason="no reason given"):
        if not self.aborted:
            self.aborted = True
            self.abort_reason = reason
            # Reaching into the implementation of tornado's Subprocess, since it
            # doesn't expose kill() directly.
            self.process_handle.proc.kill()

class Controller(object):
    def __init__(self):
        self.connections = {}

    def add_client(self, client):
        self.connections[client] = ConnectionHandle(self, client,
                on_search_stopped=self.on_search_stopped,
                )
        # Notify all connected clients about the additional connection.
        self.update_all_client_count()
        client.write_message(self.update_search_count_message())

    def remove_client(self, client):
        # Abort any search that client was running.
        self.connections[client].abort_search()
        del self.connections[client]
        # Notify all connected clients about the removed connection.
        self.update_all_client_count()

    def update_all_client_count(self):
        client_count = len(self.connections)
        print("current client count:", client_count)
        msg = json.dumps({"method": "update_client_count", "value": client_count})
        self.send_to_all_clients(msg)

    def update_search_count_message(self):
        search_count = len([h.search_handle for h in self.connections.values() if h.search_handle])
        print("current search count:", search_count)
        return json.dumps({"method": "update_search_count", "value": search_count})

    def on_search_stopped(self, exit_code):
        self.update_all_search_count()

    def update_all_search_count(self):
        msg = self.update_search_count_message()
        self.send_to_all_clients(msg)

    def send_to_all_clients(self, msg):
        for conn in self.connections:
            conn.write_message(msg)

    def start_search_for_client(self, client, search_string):
        self.connections[client].start_search(search_string)
        self.update_all_search_count()

    def abort_search_for_client(self, client):
        self.connections[client].abort_search()
        self.update_all_search_count()

globalController = Controller()

class SocketHandler(tornado.websocket.WebSocketHandler):
    def open(self):
        print("Websocket opened:", self)
        globalController.add_client(self)

    def on_message(self, message):
        msg = json.loads(message)
        method = msg.get('method')
        value = msg.get('value')
        if method == "start_search":
            print("should start search")
            globalController.start_search_for_client(self, value)

    def on_close(self):
        print("Websocket closed:", self)
        globalController.remove_client(self)

def main():
    parse_command_line()
    app = tornado.web.Application(
        [
            (r"/", MainHandler),
            (r"/websocket", SocketHandler),
        ],
        template_path=os.path.join(PWD, "templates"),
        static_path=os.path.join(PWD, "static"),
        debug=options.debug,
    )
    app.listen(options.port)
    print("Listening on port {}".format(options.port))
    tornado.ioloop.IOLoop.current().start()

if __name__ == "__main__":
    main()
