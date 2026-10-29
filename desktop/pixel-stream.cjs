// Pixel Streaming signalling for the embedded Unreal match view. Mirrors the protocol of Epic's
// native signalling server (PixelStreaming2Servers/SignallingServer.cpp): the Unreal renderer
// connects as the streamer over a loopback WebSocket; the game page is the single player and talks
// through the sandboxed preload (IPC), so no port is exposed to page content.
//
//   streamer connects        → config, identify          (streamer replies endpointId)
//   player opens             → config to the player
//   player subscribes / sends → playerConnected {playerId, dataChannel, sfu:false, sendOffer:true}
//   streamer → player        : offer / iceCandidate / … carrying playerId (stripped before relay)
//   player → streamer        : answer / iceCandidate / … (playerId added)
//   ping                     → pong
const http = require('node:http');
const crypto = require('node:crypto');
const { encodeFrame, decodeFrames } = require('./ue-bridge.cjs');

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const PLAYER_ID = '1';
const MAX_MESSAGE = 1024 * 1024;
// Player messages the relay accepts from the page; everything else is dropped.
const PLAYER_TYPES = new Set(['subscribe', 'unsubscribe', 'listStreamers', 'answer', 'offer', 'iceCandidate', 'ping', 'stats', 'dataChannelRequest', 'peerDataChannelsReady', 'layerPreference']);
const config = () => ({ type: 'config', peerConnectionOptions: { iceServers: [] } });

function createSignalling({ port = 47801, log = () => {}, onPlayerMessage = () => {}, onStatus = () => {}, trace = null } = {}) {
  // A streamer is only addressable once it has answered identify with endpointId; Unreal ignores
  // a playerConnected that arrives before that, so an early subscribe waits (pendingSubscribe).
  let streamer = null, streamerId = null, playerOpen = false, subscribed = false, pendingSubscribe = false;
  const server = http.createServer((_req, res) => { res.writeHead(426, { 'Content-Type': 'text/plain' }); res.end('Gridiron signalling: WebSocket only.'); });

  // trace(direction, message) is an opt-in debugging hook; it sees every relayed message.
  const toStreamer = (msg) => { trace?.("to-streamer", msg); return streamer && streamer.write(encodeFrame(JSON.stringify(msg))); };
  const toPlayer = (msg) => { trace?.("to-player", msg); return playerOpen && onPlayerMessage(msg); };
  const status = () => ({ listening: server.listening, port, streamer: !!(streamer && streamerId), streamerId, player: playerOpen, subscribed });

  function subscribe() {
    if (!playerOpen) return false;
    if (!streamer || !streamerId) { pendingSubscribe = true; return true; }
    pendingSubscribe = false;
    if (subscribed) toStreamer({ type: 'playerDisconnected', playerId: PLAYER_ID });
    toStreamer({ type: 'playerConnected', playerId: PLAYER_ID, dataChannel: true, sfu: false, sendOffer: true });
    subscribed = true;
    return true;
  }
  function unsubscribe() {
    if (subscribed) toStreamer({ type: 'playerDisconnected', playerId: PLAYER_ID });
    subscribed = false;
    pendingSubscribe = false;
  }

  function onStreamerMessage(msg) {
    trace?.("from-streamer", msg);
    if (msg.type === 'ping') return toStreamer({ type: 'pong', time: Math.floor(Date.now() / 1000) });
    if (msg.type === 'endpointId') {
      streamerId = typeof msg.id === 'string' ? msg.id : 'DefaultStreamer';
      if (pendingSubscribe) subscribe();
      onStatus(status());
      return;
    }
    if (msg.type === 'disconnectPlayer') { subscribed = false; toPlayer({ type: 'playerDisconnected' }); return; }
    // Everything else is for a player and must name it.
    if (String(msg.playerId) !== PLAYER_ID) return;
    const { playerId, ...forward } = msg;
    toPlayer(forward);
  }

  server.on('upgrade', (req, socket) => {
    const key = req.headers['sec-websocket-key'];
    if (!key || !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(socket.remoteAddress)) { socket.destroy(); return; }
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${crypto.createHash('sha1').update(key + GUID).digest('base64')}\r\n\r\n`);
    // One streamer at a time: a reconnecting renderer replaces the old socket.
    if (streamer) streamer.destroy();
    // A player that was watching re-subscribes as soon as the new streamer identifies.
    pendingSubscribe = playerOpen && (subscribed || pendingSubscribe);
    streamer = socket; streamerId = null; subscribed = false;
    log('Unreal streamer connected');
    toStreamer(config());
    toStreamer({ type: 'identify' });
    onStatus(status());
    let pending = Buffer.alloc(0), fragments = [];
    socket.on('data', (chunk) => {
      try {
        pending = Buffer.concat([pending, chunk]);
        if (pending.length > MAX_MESSAGE * 2) throw Error('Buffer overflow');
        const { frames, rest } = decodeFrames(pending);
        pending = rest;
        for (const f of frames) {
          if (f.opcode === 0x8) { socket.end(encodeFrame('', 0x8)); return; }
          if (f.opcode === 0x9) { socket.write(encodeFrame(f.payload.toString(), 0xA)); continue; }
          if (f.opcode !== 0x1 && f.opcode !== 0x0) continue;
          fragments.push(f.payload);
          if (!f.fin) continue;
          const text = Buffer.concat(fragments).toString('utf8');
          fragments = [];
          let msg; try { msg = JSON.parse(text); } catch { continue; }
          if (msg && typeof msg.type === 'string') onStreamerMessage(msg);
        }
      } catch (e) { log('Streamer dropped: ' + e.message); socket.destroy(); }
    });
    const gone = () => {
      if (streamer !== socket) return;
      streamer = null; streamerId = null;
      if (subscribed) toPlayer({ type: 'playerDisconnected' });
      subscribed = false;
      log('Unreal streamer disconnected');
      onStatus(status());
    };
    socket.on('close', gone);
    socket.on('error', gone);
  });

  return {
    start() { return new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', () => { log('Signalling listening on ws://127.0.0.1:' + port); resolve(); }); }); },
    stop() { if (streamer) streamer.destroy(); streamer = null; return new Promise((r) => server.close(() => r())); },
    url: () => `ws://127.0.0.1:${port}`,
    status,
    // The page opened (or reopened) its stream view.
    openPlayer() { if (playerOpen) unsubscribe(); playerOpen = true; toPlayer(config()); onStatus(status()); },
    closePlayer() { unsubscribe(); playerOpen = false; onStatus(status()); },
    // A message from the page. Returns false when it was rejected.
    playerMessage(msg) {
      if (!playerOpen || !msg || typeof msg !== 'object' || !PLAYER_TYPES.has(msg.type)) return false;
      if (JSON.stringify(msg).length > MAX_MESSAGE) return false;
      if (msg.type === 'ping') { toPlayer({ type: 'pong', time: Math.floor(Date.now() / 1000) }); return true; }
      if (msg.type === 'listStreamers') { toPlayer({ type: 'streamerList', ids: streamer ? [streamerId || 'DefaultStreamer'] : [] }); return true; }
      if (msg.type === 'subscribe') return subscribe();
      if (msg.type === 'unsubscribe') { unsubscribe(); return true; }
      if (!subscribed && !subscribe()) return false;
      toStreamer({ ...msg, playerId: PLAYER_ID });
      return true;
    },
  };
}

module.exports = { createSignalling, PLAYER_TYPES };
