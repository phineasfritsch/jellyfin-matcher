/**
 * R182: the experiment docs/TRUST.md says must happen before U3 is designed.
 *
 * The hypothesis, in one sentence: this app reads the library with a SERVER API
 * KEY, so it sees everything, and a room containing a child would be shown
 * titles that child's own Jellyfin account is not allowed to see. If that is
 * true it is the most serious thing in the trust model, because the app is not
 * merely over-privileged — it is actively defeating a control the household
 * already set.
 *
 * TRUST.md is clear that this must be CONFIRMED on a real server before
 * anything is designed around it, and equally clear that the confirmation is
 * the first step. It said the step was filed in QUEUE.md. It was not, and a
 * confirmation nobody can run is indistinguishable from one nobody did (R182).
 *
 * So this is the experiment, made runnable. It takes about a minute and it
 * answers exactly one question.
 *
 *   JELLYFIN_URL=... JELLYFIN_API_KEY=... \
 *   PROBE_USER=kid PROBE_PASS=... npx tsx scripts/probe-user-scope.ts
 *
 * READS ONLY YOUR LIBRARY, which is not the same as writing nothing.
 *
 * An earlier version of this header said "it writes nothing". That was wrong,
 * and wrong in the direction that matters when somebody runs a script against
 * their own server: `POST /Users/AuthenticateByName` is state-changing. It
 * mints an access token, and Jellyfin records a SESSION and a DEVICE against
 * that account which persist and are visible in Dashboard → Devices.
 *
 * So: it creates no user, changes no setting, and reads nothing but two counts.
 * It does leave a device entry, named below so you can find and delete it. Set
 * the parental limit by hand in Jellyfin first — a script that configures the
 * thing it is testing proves less than one that does not.
 *
 * WHAT A RESULT MEANS
 *
 *   fewer for the user   the hypothesis holds. The admin key sees titles the
 *                        household restricted, and every room built with it
 *                        shows them to whoever is in the room.
 *   the same             it does not hold on THIS server, with THIS user, and
 *                        the trust argument has to rest on over-privilege
 *                        alone, which is weaker and still real.
 *   an error             nothing is learned. Say so rather than reading a
 *                        failure as a pass.
 */
const BASE = (process.env.JELLYFIN_URL ?? '').replace(/\/+$/, '');
const KEY = process.env.JELLYFIN_API_KEY ?? '';
const USER = process.env.PROBE_USER ?? '';
const PASS = process.env.PROBE_PASS ?? '';

/*
  Named so the session this creates is obvious in Dashboard → Devices, and so
  deleting it afterwards is a decision somebody can actually make. A probe that
  leaves an anonymous device behind leaves a mystery behind.
*/
const CLIENT =
  'MediaBrowser Client="Matcher parental-control probe", Device="probe", ' +
  'DeviceId="matcher-probe-delete-me", Version="1"';

function need(name: string, value: string) {
  if (!value) {
    console.error(`Set ${name}. See the header of this file for the whole command.`);
    process.exit(2);
  }
}

/** Movies only, and the same filters the deck build uses, so this compares like with like. */
const QUERY =
  'IncludeItemTypes=Movie&Recursive=true&Limit=0&EnableTotalRecordCount=true';

async function count(url: string, headers: Record<string, string>): Promise<number> {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`${url.replace(BASE, '')} -> ${res.status} ${res.statusText}`);
  const body = (await res.json()) as { TotalRecordCount?: number };
  if (typeof body.TotalRecordCount !== 'number') {
    throw new Error('no TotalRecordCount in the response; is this a Jellyfin server?');
  }
  return body.TotalRecordCount;
}

async function main() {
  need('JELLYFIN_URL', BASE);
  need('JELLYFIN_API_KEY', KEY);
  need('PROBE_USER', USER);
  need('PROBE_PASS', PASS);

  console.log(`\nServer: ${BASE}`);

  const asServer = await count(`${BASE}/Items?${QUERY}`, { 'X-Emby-Token': KEY });
  console.log(`  as the server key:      ${asServer} movies`);

  const auth = await fetch(`${BASE}/Users/AuthenticateByName`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: CLIENT },
    body: JSON.stringify({ Username: USER, Pw: PASS }),
  });
  if (!auth.ok) throw new Error(`login for ${USER} failed: ${auth.status}`);
  const session = (await auth.json()) as { User?: { Id?: string }; AccessToken?: string };
  if (!session.User?.Id || !session.AccessToken) {
    throw new Error('login returned no user id or no AccessToken');
  }

  /*
    The token exists. server/auth.ts asks this same endpoint and reads only
    `User`, so the credential U3 needs is already in a response this app
    already receives -- which is worth knowing separately from the count below.
  */
  console.log(`  (AccessToken returned:  yes, ${session.AccessToken.length} chars)`);

  const asUser = await count(`${BASE}/Users/${session.User.Id}/Items?${QUERY}`, {
    'X-Emby-Token': session.AccessToken,
  });
  console.log(`  as ${USER}:${' '.repeat(Math.max(1, 22 - USER.length))}${asUser} movies\n`);

  /*
    Nothing to compare is not a refutation.

    Two zeros satisfy `asUser === asServer` and printed NOT CONFIRMED, which
    reads as evidence against the most serious claim in docs/TRUST.md. A server
    key that sees no movies means the key is wrong, the URL is wrong, or the
    library is empty — none of which say anything about parental controls.
  */
  if (asServer === 0) {
    console.log(
      'NOTHING WAS LEARNED. The server key sees zero movies, so there is no\n' +
        'comparison to make. Check JELLYFIN_URL and JELLYFIN_API_KEY against a\n' +
        'library that actually has films in it, then run this again.',
    );
    process.exit(2);
  }

  if (asUser < asServer) {
    console.log(
      `CONFIRMED: the server key sees ${asServer - asUser} title(s) ${USER} cannot.\n` +
        'A room built with the admin key shows this household titles it restricted.\n' +
        'docs/TRUST.md is describing something real; U3 can be designed against it.',
    );
  } else if (asUser === asServer) {
    console.log(
      `NOT CONFIRMED on this server, with this user. Both see ${asServer} movies, so\n` +
        'either no restriction applies to this account or Jellyfin does not filter\n' +
        'this query. Re-run against a user who genuinely cannot see something before\n' +
        'concluding anything — and note the two counts come from DIFFERENT endpoints\n' +
        '(/Items as the server, /Users/{id}/Items as the user), so an equal result is\n' +
        'weaker evidence than an unequal one.',
    );
  } else {
    console.log(
      `The user sees MORE than the server key (${asUser} > ${asServer}), which means the two\n` +
        'queries are not comparable. Do not read this as either answer.',
    );
  }
}

main().catch((err) => {
  console.error(`\nThe probe failed, so nothing was learned: ${err.message}`);
  process.exit(1);
});
