var ReconnectingWebSocket = function ReconnectingWebSocket(socketUri) {
    var self = this;
    this._socketUri = socketUri;
    this._lastConnectAttempt = 0;
    this._connectScheduled = false;
    // Patch through accessors for readyState and bufferedAmount
    Object.defineProperty(this, "readyState", {
        __proto__: null,
        get: function () {
            return self._innerSocket.readyState;
        },
    });
    Object.defineProperty(this, "bufferedAmount", {
        __proto__: null,
        get: function () {
            return self._innerSocket.bufferedAmount;
        },
    });

    // Connect 
    this._connect();
    return this;
};
ReconnectingWebSocket.RATELIMIT_MSEC = 1000;
ReconnectingWebSocket.prototype._connect_real = function () {
    // Unconditionally attempts to connect.
    var self = this;
    this._lastConnectAttempt = new Date();
    this._connectScheduled = false;
    this._innerSocket = new WebSocket(this._socketUri);
    this._innerSocket.onopen = function(event) {
        if (self.onopen) self.onopen(event);
    };
    this._innerSocket.onmessage = function(event) {
        if (self.onmessage) self.onmessage(event);
    };
    this._innerSocket.onerror = function(event) {
        console.log("ReconnectingWebSocket error:");
        console.log(event);
        if (self.onerror) self.onerror(event);
    };
    this._innerSocket.onclose = function(event) {
        console.log("socket closed:");
        console.log(event);
        // event.wasClean
        // event.code
        // event.reason

        // TODO: Clear global state?
        if (self.onclose) self.onclose(event);

        // Attempt to reconnect.
        // TODO: exponential backoff?
        if (!event.wasClean) {
            self._connect();
        }
    };
}
ReconnectingWebSocket.prototype._connect = function() {
    var self = this;
    var now = new Date();
    var msecSinceLastAttempt = now - this._lastConnectAttempt;
    if (msecSinceLastAttempt > ReconnectingWebSocket.RATELIMIT_MSEC) {
        this._connect_real();
    } else if (!this._connectScheduled) {
        var delayMsec = ReconnectingWebSocket.RATELIMIT_MSEC - msecSinceLastAttempt;
        this._connectScheduled = true;
        window.setTimeout(this._connect_real.bind(this), delayMsec);
    }
};
// Patch send and close to underlying socket
ReconnectingWebSocket.prototype.send = function (data) {
    return this._innerSocket.send(data);
};
ReconnectingWebSocket.prototype.close = function () {
    return this._innerSocket.close();
};
