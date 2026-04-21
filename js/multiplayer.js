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

  function generateRoomCode() {
    // peer ID gets prefixed for namespacing on the public broker
    const r = Math.random().toString(36).slice(2, 6).toUpperCase();
    const r2 = Math.random().toString(36).slice(2, 6).toUpperCase();
    return `NS-${r}-${r2}`;
  }

  function host({ onConnect: oc, onMessage: om, onClose: ocl, onError: oe }) {
    cleanup();
    isHost = true;
    onConnect = oc; onMessage = om; onClose = ocl; onError = oe;
    myId = generateRoomCode();
    peer = new Peer(myId, { debug: 1 });

    peer.on('open', id => {
      // ready to accept connections
    });

    peer.on('connection', c => {
      if (conn) {
        // already have an opponent — refuse extras
        c.on('open', () => { c.send({ type: 'bye', reason: 'busy' }); c.close(); });
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

  function join(code, { onConnect: oc, onMessage: om, onClose: ocl, onError: oe }) {
    cleanup();
    isHost = false;
    onConnect = oc; onMessage = om; onClose = ocl; onError = oe;
    peer = new Peer(undefined, { debug: 1 });

    peer.on('open', id => {
      myId = id;
      conn = peer.connect(code, { reliable: false, serialization: 'json' });
      wireConn();
    });

    peer.on('error', err => {
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
      if (data && data.type === '__ping') { try { conn.send({ type: '__pong' }); } catch {} return; }
      if (data && data.type === '__pong') { lastPongTs = Date.now(); return; }
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
      try { conn.send({ type: '__ping' }); } catch {}
      if (Date.now() - lastPongTs > 6000) {
        // connection appears dead
        try { conn.close(); } catch {}
      }
    }, 2000);
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
  };
})();
