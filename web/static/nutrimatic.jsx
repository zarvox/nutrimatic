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

function queryParams() {
    var params = {};
    if (window.location.search.length > 1) {
        var query = window.location.search.substr(1);
        var kvs = query.split("&");
        for (var i = 0 ; i < kvs.length ; i++) {
            var kv = kvs[i];
            var pair = kv.split("=", 2);
            console.log(pair);
            params[decodeURIComponent(pair[0])] = pair.length > 1 ? decodeURIComponent(pair[1]) : "";
        }
    }
    console.log(params);
    return params;
};

// React components
var SearchResults = React.createClass({
    propTypes: {
        currentState: React.PropTypes.oneOf(["searching", "compiling", "stopped"]).isRequired,
        exitCode: React.PropTypes.number.isRequired,
        message: React.PropTypes.string.isRequired,
        results: React.PropTypes.arrayOf(React.PropTypes.shape({
            score: React.PropTypes.number,
            text: React.PropTypes.string,
        })).isRequired,
        progress: React.PropTypes.number.isRequired,
    },
    render: function () {
        var results = [];
        for (var i = 0 ; i < this.props.results.length ; i++) {
            var res = this.props.results[i];
            results.push(<li key={i}>{res.text}</li>);
        }
        var searchInfo;
        if (this.props.currentState === "searching") {
            searchInfo = <div>{"searching... (" + this.props.results.length + " matches)"}</div>;
        } else if (this.props.currentState === "compiling") {
            searchInfo = <div>compiling query...</div>;
        } else if (this.props.currentState === "stopped") {
            searchInfo = <div>{"search stopped: " + this.props.message}</div>;
        }
        return (<div>
            {searchInfo}
            <ul>
                {results}
            </ul>
        </div>
        );
    },
});

var SyntaxNotes = React.createClass({
    render: function () {
        return (<div>
            <h2>Syntax</h2>
            <ul>
                <li><em>a-z, 0-9, space</em> - literal match</li>
                <li><em>[], (), {}, |, ., ?, *, + -</em> same as regexp</li>
                <li><em>"expr"</em> - forbid word breaks without a space or hyphen</li>
                <li><em>expr&expr</em> - both expressions must match</li>
                <li><em>&lt;aaagmnr>, &lt;(gram)(ana)></em> - anagram of contents</li>
                <li><em>_ (underscore)</em> - alphanumeric, not space: [a-z0-9]</li>
                <li><em># (number sign)</em> - digit: [0-9]</li>
                <li><em>- (hyphen)</em> - optional space: ( ?)</li>
                <li><em>A</em> - alphabetic: [a-z]</li>
                <li><em>C</em> - consonant (including y)</li>
                <li><em>V</em> - vowel ([aeiou], not y)</li>
            </ul>
        </div>);
    },
});

var ServerStatus = React.createClass({
    propTypes: {
        connState: React.PropTypes.string.isRequired,
        clientCount: React.PropTypes.number.isRequired,
        searchCount: React.PropTypes.number.isRequired,
    },
    render: function () {
        var styles = {
          display: "block",
          width: "30%",
          float: "right",
          clear: "none",
          backgroundColor: "#eeeeee",
        };
        return (
        <div style={styles}>
            <div>Connection: {this.props.connState}</div>
            <div>Connected users: {this.props.connState === "connected" ? this.props.clientCount : "<unknown>"}</div>
            <div>Running searches: {this.props.connState === "connected" ? this.props.searchCount : "<unknown>"}</div>
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
                currentState: "stopped",
                exitCode: 0,
                message: "",
                results: [],
                progress: 0,
            },
            noSearchYet: true,
        };
    },
    go: function(event) {
        event.preventDefault();
        var search_text = this.refs.search.value;
        this.startSearch(search_text);
    },
    startSearch: function (search_text) {
        console.log("start search for " + search_text);
        this.setState({
            searchState: {
                currentState: "compiling",
                exitCode: 0,
                message: "",
                results: [],
                progress: 0,
            },
            noSearchYet: false,
        });
        var msg = JSON.stringify({
            method: "start_search",
            value: search_text,
        });
        this.props.socket.send(msg);
    },
    setSearchText: function (search_text) {
        this.refs.search.value = search_text;
    },
    render: function () {
        var inputStyles = {
            height: "32px",
            fontSize: "16pt",
            margin: "2px",
        };
        var pStyles = {
            margin: "0px",
        };
        return (
        <div>
            <ServerStatus connState={this.state.connState}
                clientCount={this.state.clientCount}
                searchCount={this.state.searchCount} />
            <p style={pStyles}><em>Almost, but not quite, entirely unlike tea.</em></p>
            <form>
                <input type="text" ref="search" style={inputStyles} autoFocus={true}></input>
                <button type="submit" onClick={this.go} style={inputStyles}>Go</button>
            </form>
            {this.state.noSearchYet ? <SyntaxNotes /> : <SearchResults {...this.state.searchState} />}
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

// Fill DOM node with a default value
var q = queryParams().q;
if (q) {
    root.setSearchText(q);
}

// A boolean so we can autorun searches on first connect
var firstConnect = true;

sock.onopen = function(event) {
    console.log(event);
    console.log(sock);
    sock.send(JSON.stringify({method:"greeting", value:"Hi there tornado!"}));
    root.setState({connState: "connected"});
    if (firstConnect) {
        firstConnect = false;
        var q = queryParams().q;
        if (q) {
            root.startSearch(q)
        }
    }
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
            root.state.searchState.currentState = "searching";
            root.state.searchState.progress = d.value;
            root.forceUpdate();
        } else if (d.method === "search_stopped") {
            root.setState({searchState: {
                    currentState: "stopped",
                    exitCode: d.value.exit_code,
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
