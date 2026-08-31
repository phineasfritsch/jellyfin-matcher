/**
 * The walkout: three people swiping, one leaves mid-deck for good.
 *
 * This is the failure the product exists to prevent and used to produce. A
 * member who left stayed in `room.users` with `connected: false`, and both
 * settlement paths counted them -- so no card could reach unanimity and the
 * deck could never exhaust. The room hung forever.
 *
 * Needs a running server and a real Jellyfin, so it cannot live in the unit
 * suite; server/__tests__/settlement.test.ts covers the same rule in isolation.
 *
 *   npm start                # in one terminal
 *   npm run e2e:walkout      # in another
 *
 * Never run two e2e sessions at once: this binds nothing, but the sibling
 * e2e-session can fire a real Jellyseerr request that lands in Radarr.
 */
const { io } = require('socket.io-client');
const U = process.env.MATCHER_URL || 'http://localhost:3000';
const mk = () => io(U, { transports: ['websocket'] });
const ack = (s, ev, p) => new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error(ev + ' timeout')), 25000);
  s.emit(ev, p, (r) => { clearTimeout(t); r && r.ok ? res(r) : rej(new Error(ev + ': ' + (r && r.error))); });
});
const on = (s, ev, pred) => new Promise((res) => {
  const h = (p) => { if (!pred || pred(p)) { s.off(ev, h); res(p); } };
  s.on(ev, h);
});
(async () => {
  const a = mk(), b = mk(), c = mk();
  await Promise.all([on(a, 'connect'), on(b, 'connect'), on(c, 'connect')]);
  const room = await ack(a, 'room:create', { name: 'Ada' });
  await ack(b, 'room:join', { roomId: room.roomId, name: 'Bex' });
  await ack(c, 'room:join', { roomId: room.roomId, name: 'Cy' });
  for (const s of [a, b, c]) await ack(s, 'room:ready', { ready: true });
  await on(a, 'room:state', (r) => r.status === 'KNOCKOUT');
  const gs = await ack(a, 'genres:list', {});
  const g = gs.genres.slice(0, 4);
  for (const s of [a, b, c]) await ack(s, 'knockout:submit_genres', { genres: g });
  let st = await on(a, 'room:state', () => true);
  let guard = 0;
  while (st.status === 'KNOCKOUT' && st.knockout.phase === 'ELIMINATION' && guard++ < 8) {
    for (const s of [a, b, c]) await ack(s, 'knockout:eliminate', { genre: '__abstain__' });
    st = await on(a, 'room:state', () => true);
  }
  st = await on(a, 'room:state', (r) => r.status === 'SWIPING' && r.deck.length > 0);
  console.log('deck', st.deck.length, 'cards');

  // Ada and Bex swipe a few cards. Cy never votes and then leaves for good.
  for (let i = 0; i < 3; i++) {
    await ack(a, 'swipe:vote', { cardId: st.deck[i].id, points: -5 });
    await ack(b, 'swipe:vote', { cardId: st.deck[i].id, points: -5 });
  }
  console.log('Cy walks out at card 0');
  const declared = on(a, 'match:declared', () => true);
  c.close();

  // Ada and Bex both say yes to the next card. Nothing else should be needed.
  const card = st.deck[3];
  await ack(a, 'swipe:vote', { cardId: card.id, points: 2 });
  await ack(b, 'swipe:vote', { cardId: card.id, points: 2 });

  const winner = await Promise.race([
    declared,
    new Promise((_, rej) => setTimeout(() => rej(new Error('STALEMATE: room never settled')), 15000)),
  ]);
  console.log('PASS room settled on:', winner.winner ? winner.winner.title : '(no winner)', '| viaFallback', winner.viaFallback);
  a.close(); b.close();
  process.exit(0);
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
