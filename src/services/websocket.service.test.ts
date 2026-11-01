/**
 * Live updates over real WebSocket connections: nothing is delivered until a
 * client proves who it is, users get only their own wallet's events, and the
 * activity feeds are admin-only.
 */
import http from 'http';
import { AddressInfo } from 'net';
import WebSocket from 'ws';

jest.mock('../utils/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import { WebSocketService, WS_CLOSE_AUTH_TIMEOUT, WS_CLOSE_UNAUTHORIZED } from './websocket.service';
import { jwtService } from './jwt.service';

const ALICE = '0x' + 'a'.repeat(40);
const BOB = '0x' + 'b'.repeat(40);
const userToken = (wallet: string) => jwtService.generateToken({ userId: wallet, wallet });
const adminToken = () => jwtService.generateToken({ userId: 'admin', wallet: 'admin_dashboard', role: 'admin' });

let server: http.Server;
let service: WebSocketService;
let url: string;
const sockets: WebSocket[] = [];

beforeEach(async () => {
  server = http.createServer();
  service = new WebSocketService({ authTimeoutMs: 300 });
  service.initialize(server);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  url = `ws://127.0.0.1:${(server.address() as AddressInfo).port}/ws`;
});

afterEach(async () => {
  sockets.splice(0).forEach((s) => s.terminate());
  await (service as any).close?.();
  await new Promise((resolve) => server.close(resolve));
});

/** Connect and collect every message the server sends. */
async function connect(path = '') {
  const socket = new WebSocket(url + path);
  sockets.push(socket);
  const messages: any[] = [];
  socket.on('message', (data) => messages.push(JSON.parse(data.toString())));
  const closed = new Promise<number>((resolve) => socket.on('close', (code) => resolve(code)));
  await new Promise((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
  });
  const send = (msg: object) => socket.send(JSON.stringify(msg));
  const waitFor = async (type: string, timeoutMs = 1000) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const found = messages.find((m) => m.type === type);
      if (found) return found;
      await new Promise((r) => setTimeout(r, 10));
    }
    return undefined;
  };
  return { socket, messages, closed, send, waitFor };
}

async function login(token: string, path = '') {
  const client = await connect(path);
  client.send({ type: 'auth', payload: { token } });
  const auth = await client.waitFor('authenticated');
  expect(auth).toBeDefined();
  return client;
}

const event = (type: string) => ({ type, payload: { secret: type }, timestamp: new Date().toISOString() });
const settle = () => new Promise((r) => setTimeout(r, 50));

describe('before logging in', () => {
  it('claiming a wallet in the URL gets you nothing', async () => {
    const eavesdropper = await connect(`?wallet=${ALICE}`);
    await settle();

    service.sendToWallet(ALICE, event('alice_private'));
    await settle();

    expect(eavesdropper.messages.map((m) => m.type)).not.toContain('alice_private');
  });

  it('cannot subscribe to feeds', async () => {
    const client = await connect();
    client.send({ type: 'subscribe', payload: { channels: ['admin', 'system'] } });
    expect(await client.waitFor('error')).toBeDefined();

    service.sendToChannel('admin', event('admin_feed'));
    await settle();
    expect(client.messages.map((m) => m.type)).not.toContain('admin_feed');
  });

  it('is disconnected if it never logs in', async () => {
    const client = await connect();
    expect(await client.closed).toBe(WS_CLOSE_AUTH_TIMEOUT);
  });

  it('is disconnected for a bad token', async () => {
    const client = await connect();
    client.send({ type: 'auth', payload: { token: 'forged.token.value' } });
    expect(await client.closed).toBe(WS_CLOSE_UNAUTHORIZED);
  });

  it('can still ping', async () => {
    const client = await connect();
    client.send({ type: 'ping' });
    expect(await client.waitFor('pong')).toBeDefined();
  });
});

describe('a logged-in user', () => {
  it('gets their own wallet’s events, whatever the letter case', async () => {
    const alice = await login(userToken(ALICE));
    service.sendToWallet(ALICE.toUpperCase().replace('0X', '0x'), event('alice_private'));
    expect(await alice.waitFor('alice_private')).toBeDefined();
  });

  it('does not get another wallet’s events', async () => {
    const bob = await login(userToken(BOB), `?wallet=${ALICE}`);
    service.sendToWallet(ALICE, event('alice_private'));
    await settle();
    expect(bob.messages.map((m) => m.type)).not.toContain('alice_private');
  });

  it('cannot subscribe to activity feeds', async () => {
    const alice = await login(userToken(ALICE));
    alice.send({ type: 'subscribe', payload: { channels: ['admin', 'minting', 'system'] } });
    const error = await alice.waitFor('error');
    expect(error.payload.error).toMatch(/Only admins/);

    ['admin', 'minting', 'system'].forEach((c) => service.sendToChannel(c, event(`${c}_feed`)));
    await settle();
    expect(alice.messages.map((m) => m.type)).not.toEqual(
      expect.arrayContaining(['admin_feed', 'minting_feed', 'system_feed']),
    );
  });

  it('cannot switch to another identity after logging in', async () => {
    const bob = await login(userToken(BOB));
    bob.send({ type: 'auth', payload: { token: adminToken() } });
    const error = await bob.waitFor('error');
    expect(error.payload.error).toMatch(/Already authenticated/);

    bob.send({ type: 'subscribe', payload: { channels: ['admin'] } });
    await settle();
    expect(bob.messages.map((m) => m.type)).not.toContain('subscription_confirmed');
  });
});

describe('an admin', () => {
  it('can subscribe to and receive activity feeds', async () => {
    const admin = await login(adminToken());
    admin.send({ type: 'subscribe', payload: { channels: ['admin', 'minting'] } });
    expect(await admin.waitFor('subscription_confirmed')).toBeDefined();

    service.sendToChannel('minting', event('minting_feed'));
    expect(await admin.waitFor('minting_feed')).toBeDefined();
  });
});
