/* ========================================================================
   Multiplayer — WebRTC peer-to-peer via PeerJS public broker.
   Host runs authoritative physics; client streams its paddle and renders
   what the host streams back.
   Message types:
     hello  { name, bet }                — handshake (both ways)
     ready  { target }                   — host accepts and announces match
     pad    { x, y, vx, vy }             — paddle state stream
     state  { p1:{x,y,vx,vy}, puck:{x,y,vx,vy}, score:{p1,p2}, t }   — host snapshot
     goal   { who }                      — host event
     win    { who }                      — host event
     bye                                 — leave
   ======================================================================== */
const Multiplayer = (() => {
  let peer = null;
  let conn = null;
  let isHost = false;
  let myId = null;
  let onConnect = null;
  let onMessage = null;
  let onClose = null;
  let onError = null;
  let pingTimer = null;
  let lastPongTs = Date.now();
  let lastPingSentTs = 0;
  let rttMs = 0;

  function generateRoomCode() {
    // Avoid 0/O/1/I to keep codes readable when shared verbally
    const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const pick = () => A[Math.floor(Math.random() * A.length)];
    return `NS-${pick()}${pick()}${pick()}${pick()}-${pick()}${pick()}${pick()}${pick()}`;
  }

  function host({ onReady, onConnect: oc, onMessage: om, onClose: ocl, onError: oe }) {
    cleanup();
    isHost = true;
    onConnect = oc; onMessage = om; onClose = ocl; onError = oe;
    myId = generateRoomCode();
    peer = new Peer(myId, { debug: 1 });

    peer.on('open', id => {
      // Now registered with the broker — safe for joiners to connect
      if (onReady) onReady(id);
    });

    peer.on('connection', c => {
      if (conn) {
        c.on('open', () => { try { c.send({ type: 'bye', reason: 'busy' }); c.close(); } catch {} });
        return;
      }
      conn = c;
      wireConn();
    });

    peer.on('error', err => {
      onError && onError(err);
    });

    return myId;
  }

  function join(code, { onConnect: oc, onMessage: om, onClose: ocl, onError: oe, onStatus }) {
    cleanup();
    isHost = false;
    onConnect = oc; onMessage = om; onClose = ocl; onError = oe;
    peer = new Peer(undefined, { debug: 1 });

    let attempts = 0;
    const MAX_ATTEMPTS = 8;     // ~12 seconds of retries
    const RETRY_MS = 1500;
    let retryTimer = null;
    let openWatchdog = null;

    function tryConnect() {
      attempts++;
      onStatus && onStatus(`Connecting (attempt ${attempts}/${MAX_ATTEMPTS})…`);
      conn = peer.connect(code, { reliable: false, serialization: 'json' });
      wireConn();
      // If conn doesn't open within 4s, retry
      clearTimeout(openWatchdog);
      openWatchdog = setTimeout(() => {
        if (!conn || !conn.open) {
          if (attempts < MAX_ATTEMPTS) {
            try { conn && conn.close(); } catch {}
            tryConnect();
          } else {
            onError && onError({ type: 'timeout', message: 'Could not reach host. Check the room code and try again.' });
          }
        }
      }, 4000);
    }

    peer.on('open', id => {
      myId = id;
      tryConnect();
    });

    peer.on('error', err => {
      // peer-unavailable is the typical "host not in broker yet" error.
      // Retry a few times before giving up.
      if (err && err.type === 'peer-unavailable' && attempts < MAX_ATTEMPTS) {
        clearTimeout(retryTimer);
        retryTimer = setTimeout(() => tryConnect(), RETRY_MS);
        return;
      }
      onError && onError(err);
    });
  }

  function wireConn() {
    conn.on('open', () => {
      lastPongTs = Date.now();
      onConnect && onConnect();
      startHealthCheck();
    });
    conn.on('data', data => {
      if (data && data.type === '__ping') { try { conn.send({ type: '__pong', t: data.t }); } catch {} return; }
      if (data && data.type === '__pong') {
        lastPongTs = Date.now();
        if (data.t) rttMs = Date.now() - data.t;
        return;
      }
      onMessage && onMessage(data);
    });
    conn.on('close', () => {
      stopHealthCheck();
      onClose && onClose();
    });
    conn.on('error', err => {
      onError && onError(err);
    });
  }

  function startHealthCheck() {
    stopHealthCheck();
    pingTimer = setInterval(() => {
      if (!conn || !conn.open) return;
      lastPingSentTs = Date.now();
      try { conn.send({ type: '__ping', t: lastPingSentTs }); } catch {}
      if (Date.now() - lastPongTs > 6000) {
        // connection appears dead
        try { conn.close(); } catch {}
      }
    }, 1500);
  }
  function stopHealthCheck() { if (pingTimer) { clearInterval(pingTimer); pingTimer = null; } }

  function send(msg) {
    if (conn && conn.open) {
      try { conn.send(msg); } catch (e) { /* ignore */ }
    }
  }

  function close() {
    cleanup();
  }

  function cleanup() {
    stopHealthCheck();
    if (conn) { try { conn.close(); } catch {} conn = null; }
    if (peer) { try { peer.destroy(); } catch {} peer = null; }
  }

  return {
    host, join, send, close,
    get isHost() { return isHost; },
    get id() { return myId; },
    get connected() { return !!(conn && conn.open); },
    get ping() { return rttMs; },
  };
})();
