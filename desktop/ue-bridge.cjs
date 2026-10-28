// Minimal loopback WebSocket relay (RFC 6455 text frames, no dependencies) between the game
// renderer and Unreal Engine clients. Binds to 127.0.0.1 only; messages are validated and
// size-limited before relay. Unreal connects as a client with its WebSockets module.
const http = require('node:http');
const crypto = require('node:crypto');

const PROTOCOL = 'gridiron.ue/1';
const TYPES = new Set(['session.start', 'play.execution', 'cutscene.trigger', 'stadium.state', 'ue.ready', 'ue.cutscene.finished', 'ue.error']);
const FROM_UE = new Set(['ue.ready', 'ue.cutscene.finished', 'ue.error']);
const MAX_BYTES = 4 * 1024 * 1024;
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

function validate(msg, fromUnreal) {
  if (!msg || typeof msg !== 'object' || msg.protocol !== PROTOCOL || !TYPES.has(msg.type)) return false;
  if (!Number.isSafeInteger(msg.seq) || !msg.payload || typeof msg.payload !== 'object') return false;
  return fromUnreal ? FROM_UE.has(msg.type) : !FROM_UE.has(msg.type);
}

function encodeFrame(text, opcode = 0x1) {
  const data = Buffer.from(text);
  const header = data.length < 126 ? Buffer.from([0x80 | opcode, data.length])
    : data.length < 65536 ? Buffer.from([0x80 | opcode, 126, data.length >> 8, data.length & 255])
    : Buffer.concat([Buffer.from([0x80 | opcode, 127]), (() => { const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(data.length)); return b; })()]);
  return Buffer.concat([header, data]);
}

// Parses complete client frames from a buffer; returns { frames, rest }. Clients must mask.
function decodeFrames(buffer) {
  const frames = [];
  let offset = 0;
  while (buffer.length - offset >= 2) {
    const b0 = buffer[offset], b1 = buffer[offset + 1], masked = b1 & 0x80;
    let length = b1 & 0x7f, pos = offset + 2;
    if (length === 126) { if (buffer.length < pos + 2) break; length = buffer.readUInt16BE(pos); pos += 2; }
    else if (length === 127) { if (buffer.length < pos + 8) break; length = Number(buffer.readBigUInt64BE(pos)); pos += 8; }
    if (length > MAX_BYTES) throw Error('Frame too large');
    if (!masked) throw Error('Client frames must be masked');
    if (buffer.length < pos + 4 + length) break;
    const mask = buffer.subarray(pos, pos + 4), payload = Buffer.from(buffer.subarray(pos + 4, pos + 4 + length));
    for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
    frames.push({ fin: !!(b0 & 0x80), opcode: b0 & 0x0f, payload });
    offset = pos + 4 + length;
  }
  return { frames, rest: buffer.subarray(offset) };
}

function createBridge({ port = 47800, onUnrealMessage = () => {}, log = () => {} } = {}) {
  const clients = new Set();
  const server = http.createServer((_req, res) => { res.writeHead(426, { 'Content-Type': 'text/plain' }); res.end('Gridiron Unreal bridge: WebSocket only.'); });
  server.on('upgrade', (req, socket) => {
    const key = req.headers['sec-websocket-key'];
    const remote = socket.remoteAddress;
    if (!key || !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remote)) { socket.destroy(); return; }
    const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    let pending = Buffer.alloc(0), fragments = [];
    clients.add(socket);
    log('Unreal client connected');
    socket.on('data', (chunk) => {
      try {
        pending = Buffer.concat([pending, chunk]);
        if (pending.length > MAX_BYTES * 2) throw Error('Buffer overflow');
        const { frames, rest } = decodeFrames(pending);
        pending = rest;
        for (const f of frames) {
          if (f.opcode === 0x8) { socket.end(encodeFrame('', 0x8)); return; }
          if (f.opcode === 0x9) { socket.write(encodeFrame(f.payload.toString(), 0xA)); continue; }
          if (f.opcode === 0x1 || f.opcode === 0x0) {
            fragments.push(f.payload);
            if (!f.fin) continue;
            const text = Buffer.concat(fragments).toString('utf8');
            fragments = [];
            let msg; try { msg = JSON.parse(text); } catch { continue; }
            if (validate(msg, true)) onUnrealMessage(msg);
          }
        }
      } catch (e) { log('Bridge client dropped: ' + e.message); socket.destroy(); }
    });
    socket.on('close', () => clients.delete(socket));
    socket.on('error', () => clients.delete(socket));
  });
  return {
    start() { return new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', () => { log('Unreal bridge listening on ws://127.0.0.1:' + port); resolve(); }); }); },
    stop() { for (const c of clients) c.destroy(); clients.clear(); return new Promise((r) => server.close(() => r())); },
    // Relays a renderer message to every Unreal client. Invalid messages are dropped.
    broadcast(msg) {
      if (!validate(msg, false)) return false;
      const text = JSON.stringify(msg);
      if (Buffer.byteLength(text) > MAX_BYTES) return false;
      const frame = encodeFrame(text);
      for (const c of clients) c.write(frame);
      return true;
    },
    status() { return { listening: server.listening, port, clients: clients.size, connected: clients.size > 0 }; },
  };
}

module.exports = { createBridge, validate, encodeFrame, decodeFrames, PROTOCOL };
