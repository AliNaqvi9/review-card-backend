require("dotenv").config();
const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");

const db = require("./db");
const { generateId, generateToken, VALID_ID } = require("./lib/id");
const {
  loginPage,
  dashboardPage,
  editPage,
  clientEditPage,
  editLinkNotFoundPage,
} = require("./lib/views");

const app = express();
const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === "production";

if (!process.env.ADMIN_PASSWORD_HASH) {
  console.warn(
    "\n⚠️  ADMIN_PASSWORD_HASH is not set in .env - /admin will reject all logins until you set it.\n" +
      '   Run: npm run hash-password -- "your-chosen-password"\n',
  );
}
if (
  !process.env.SESSION_SECRET ||
  process.env.SESSION_SECRET === "change-me-to-a-long-random-string"
) {
  console.warn(
    "⚠️  SESSION_SECRET is missing or still the placeholder - set a real random value in .env.\n",
  );
}

// Trust Caddy's reverse proxy so req.protocol / secure cookies work correctly.
app.set("trust proxy", 1);

app.use(express.urlencoded({ extended: false }));
app.use(
  session({
    secret: process.env.SESSION_SECRET || "insecure-dev-secret-change-me",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: isProd, // only sent over HTTPS in production
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 12, // 12 hours
    },
  }),
);

//prepared statements
const stmts = {
  getById: db.prepare("SELECT * FROM cards WHERE id = ?"),
  getByToken: db.prepare("SELECT * FROM cards WHERE edit_token = ?"),
  listAll: db.prepare("SELECT * FROM cards ORDER BY created_at DESC"),
  insert: db.prepare(
    "INSERT INTO cards (id, destination_url, client_name, edit_token) VALUES (?, ?, ?, ?)",
  ),
  update: db.prepare(
    "UPDATE cards SET destination_url = ?, client_name = ? WHERE id = ?",
  ),
  updateToken: db.prepare("UPDATE cards SET edit_token = ? WHERE id = ?"),
  remove: db.prepare("DELETE FROM cards WHERE id = ?"),
};

// Batched insert for bulk-generating blank/unclaimed cards - wrapping in
// a transaction means 100 inserts hit disk once instead of 100 times.
const insertManyUnclaimed = db.transaction((rows) => {
  for (const { id, token } of rows) {
    stmts.insert.run(id, null, null, token);
  }
});

function isValidUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) return next();
  return res.redirect("/admin/login");
}

function baseUrlFor(req) {
  return `${req.protocol}://${req.get("host")}`;
}

// ---- public redirect route (this is the one the NFC chip / QR point at) --
app.get("/c/:id", (req, res) => {
  const card = stmts.getById.get(req.params.id);
  if (!card) {
    return res
      .status(404)
      .send(
        '<!DOCTYPE html><meta charset="utf-8"><title>Not found</title><body style="font-family:sans-serif;text-align:center;padding:60px 20px;color:#555">This review link isn\'t active.</body>',
      );
  }
  if (!card.destination_url) {
    // A pre-provisioned card that hasn't been assigned to a client yet -
    // the chip/QR are real and printed, they just don't go anywhere yet.
    return res
      .status(404)
      .send(
        '<!DOCTYPE html><meta charset="utf-8"><title>Not set up yet</title><body style="font-family:sans-serif;text-align:center;padding:60px 20px;color:#555">This card hasn\'t been activated yet.</body>',
      );
  }
  // 302, not 301 - the destination can change later and we never want a
  // browser caching the redirect permanently against the old URL.
  return res.redirect(302, card.destination_url);
});

app.get("/", (req, res) => res.redirect("/admin"));

// ---- client self-serve edit (no login - the token itself is the credential) ----
app.get("/edit/:token", (req, res) => {
  const card = stmts.getByToken.get(req.params.token);
  if (!card) return res.status(404).send(editLinkNotFoundPage());
  res.send(clientEditPage({ card }));
});

app.post("/edit/:token", (req, res) => {
  const card = stmts.getByToken.get(req.params.token);
  if (!card) return res.status(404).send(editLinkNotFoundPage());

  const destinationUrl = (req.body.destination_url || "").trim();
  if (!destinationUrl || !isValidUrl(destinationUrl)) {
    return res
      .status(400)
      .send(clientEditPage({ card, error: "Enter a valid http(s) link." }));
  }

  stmts.update.run(destinationUrl, card.client_name, card.id);
  res.send(
    clientEditPage({
      card: { ...card, destination_url: destinationUrl },
      success: true,
    }),
  );
});

