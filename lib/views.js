const { escapeHtml, page } = require("./html");

function loginPage({ error } = {}) {
  const errorHtml = error
    ? `<div class="flash flash-error">${escapeHtml(error)}</div>`
    : "";
  const body = `
    <div class="login-wrap">
      <div class="card">
        <h1>Review card admin</h1>
        ${errorHtml}
        <form method="POST" action="/admin/login">
          <label for="password">Password</label>
          <input type="password" id="password" name="password" autofocus required>
          <button class="primary" type="submit">Sign in</button>
        </form>
      </div>
    </div>`;
  return page("Sign in - Review cards", body);
}

function dashboardPage({ cards, baseUrl }) {
  const claimed = cards.filter((c) => c.destination_url);
  const unclaimed = cards.filter((c) => !c.destination_url);

  const rows = claimed.length
    ? claimed
        .map((c) => {
          const editUrl = `${baseUrl}/edit/${c.edit_token}`;
          return `
        <tr>
          <td class="id">${escapeHtml(c.id)}</td>
          <td>${escapeHtml(c.client_name || "-")}</td>
          <td class="url">
            <a href="${escapeHtml(c.destination_url)}" target="_blank" rel="noopener">${escapeHtml(c.destination_url)}</a>
            <div class="edit-link">
              <span>Self-serve link:</span>
              <button type="button" class="link copy-btn" data-link="${escapeHtml(editUrl)}">Copy</button>
              <form method="POST" action="/admin/cards/${encodeURIComponent(c.id)}/regenerate-token"
                    onsubmit="return confirm('Regenerate this client\\'s edit link? Their old link will stop working immediately.');">
                <button class="link" type="submit">Regenerate</button>
              </form>
            </div>
          </td>
          <td class="actions">
            <a href="/admin/cards/${encodeURIComponent(c.id)}/edit">Edit</a>
            <form method="POST" action="/admin/cards/${encodeURIComponent(c.id)}/delete"
                  onsubmit="return confirm('Delete card ${escapeHtml(c.id)}? The physical card will stop working.');">
              <button class="link" type="submit">Delete</button>
            </form>
          </td>
        </tr>`;
        })
        .join("")
    : `<tr><td colspan="4" class="empty">No active cards yet - add one above, or assign one of your unclaimed cards below.</td></tr>`;

  const unclaimedRows = unclaimed.length
    ? unclaimed
        .map((c) => {
          const publicUrl = `${baseUrl}/c/${c.id}`;
          return `
        <tr>
          <td class="id">${escapeHtml(c.id)}</td>
          <td class="url"><a href="${escapeHtml(publicUrl)}" target="_blank" rel="noopener">${escapeHtml(publicUrl)}</a></td>
          <td class="actions">
            <a href="/admin/cards/${encodeURIComponent(c.id)}/edit">Assign</a>
            <form method="POST" action="/admin/cards/${encodeURIComponent(c.id)}/delete"
                  onsubmit="return confirm('Delete unclaimed card ${escapeHtml(c.id)}? Its printed NFC/QR will stop working.');">
              <button class="link" type="submit">Delete</button>
            </form>
          </td>
        </tr>`;
        })
        .join("")
    : `<tr><td colspan="3" class="empty">None right now - generate a batch below to get ahead of provisioning.</td></tr>`;

  const body = `
    <header class="top">
      <h1>Review cards</h1>
      <form method="POST" action="/admin/logout"><button class="link" type="submit">Sign out</button></form>
    </header>

    <div class="card">
      <h2>Add a card</h2>
      <form method="POST" action="/admin/cards">
        <div class="row">
          <div>
            <label for="client_name">Client name</label>
            <input type="text" id="client_name" name="client_name" placeholder="e.g. Fig & Olive Bistro" required>
          </div>
          <div>
            <label for="id">Card ID (optional)</label>
            <input type="text" id="id" name="id" placeholder="auto-generated if blank">
          </div>
        </div>
        <label for="destination_url">Google review link (Place ID direct-review link)</label>
        <input type="url" id="destination_url" name="destination_url" placeholder="https://search.google.com/local/writereview?placeid=..." required>
        <div class="field-hint">This is the URL the card will redirect to. You can change it later without touching the physical card.</div>
        <button class="primary" type="submit">Create card</button>
      </form>
    </div>

    <div class="card">
      <h2>Bulk-generate blank cards</h2>
      <p style="font-size:13px;color:var(--ink-soft);margin:0 0 14px;">
        Creates cards with an ID and self-serve link but no destination yet -
        for writing NFC/QR and printing ahead of time, then assigning a
        client to each one later.
      </p>
      <form method="POST" action="/admin/cards/bulk">
        <div class="row">
          <div>
            <label for="count">How many?</label>
            <input type="number" id="count" name="count" min="1" max="200" value="10" required>
          </div>
        </div>
        <button class="primary" type="submit">Generate</button>
      </form>
    </div>

    <div class="card">
      <h2>Unclaimed cards (${unclaimed.length})</h2>
      ${unclaimed.length ? `<p style="font-size:13px;color:var(--ink-soft);margin:0 0 12px;"><a href="/admin/unclaimed.csv">Download CSV</a> of IDs + URLs - feed this into your QR batch generator and keep it as your print run's paper trail.</p>` : ""}
      <table>
        <thead><tr><th>ID</th><th>Public URL</th><th></th></tr></thead>
        <tbody>${unclaimedRows}</tbody>
      </table>
    </div>

    <div class="card">
      <h2>Active cards (${claimed.length})</h2>
      <table>
        <thead><tr><th>ID</th><th>Client</th><th>Destination</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>

    <div class="card">
      <h2>Provisioning reminder</h2>
      <p style="font-size:14px; color:var(--ink-soft); margin:0;">
        Whether a card comes from "Add a card" or a bulk batch, write
        <strong>${escapeHtml(baseUrl)}/c/[id]</strong> to its NFC chip with NFC Tools
        and generate a matching QR code before it ships. Once a client is
        assigned, send them their private self-serve link so they can update
        their own destination without contacting you.
      </p>
    </div>
    <script>
      document.addEventListener('click', function (e) {
        if (!e.target.classList.contains('copy-btn')) return;
        var text = e.target.getAttribute('data-link');
        navigator.clipboard.writeText(text).then(function () {
          var original = e.target.textContent;
          e.target.textContent = 'Copied!';
          setTimeout(function () { e.target.textContent = original; }, 1500);
        });
      });
    </script>`;
  return page("Review cards - Admin", body);
}

function editPage({ card, error }) {
  const isAssign = !card.destination_url;
  const errorHtml = error
    ? `<div class="flash flash-error">${escapeHtml(error)}</div>`
    : "";
  const assignHintHtml = isAssign
    ? `<p style="font-size:13px;color:var(--ink-soft);margin:0 0 14px;">This card's NFC/QR are already printed and point at <strong>${escapeHtml(card.id)}</strong> - give it a client and destination to activate it.</p>`
    : "";
  const body = `
    <header class="top">
      <h1>${isAssign ? "Assign card" : "Edit card"}</h1>
      <a class="logout" href="/admin">&larr; Back</a>
    </header>
    ${errorHtml}
    <div class="card">
      ${assignHintHtml}
      <form method="POST" action="/admin/cards/${encodeURIComponent(card.id)}">
        <label>Card ID</label>
        <input type="text" value="${escapeHtml(card.id)}" disabled>
        <div class="field-hint">The ID is permanent - it's what's physically written to the chip and QR code.</div>

        <label for="client_name">Client name</label>
        <input type="text" id="client_name" name="client_name" value="${escapeHtml(card.client_name || "")}" required>

        <label for="destination_url">Destination URL</label>
        <input type="url" id="destination_url" name="destination_url" value="${escapeHtml(card.destination_url || "")}" placeholder="https://search.google.com/local/writereview?placeid=..." required>

        <button class="primary" type="submit">${isAssign ? "Activate card" : "Save changes"}</button>
      </form>
    </div>`;
  return page(
    `${isAssign ? "Assign" : "Edit"} ${card.id} - Review cards`,
    body,
  );
}

