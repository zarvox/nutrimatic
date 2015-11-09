function socketUri() {
    var loc = window.location
    var ws_uri;
    if (loc.protocol === "https:") {
            ws_uri = "wss://" + loc.host + "/websocket";
    } else {
            ws_uri = "ws://" + loc.host + "/websocket";
    }
    return ws_uri;
};

// React component
var Page = React.createClass({
    getInitialState: function () {
        return {
            clientCount: 0,
            connState: "disconnected",
        };
    },
    render: function () {
      return (
      <div>
        <p><em>Almost, but not quite, entirely unlike tea.</em></p>
        <p>Connected users: {this.state.clientCount}</p>
        <p>Connection state: {this.state.connState}</p>
        <input type="text"></input>
        <button>Go</button>
      </div>
      );
    }
});

// Mount React component
var root = ReactDOM.render(
    <Page />,
    document.getElementById('body')
);

// Set up websocket.
var sock = new ReconnectingWebSocket(socketUri());

sock.onopen = function(event) {
    console.log(event);
    console.log(sock);
    sock.send(JSON.stringify({method:"greeting", value:"Hi there tornado!"}));
    root.setState({connState: "connected"});
};

sock.onmessage = function (event) {
    var d = JSON.parse(event.data);
    if (d.method && d.method === "update_client_count") {
        root.setState({clientCount: d.value});
    }
    console.log(event);
};

sock.onerror = function (event) {
    console.log(event);
};

sock.onclose = function (event) {
    console.log("socket closed; we should reset global state");
    root.setState({clientCount: 0, connState: "disconnected"});
};
