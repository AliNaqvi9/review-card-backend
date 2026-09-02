function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function page(title, bodyHtml, { flash } = {}) {
  const flashHtml = flash
    ? `<div class="flash flash-${flash.type}">${escapeHtml(flash.message)}</div>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow">
<title>${escapeHtml(title)}</title>
<style>
  :root {
    --ink: #1c1917;
    --ink-soft: #57534e;
    --line: #e7e5e4;
    --bg: #fafaf9;
    --surface: #ffffff;
    --accent: #2563eb;
    --accent-ink: #ffffff;
    --danger: #b91c1c;
    --danger-bg: #fef2f2;
    --ok-bg: #f0fdf4;
    --ok-ink: #15803d;
    --radius: 8px;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    background: var(--bg);
    color: var(--ink);
    line-height: 1.5;
  }
  .wrap { max-width: 760px; margin: 0 auto; padding: 32px 20px 80px; }
  header.top { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 28px; }
  header.top h1 { font-size: 19px; font-weight: 600; margin: 0; letter-spacing: -0.01em; }
  header.top form { margin: 0; }
  a.logout, button.link {
    background: none; border: none; color: var(--ink-soft); font-size: 13px;
    cursor: pointer; text-decoration: underline; padding: 0; font-family: inherit;
  }
  .card {
    background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius);
    padding: 20px; margin-bottom: 16px;
  }
  .card h2 { font-size: 14px; font-weight: 600; margin: 0 0 14px; color: var(--ink-soft); text-transform: uppercase; letter-spacing: 0.04em; }
  label { display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px; color: var(--ink); }
  input[type=text], input[type=url], input[type=password] {
    width: 100%; padding: 9px 11px; border: 1px solid var(--line); border-radius: 6px;
    font-size: 14px; margin-bottom: 14px; font-family: inherit; background: var(--bg);
  }
  input:focus { outline: 2px solid var(--accent); outline-offset: 1px; border-color: var(--accent); }
  .field-hint { font-size: 12px; color: var(--ink-soft); margin: -10px 0 14px; }
  button.primary {
    background: var(--accent); color: var(--accent-ink); border: none; border-radius: 6px;
    padding: 9px 16px; font-size: 14px; font-weight: 600; cursor: pointer; font-family: inherit;
  }
  button.primary:hover { opacity: 0.92; }
  .row { display: flex; gap: 10px; align-items: flex-end; flex-wrap: wrap; }
  .row > div { flex: 1; min-width: 160px; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--ink-soft); padding: 8px 6px; border-bottom: 1px solid var(--line); }
  td { padding: 10px 6px; border-bottom: 1px solid var(--line); font-size: 14px; vertical-align: top; }
  td.id { font-family: ui-monospace, Menlo, monospace; font-size: 13px; color: var(--ink-soft); }
  td.url { max-width: 260px; overflow-wrap: anywhere; }
  .edit-link { margin-top: 6px; font-size: 12px; color: var(--ink-soft); display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .edit-link form { display: inline; }
  .edit-link button.link { font-size: 12px; }
  td.actions { white-space: nowrap; text-align: right; }
  td.actions form { display: inline; }
  td.actions button { margin-left: 8px; }
  .empty { color: var(--ink-soft); font-size: 14px; padding: 10px 0; }
  .flash { padding: 10px 14px; border-radius: 6px; font-size: 14px; margin-bottom: 18px; }
  .flash-ok { background: var(--ok-bg); color: var(--ok-ink); }
  .flash-error { background: var(--danger-bg); color: var(--danger); }
  .login-wrap { max-width: 340px; margin: 90px auto; }
  .login-wrap .card { padding: 28px; }
  .login-wrap h1 { font-size: 18px; margin: 0 0 20px; }
</style>
</head>
<body>
<div class="wrap">
${flashHtml}
${bodyHtml}
</div>
</body>
</html>`;
}

module.exports = { escapeHtml, page };