function clientEditPage({ card, error, success }) {
  const messageHtml = success
    ? `<div class="flash flash-ok">Saved - your card now sends people to the new link.</div>`
    : error
      ? `<div class="flash flash-error">${escapeHtml(error)}</div>`
      : "";
  const body = `
    <div class="login-wrap">
      <div class="card">
        <h1>${escapeHtml(card.client_name || "Update your review link")}</h1>
        ${messageHtml}
        <form method="POST" action="/edit/${encodeURIComponent(card.edit_token)}">
          <label for="destination_url">Where should your card send people?</label>
          <input type="url" id="destination_url" name="destination_url" value="${escapeHtml(card.destination_url)}" required>
          <div class="field-hint">This is your Google review link. Saving here updates instantly - you never need to reprint or retap the physical card.</div>
          <button class="primary" type="submit">Save</button>
        </form>
      </div>
    </div>`;
  return page(`Update your review link`, body);
}

function editLinkNotFoundPage() {
  const body = `
    <div class="login-wrap">
      <div class="card">
        <h1>Link not found</h1>
        <p style="font-size:14px;color:var(--ink-soft);margin:0;">
          This edit link isn't valid anymore. If that seems wrong, contact whoever set up your review card.
        </p>
      </div>
    </div>`;
  return page("Link not found", body);
}

module.exports = {
  loginPage,
  dashboardPage,
  editPage,
  clientEditPage,
  editLinkNotFoundPage,
};
