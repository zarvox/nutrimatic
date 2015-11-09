#!env/bin/python

import os
import json

import tornado.ioloop
import tornado.web
import tornado.websocket
from tornado.options import define, options, parse_command_line

define("port", default=8888, help="run on the given port", type=int)
define("debug", default=False, help="run in debug mode")

PWD=os.path.dirname(os.path.abspath(__file__))

class MainHandler(tornado.web.RequestHandler):
    def get(self):
        self.render("index.html")

class SearchHandle(object):
    def __init__(self, search_string):
        self.search_string = search_string
        # TODO: spawn a subprocess, emit events for certain actions

class Controller(object):
    def __init__(self):
        self.connections = set()
        self.searches = {} # map from client to search handle
    def add_client(self, client):
        self.connections.add(client)
        # Notify all connected clients about the additional connection.
        self.update_all_client_count()

    def remove_client(self, client):
        self.connections.remove(client)
        # Notify all connected clients about the removed connection.
        self.update_all_client_count()

    def update_all_client_count(self):
        client_count = len(self.connections)
        print("current client count:", client_count)
        msg = json.dumps({"method": "update_client_count", "value": client_count})
        self.send_to_all_clients(msg)

    def send_to_all_clients(self, msg):
        for conn in self.connections:
            conn.write_message(msg)

    def start_search_for_client(self, client):
        # TODO: start a supervised search job as a subprocess.
        pass

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
            # TODO: start a search job 
            pass
        self.write_message(u"You said: " + message)

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
