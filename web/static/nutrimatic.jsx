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
    propTypes: {
        socket: React.PropTypes.object.isRequired,
    },
    getInitialState: function () {
        return {
            clientCount: 0,
            searchCount: 0,
            connState: "disconnected",
        };
    },
    startSearch: function (event) {
        event.preventDefault();
        var search_text = this.refs.search.value;
        console.log("start search for " + search_text);
        var msg = JSON.stringify({
            method: "start_search",
            value: search_text,
        });
        this.props.socket.send(msg);
    },
    render: function () {
      return (
      <div>
        <p><em>Almost, but not quite, entirely unlike tea.</em></p>
        <p>Connection state: {this.state.connState}</p>
        <p>Connected users: {this.state.clientCount}</p>
        <p>Running searches: {this.state.searchCount}</p>
        <form>
            <input type="text" ref="search"></input>
            <button type="submit" onClick={this.startSearch}>Go</button>
        </form>
      </div>
      );
    }
});

// Set up websocket.
var sock = new ReconnectingWebSocket(socketUri());

// Mount React component.
var root = ReactDOM.render(
    <Page socket={sock} />,
    document.getElementById('body')
);

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
    } else if (d.method && d.method === "update_search_count") {
        root.setState({searchCount: d.value});
    }
    console.log(event);
};

sock.onerror = function (event) {
    console.log(event);
};

sock.onclose = function (event) {
    console.log("socket closed; we should reset global state");
    root.setState({clientCount: 0, searchCount: 0, connState: "disconnected"});
};
