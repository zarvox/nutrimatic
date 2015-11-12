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

// React components
var SearchResults = React.createClass({
    propTypes: {
        running: React.PropTypes.bool.isRequired,
        exit_code: React.PropTypes.number.isRequired,
        message: React.PropTypes.string.isRequired,
        results: React.PropTypes.arrayOf(React.PropTypes.shape({
            score: React.PropTypes.string,
            text: React.PropTypes.string,
        })).isRequired,
        progress: React.PropTypes.number.isRequired,
    },
    render: function () {

        var searchBlob = (<li>Search state: { this.props.running ? "running" : "stopped" }</li>);

        var results = [];
        for (var i = 0 ; i < this.props.results.length ; i++) {
            var res = this.props.results[i];
            results.push(<li>{res.text}</li>);
        }
        return (<div>
            {/* TODO: some header information about the search progress - a spinner or clock, maybe? */}
            <ul>
                {results}
            </ul>
        </div>
        );
    },
});

var Page = React.createClass({
    propTypes: {
        socket: React.PropTypes.object.isRequired,
    },
    getInitialState: function () {
        return {
            clientCount: 0,
            searchCount: 0,
            connState: "disconnected",
            searchState: {
                running: false,
                exit_code: 0,
                message: "",
                results: [],
                progress: 0,
            }
        };
    },
    startSearch: function (event) {
        event.preventDefault();
        var search_text = this.refs.search.value;
        console.log("start search for " + search_text);
        this.setState({
            searchState: {
                running: true,
                exit_code: 0,
                message: "",
                results: [],
                progress: 0,
            }
        });
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
        <SearchResults {...this.state.searchState} />
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
    console.log(event);
    if (d.method) {
        if (d.method === "update_client_count") {
            root.setState({clientCount: d.value});
        } else if (d.method === "update_search_count") {
            root.setState({searchCount: d.value});
        } else if (d.method === "search_result_found") {
            root.state.searchState.results.push({
                "score": d.value.strength,
                "text": d.value.match
            });
            root.forceUpdate();
        } else if (d.method === "search_progress") {
            // TODO: write backend stuff to propagate this
            root.state.searchState.progress = d.value;
            root.forceUpdate();
        } else if (d.method === "search_stopped") {
            root.setState({searchState: {
                    running: false,
                    exit_code: d.value.exit_code,
                    message: d.value.message,
                    results: root.state.searchState.results,
                    progress: root.state.searchState.progress,
                }
            });
        }
    }
};

sock.onerror = function (event) {
    console.log(event);
};

sock.onclose = function (event) {
    console.log("socket closed; we should reset global state");
    root.setState({clientCount: 0, searchCount: 0, connState: "disconnected"});
};