// ---- auth -----------------------------------------------------------------
app.get("/admin/login", (req, res) => {
  if (req.session && req.session.authenticated) return res.redirect("/admin");
  res.send(loginPage({}));
});

app.post("/admin/login", async (req, res) => {
  const { password } = req.body;
  const hash = process.env.ADMIN_PASSWORD_HASH;

  if (!hash) {
    return res
      .status(500)
      .send(
        loginPage({ error: "Server has no admin password configured yet." }),
      );
  }
  if (!password || !(await bcrypt.compare(password, hash))) {
    return res.status(401).send(loginPage({ error: "Wrong password." }));
  }

  req.session.regenerate((err) => {
    if (err)
      return res
        .status(500)
        .send(loginPage({ error: "Login failed, try again." }));
    req.session.authenticated = true;
    res.redirect("/admin");
  });
});

app.post("/admin/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/admin/login"));
});

// ---- admin dashboard --------------------------------------------------
app.get("/admin", requireAuth, (req, res) => {
  const cards = stmts.listAll.all();
  res.send(dashboardPage({ cards, baseUrl: baseUrlFor(req) }));
});

app.post("/admin/cards", requireAuth, (req, res) => {
  const clientName = (req.body.client_name || "").trim();
  const destinationUrl = (req.body.destination_url || "").trim();
  let id = (req.body.id || "").trim();

  if (!destinationUrl || !isValidUrl(destinationUrl)) {
    const cards = stmts.listAll.all();
    return res
      .status(400)
      .send(dashboardPage({ cards, baseUrl: baseUrlFor(req) }));
  }

  if (id) {
    if (!VALID_ID.test(id)) {
      const cards = stmts.listAll.all();
      return res
        .status(400)
        .send(dashboardPage({ cards, baseUrl: baseUrlFor(req) }));
    }
    if (stmts.getById.get(id)) {
      const cards = stmts.listAll.all();
      return res
        .status(409)
        .send(dashboardPage({ cards, baseUrl: baseUrlFor(req) }));
    }
  } else {
    do {
      id = generateId();
    } while (stmts.getById.get(id));
  }

  stmts.insert.run(id, destinationUrl, clientName || null, generateToken());
  res.redirect("/admin");
});

app.post("/admin/cards/bulk", requireAuth, (req, res) => {
  let count = parseInt(req.body.count, 10);
  if (!Number.isFinite(count) || count < 1) count = 1;
  if (count > 200) count = 200; // sane ceiling per batch

  const rows = [];
  const seen = new Set();
  for (let i = 0; i < count; i++) {
    let id;
    do {
      id = generateId();
    } while (stmts.getById.get(id) || seen.has(id));
    seen.add(id);
    rows.push({ id, token: generateToken() });
  }
  insertManyUnclaimed(rows);
  res.redirect("/admin");
});

app.get("/admin/unclaimed.csv", requireAuth, (req, res) => {
  const base = baseUrlFor(req);
  const unclaimed = stmts.listAll.all().filter((c) => !c.destination_url);
  const header = "id,url\n";
  const body = unclaimed.map((c) => `${c.id},${base}/c/${c.id}`).join("\n");
  res.set("Content-Type", "text/csv; charset=utf-8");
  res.set("Content-Disposition", 'attachment; filename="unclaimed-cards.csv"');
  res.send(header + body + (body ? "\n" : ""));
});

app.get("/admin/cards/:id/edit", requireAuth, (req, res) => {
  const card = stmts.getById.get(req.params.id);
  if (!card) return res.redirect("/admin");
  res.send(editPage({ card }));
});

app.post("/admin/cards/:id", requireAuth, (req, res) => {
  const card = stmts.getById.get(req.params.id);
  if (!card) return res.redirect("/admin");
  console.log(req.body);
  const clientName = (req.body.client_name || "").trim();
  const destinationUrl = (req.body.destination_url || "").trim();

  if (!destinationUrl || !isValidUrl(destinationUrl)) {
    return res
      .status(400)
      .send(editPage({ card, error: "Enter a valid http(s) URL." }));
  }

  stmts.update.run(destinationUrl, clientName || null, card.id);
  res.redirect("/admin");
});

app.post("/admin/cards/:id/delete", requireAuth, (req, res) => {
  stmts.remove.run(req.params.id);
  res.redirect("/admin");
});

app.post("/admin/cards/:id/regenerate-token", requireAuth, (req, res) => {
  const card = stmts.getById.get(req.params.id);
  if (!card) return res.redirect("/admin");
  stmts.updateToken.run(generateToken(), card.id);
  res.redirect("/admin");
});

app.listen(PORT, () => {
  console.log(`Review card backend listening on http://localhost:${PORT}`);
});
