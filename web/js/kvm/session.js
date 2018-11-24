function Session() {
	// var self = this;

	/********************************************************************************/

	var __ws = null;

	var __ping_timer = null;
	var __missed_heartbeats = 0;

	var __hid = new Hid();
	var __atx = new Atx();
	var __msd = new Msd();
	var __streamer = new Streamer();

	var __init__ = function() {
		$("link-led").title = "Not connected yet...";
		__startPoller();
	};

	/********************************************************************************/

	var __setKvmdInfo = function(state) {
		if (state.meta) {
			var text = JSON.stringify(state.meta, undefined, 4).replace(/ /g, "&nbsp;").replace(/\n/g, "<br>");
			$("about-meta").innerHTML = `
				<span class="code-comment">// The Pi-KVM metadata.<br>
				// You can get this json using handle <a target="_blank" href="/kvmd/info">/kvmd/info</a>.<br>
				// In the standard configuration this data<br>
				// is specified in the file /etc/kvmd/meta.yaml.</span><br>
				<br>
				${text}
			`;
			if (state.meta.server && state.meta.server.host) {
				$("kvmd-meta-server-host").innerHTML = "Server: " + state.meta.server.host;
				document.title = "Pi-KVM Session: " + state.meta.server.host;
			} else {
				$("kvmd-meta-server-host").innerHTML = "";
				document.title = "Pi-KVM Session";
			}
		}
		$("about-version-kvmd").innerHTML = state.version.kvmd;
		$("about-version-streamer").innerHTML = `${state.version.streamer} (${state.streamer})`;
	};

	var __startPoller = function() {
		$("link-led").className = "led-yellow";
		$("link-led").title = "Connecting...";
		var http = tools.makeRequest("GET", "/ws_auth", function() {
			if (http.readyState === 4) {
				if (http.status === 200) {
					var proto = (location.protocol === "https:" ? "wss" : "ws");
					__ws = new WebSocket(`${proto}://${location.host}/kvmd/ws`);
					__ws.onopen = __wsOpenHandler;
					__ws.onmessage = __wsMessageHandler;
					__ws.onerror = __wsErrorHandler;
					__ws.onclose = __wsCloseHandler;
				} else {
					__wsCloseHandler(null);
				}
			}
		});
	};

	var __wsOpenHandler = function(event) {
		$("link-led").className = "led-green";
		$("link-led").title = "Connected";
		tools.debug("Session: socket opened:", event);
		__hid.setSocket(__ws);
		__missed_heartbeats = 0;
		__ping_timer = setInterval(__pingServer, 1000);
	};

	var __wsMessageHandler = function(event) {
		// tools.debug("Session: received socket data:", event.data);
		event = JSON.parse(event.data);
		if (event.msg_type === "pong") {
			__missed_heartbeats = 0;
		} else if (event.msg_type === "event") {
			if (event.msg.event === "info_state") {
				__setKvmdInfo(event.msg.event_attrs);
			} else if (event.msg.event === "streamer_state") {
				__streamer.setState(event.msg.event_attrs);
			} else if (event.msg.event === "atx_state") {
				__atx.setState(event.msg.event_attrs);
			} else if (event.msg.event === "msd_state") {
				__msd.setState(event.msg.event_attrs);
			}
		}
	};

	var __wsErrorHandler = function(event) {
		tools.error("Session: socket error:", event);
		if (__ws) {
			__ws.onclose = null;
			__ws.close();
			__wsCloseHandler(null);
		}
	};

	var __wsCloseHandler = function(event) {
		$("link-led").className = "led-gray";
		tools.debug("Session: socket closed:", event);
		if (__ping_timer) {
			clearInterval(__ping_timer);
			__ping_timer = null;
		}
		__streamer.clearState();
		__atx.clearState();
		__hid.setSocket(null);
		__ws = null;
		setTimeout(function() {
			$("link-led").className = "led-yellow";
			setTimeout(__startPoller, 500);
		}, 500);
	};

	var __pingServer = function() {
		try {
			__missed_heartbeats += 1;
			if (__missed_heartbeats >= 5) {
				throw new Error("Too many missed heartbeats");
			}
			__ws.send(JSON.stringify({"event_type": "ping"}));
		} catch (err) {
			tools.error("Session: ping error:", err.message);
			if (__ws) {
				__ws.onclose = null;
				__ws.close();
				__wsCloseHandler(null);
			}
		}
	};

	__init__();
}