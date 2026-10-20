# Steam Slop Filter

A browser extension for Chrome and Firefox (Manifest V3). You vote on AI-slop games on
the Steam store, and it dims or hides flagged games on Next Fest, search, sale and front
pages.

A game is flagged when either of these is true:
- you voted it slop, or
- the community did: at least 3 slop votes making up at least 60% of all votes (both
  adjustable).

You can also turn on "treat any Steam AI disclosure as slop".

## How it works

- **Extension** (`extension/`): adds a 🤖/👍 badge to every game capsule. When a capsule
  scrolls into view, the extension asks the API about it, up to 10 games per request.
  Games whose developer filed an AI disclosure on Steam get an `AI` tag; hover it to read
  what the developer wrote.
- **API** (`server/`): a Cloudflare Worker with a D1 database. It stores votes. The first
  time anyone asks about a game, the Worker reads that game's Steam page, saves the AI
  disclosure for 7 days, and every user then gets the saved copy.

| Method | Path | Body / query | Response |
| --- | --- | --- | --- |
| GET | `/games` | `?appids=1,2,3` (max 10) | `{ games: { "1": { slop, legit, ai, aiText } } }` |
| POST | `/vote` | `{ appid, vote: 1 \| -1 \| 0, voter: <uuid> }` | `{ score: { slop, legit } }` |

`ai` is `null` when Steam's page couldn't be read, for example because of a rate limit or
a region lock. Each voter can vote once per game. Voter IDs are anonymous and easy to
create, so the API accepts at most 3 voters per IP address per game.

## Deploy the API

```sh
cd server
npm install
npx wrangler login
npx wrangler d1 create steam-slop-votes      # paste the database_id into wrangler.toml
npx wrangler d1 execute steam-slop-votes --remote --file=schema.sql
npx wrangler secret put IP_SALT              # any long random string
npx wrangler deploy
```

Put the printed `https://steam-slop-votes.<you>.workers.dev` URL into the extension's
options. To run it locally:

```sh
npx wrangler d1 execute steam-slop-votes --local --file=schema.sql
npx wrangler dev                             # http://localhost:8787
```

## Load the extension

- **Chrome:** go to `chrome://extensions`, turn on Developer mode, click *Load unpacked*,
  and pick `extension/`.
- **Firefox:** go to `about:debugging#/runtime/this-firefox`, click *Load Temporary
  Add-on*, and pick `extension/manifest.json`. Then allow access to
  store.steampowered.com in the add-on's permissions.

## Tests

```sh
node --test test/test.mjs
```
