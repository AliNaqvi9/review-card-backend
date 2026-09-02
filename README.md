# Review card redirect backend

Node/Express backend for the NFC/QR Google review card system. Implements
the playbook's Section 2 (backend), Section 4 (provisioning), and - since
you're past "SSH in every time" - the password-protected `/admin` panel
from Section 5, done now instead of deferred.

## What's here

```
app.js                      main app: public redirect + self-serve + admin routes
db.js                       opens SQLite, creates/migrates the `cards` table
lib/id.js                   short ID + long self-serve token generators
lib/html.js                 tiny HTML-escaping + page-shell helpers
lib/views.js                login / dashboard / edit / client-edit templates
generate-password-hash.js   CLI to turn a password into a bcrypt hash
deploy/Caddyfile            reverse proxy + auto-HTTPS config
deploy/review-cards.service systemd unit so it survives reboots/crashes
.env.example                config template - copy to .env
```

One table, `cards (id, destination_url, client_name, edit_token,
created_at)`. `destination_url` is nullable - a card can be created
"unclaimed" (id + self-serve token exist, no destination yet) for bulk
pre-provisioning, see Section 3. `GET /c/:id` looks up the row and
302-redirects once it has a destination.

## 1. Local setup

```bash
npm install
cp .env.example .env
```

Fill in `.env`:

```bash
# random session-signing secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# paste the output as SESSION_SECRET=

# hash your chosen admin password
npm run hash-password -- "your-chosen-password"
# paste the printed line in as ADMIN_PASSWORD_HASH=
```

For local testing set `NODE_ENV=development` (secure cookies require HTTPS,
which you won't have on localhost). Set it to `production` on the real server.

Run it:

```bash
npm start
```

Visit `http://localhost:3000/admin`, log in, add a test card, then hit
`http://localhost:3000/c/<the-id>` and confirm it redirects.

## 2. Using the admin panel

- **Add a card**: client name + destination URL (their direct-to-review
  link from the Place ID). Leave the Card ID field blank to auto-generate
  a short random one, or type your own if you want something memorable.
- **Edit a card**: changes `destination_url` only - the ID never changes,
  so the physical chip/QR you already printed keeps working.
- **Delete a card**: the physical card immediately starts 404ing. Only
  do this for cards you're retiring, not ones you meant to just edit.

## 3. Pre-provisioning cards ahead of demand

Use this when you want to write and print a batch of cards _before_ you
know which client each one goes to - buy blank cards in bulk, write and
print them in one session, then assign clients as they sign up.

1. In `/admin`, use **Bulk-generate blank cards** - enter a quantity
   (up to 200 per batch) and submit. Each one gets an `id` and a
   self-serve `edit_token`, but no destination yet - they show up under
   **Unclaimed cards**.
2. Click **Download CSV** on the Unclaimed cards section. It's `id,url`
   rows (`yourdomain.com/c/[id]` for each), ready to feed into your NFC
   writing session and a batch QR generator, and worth keeping as your
   print run's paper trail.
3. Write each ID to NFC with NFC Tools, generate its QR, print, test tap
   - scan - same as the normal provisioning workflow, just done ahead of
     time and in bulk instead of per-client.
4. **Tapping an unclaimed card before it's assigned** shows a plain "not
   activated yet" page instead of erroring - safe if a card ships or gets
   tested before you've assigned it.
5. When a client is ready, click **Assign** next to their card in the
   Unclaimed cards table, give it a name and their Google review link.
   It moves into **Active cards** and starts redirecting immediately -
   the physical card you already made never needs to be touched again.

## 4. Self-serve editing for clients (no login)

Every card now has a second, longer secret - `edit_token` - separate from
its public `id`. In the admin dashboard, each row shows a "Self-serve
link" with **Copy** and **Regenerate** buttons. Copy it and send it to
the client (email/text); they can visit it anytime to change where their
own card points - no account, no password.

- The link itself is the credential, so the token is a 256-bit random
  string - not brute-forceable, and never guessable from the public `id`.
- If a link ever leaks somewhere you don't want it, hit **Regenerate** -
  the old link dies immediately and you send the client the new one.
- The self-serve page only lets them change `destination_url`. It can't
  delete the card or touch the ID that's physically on the chip/QR.
- If you're upgrading an existing deployment, the app adds the
  `edit_token` column and backfills a token for every existing card
  automatically the first time it starts - no manual migration step.

## 5. Deploying to your Oracle Cloud instance

```bash
# on the server
git clone <your-repo> review-card-backend   # or scp the folder up
cd review-card-backend
npm install --omit=dev
cp .env.example .env
# fill in .env exactly as in step 1, with NODE_ENV=production
```

**Run it as a service** (survives reboots/crashes):

```bash
sudo cp deploy/review-cards.service /etc/systemd/system/
# edit the User= and path lines in that file to match your setup first
sudo systemctl daemon-reload
sudo systemctl enable --now review-cards
sudo systemctl status review-cards
```

**Put Caddy in front of it** for automatic HTTPS:

```bash
sudo apt install caddy
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile
# edit the domain in that file first
sudo systemctl enable --now caddy
```

**DNS**: point your domain (or `go.yourdomain.com`) at the instance's
public IP, A record. Caddy handles the SSL cert automatically once DNS
resolves and ports 80/443 are reachable.

**Oracle Cloud specifics**: open ports 80 and 443 in both the instance's
Security List/NSG _and_ the OS firewall (`iptables`/`ufw`) - Oracle's
default images block them at the OS level even after you open the cloud
console rule.

## 6. Card provisioning (per client, matches playbook Section 4)

1. Get the client's Place ID, build their direct-review link.
2. Add the card in `/admin` - copy the generated ID.
3. Write `yourdomain.com/c/[id]` to a blank NTAG215 with NFC Tools.
4. Generate a QR code for the same URL.
5. Send to print.
6. Test tap (Android + iPhone) and QR scan before it ships.

## 7. Not built yet: full new-customer self-signup

This version covers _existing_ clients editing their own link. Letting a
_brand-new_ customer sign up, pay, and get a card with zero manual work
from you is a separate, bigger build:

- A public order page (business name, a Place ID lookup/search since most
  owners don't know their own Place ID, payment via something like Stripe
  Checkout).
- An "unclaimed inventory" model instead of provisioning per order: you
  pre-write and pre-print a batch of cards ahead of time with no
  destination set yet, insert them as unclaimed rows, and physically
  stock them. Signup claims the next unclaimed row, sets its
  `destination_url`, and tells you which physical card to pull and ship.
- This avoids writing an NFC chip per order in real time, which isn't
  practical for a self-serve checkout flow.

Worth building once you have enough demand to justify pre-stocking
inventory and adding payment processing.

## 8. Things worth knowing

- **Sessions are in-memory.** Restarting the Node process logs you out of
  `/admin` (fine - just log back in) but never touches the `cards` table.
  If you outgrow this, swap `express-session`'s default store for
  `connect-sqlite3`.
- **Back up `data/cards.db` occasionally** (it's the only state that
  matters - everything else is redeployable code). A cron'd `cp` to
  another disk or a nightly download is plenty at this scale.
- **Rate limiting the login route** isn't built in. If you want it, the
  cheapest option is a rate-limit directive at the Caddy level rather
  than in-app.
- `destination_url` is checked for a valid `http(s)://` shape before
  saving, but not for a livable Google review link. If that ever bites,
  it'll be at card-creation time when the dashboard rejects a fat-fingered
  string.
