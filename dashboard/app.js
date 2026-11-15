// Token Radar's dashboard. It reads window.RADAR (written beside dashboard/ by
// main.ts) and renders the board, a detail view per protocol, the live-token
// comparables and the method. No network: every byte it shows is in data.js.
// State lives in the location hash, so each view has a stable address:
//   #board                         the ranked board
//   #detail=<slug>                 one protocol: model breakdown + farm plan
//   #filtered&category=<name>      the board filtered to one category
//   #live                          protocols whose token already trades
//   #method                        how the model works, and its limits

(function () {
  'use strict';
  var DATA = window.RADAR;
  if (!DATA) { document.getElementById('app').textContent = 'No radar data loaded.'; return; }
  var rows = DATA.rows;
  var live = DATA.live;

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function money(n) {
    if (n == null) return '—';
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K';
    return '$' + n;
  }
  function pct(n) {
    if (n == null) return '—';
    var cls = n > 0 ? 'up' : n < 0 ? 'down' : '';
    return '<span class="' + cls + '">' + (n > 0 ? '+' : '') + n.toFixed(1) + '%</span>';
  }
  function ageFmt(days) {
    if (days == null) return '—';
    if (days < 30) return days + 'd';
    if (days < 365) return Math.round(days / 30) + 'mo';
    return (days / 365).toFixed(1) + 'y';
  }
  function parseHash() {
    var h = window.location.hash.replace(/^#/, '');
    var p = new URLSearchParams(h);
    return {
      view: p.get('view') || (p.get('detail') ? 'detail' : p.get('category') ? 'filtered' : 'board'),
      detail: p.get('detail') || '',
      category: p.get('category') || '',
      chain: p.get('chain') || '',
      q: p.get('q') || '',
      wl: p.get('wl') === '1',
      sort: p.get('sort') || 'implied',
    };
  }
  function setHash(patch) {
    var s = parseHash();
    for (var k in patch) s[k] = patch[k];
    var p = new URLSearchParams();
    if (s.view && s.view !== 'board') p.set('view', s.view);
    if (s.detail) p.set('detail', s.detail);
    if (s.category) p.set('category', s.category);
    if (s.chain) p.set('chain', s.chain);
    if (s.q) p.set('q', s.q);
    if (s.wl) p.set('wl', '1');
    if (s.sort && s.sort !== 'implied') p.set('sort', s.sort);
    var h = p.toString();
    window.history.replaceState(null, '', h ? '#' + h : window.location.pathname + window.location.search);
    render();
  }
  function filtered() {
    var s = parseHash();
    var list = rows.filter(function (r) {
      if (s.wl && !r.watchlist) return false;
      if (s.category && (r.category || 'Uncategorized') !== s.category) return false;
      if (s.chain && r.chains.indexOf(s.chain) < 0) return false;
      if (s.q) {
        var q = s.q.toLowerCase();
        if (r.name.toLowerCase().indexOf(q) < 0 && r.slug.toLowerCase().indexOf(q) < 0) return false;
      }
      return true;
    });
    var key = s.sort;
    list.sort(function (a, b) {
      if (key === 'tvl') return b.tvl_usd - a.tvl_usd;
      if (key === 'growth') return (b.change_7d || 0) - (a.change_7d || 0);
      if (key === 'age') return (b.age_days || 0) - (a.age_days || 0);
      if (key === 'name') return a.name.localeCompare(b.name);
      return b.implied_value_usd - a.implied_value_usd;
    });
    return { state: s, list: list };
  }
  function options(list, current, allLabel) {
    var html = '<option value="">' + esc(allLabel) + '</option>';
    list.forEach(function (v) { html += '<option value="' + esc(v) + '"' + (v === current ? ' selected' : '') + '>' + esc(v) + '</option>'; });
    return html;
  }
  function rowHtml(r) {
    return '<tr data-slug="' + esc(r.slug) + '">' +
      '<td class="rank">' + r.rank + '</td>' +
      '<td><b>' + esc(r.name) + '</b>' + (r.watchlist ? '<span class="badge">WATCHLIST</span>' : '') + '<br><span style="color:var(--muted);font-size:12px">' + esc(r.slug) + '</span></td>' +
      '<td>' + esc(r.category || '—') + '</td>' +
      '<td>' + esc(r.chains.slice(0, 3).join(', ')) + (r.chains.length > 3 ? ' +' + (r.chains.length - 3) : '') + '</td>' +
      '<td class="num">' + money(r.tvl_usd) + '</td>' +
      '<td class="num">' + pct(r.change_7d) + '</td>' +
      '<td class="num">' + ageFmt(r.age_days) + '</td>' +
      '<td class="num"><b>' + money(r.implied_value_usd) + '</b></td>' +
      '</tr>';
  }
  function detailHtml(r) {
    var base = r.tvl_usd * r.category_multiple;
    var steps = r.farm_steps.map(function (s, i) {
      var parts = s.split(' Cost: ');
      return '<li><b>Step ' + (i + 1) + '.</b> ' + esc(parts[0]) + (parts[1] ? '<br><span style="color:var(--muted)">Cost and time: ' + esc(parts[1]) + '</span>' : '') + '</li>';
    }).join('');
    return '<section class="detail"><h2>#' + r.rank + ' ' + esc(r.name) + ' <span>' + money(r.implied_value_usd) + ' implied</span></h2>' +
      '<p class="meta">' + esc(r.slug) + ' · ' + esc(r.category || 'Uncategorized') + ' · ' + esc(r.chains.join(', ')) + ' · TVL ' + money(r.tvl_usd) + ' · 7d ' + pct(r.change_7d) + ' · tracked since ' + esc(r.listed_at || 'unknown') + (r.watchlist ? ' · on the watchlist' : '') + '</p>' +
      '<h3>How the value is built</h3><div class="modelgrid">' +
      '<div><b>' + money(r.tvl_usd) + '</b><span>TVL in the snapshot</span></div>' +
      '<div><b>× ' + r.category_multiple.toFixed(2) + '</b><span>' + esc(r.category || 'Uncategorized') + ' multiple, median mcap/TVL of ' + r.category_comps + ' trading comp' + (r.category_comps === 1 ? '' : 's') + '</span></div>' +
      '<div><b>× ' + r.growth_multiplier.toFixed(2) + '</b><span>growth, 7d ' + pct(r.change_7d) + '</span></div>' +
      '<div><b>× ' + r.maturity_multiplier.toFixed(2) + '</b><span>maturity, ' + ageFmt(r.age_days) + ' tracked</span></div>' +
      '<div><b>× ' + r.breadth_multiplier.toFixed(2) + '</b><span>breadth, ' + r.chains.length + ' chain' + (r.chains.length === 1 ? '' : 's') + '</span></div>' +
      '<div><b>= ' + money(r.implied_value_usd) + '</b><span>implied launch value (model estimate)</span></div>' +
      '</div>' +
      '<p class="note"><b>Base value:</b> TVL × multiple = ' + money(Math.round(base)) + '. The multiple is the category median from this snapshot, not a guess about this protocol.</p>' +
      '<h3>Farm plan: what to do about it</h3><ol class="steps">' + steps + '</ol>' +
      '<p class="note"><b>Honest read:</b> this protocol <b>records no token</b> in the snapshot — that is not proof it has none, and it is not a promise that a token ever launches. The implied value is a model estimate from TVL, growth, age and breadth, not a price target. Costs above are estimates: check the chain gas tracker before you pay anything.</p>' +
      '</section>';
  }
  function render() {
    var s = parseHash();
    var cats = [];
    rows.forEach(function (r) { var c = r.category || 'Uncategorized'; if (cats.indexOf(c) < 0) cats.push(c); });
    cats.sort();
    var chains = [];
    rows.forEach(function (r) { r.chains.forEach(function (c) { if (chains.indexOf(c) < 0) chains.push(c); }); });
    chains.sort();
    var top = rows[0];
    var html = '<div class="wrap">' +
      '<header class="hero"><h1>Token Radar <span>· pre-token protocols, ranked</span></h1>' +
      '<p class="sub">Which protocol with no token yet is worth farming next, and what do you do about it? ' + rows.length + ' protocols ranked by implied launch value, from the sealed DefiLlama snapshot of ' + esc(DATA.as_of) + '. Model ' + esc(DATA.model_version) + ' — every figure traces to the snapshot.</p></header>' +
      '<div class="stats">' +
      '<div class="stat"><b>' + rows.length + '</b><span>ranked rows</span></div>' +
      '<div class="stat"><b>' + DATA.watchlist_size + '</b><span>on the watchlist</span></div>' +
      '<div class="stat"><b>' + DATA.early_size + '</b><span>early finds below the floor</span></div>' +
      '<div class="stat"><b>' + money(top ? top.implied_value_usd : 0) + '</b><span>top implied value</span></div>' +
      '<div class="stat"><b>' + money(DATA.floor_usd) + '</b><span>watchlist floor (TVL)</span></div>' +
      '</div>' +
      '<nav class="tabs">' +
      '<button data-view="board" class="' + (s.view === 'board' || s.view === 'filtered' ? 'on' : '') + '">Board</button>' +
      '<button data-view="live" class="' + (s.view === 'live' ? 'on' : '') + '">Live tokens</button>' +
      '<button data-view="method" class="' + (s.view === 'method' ? 'on' : '') + '">Method</button>' +
      '</nav>';

    if (s.view === 'live') {
      html += '<p class="count">Protocols whose token already trades, by market cap. These are the calibration set: their mcap/TVL ratios set the multiples the board uses. They are not farm targets.</p><table><thead><tr><th>Protocol</th><th>Category</th><th class="num">TVL</th><th class="num">Market cap</th><th class="num">mcap / TVL</th><th class="num">7d</th></tr></thead><tbody>';
      live.forEach(function (p) {
        html += '<tr><td><b>' + esc(p.name) + '</b><br><span style="color:var(--muted);font-size:12px">' + esc(p.slug) + '</span></td><td>' + esc(p.category || '—') + '</td><td class="num">' + money(p.tvl_usd) + '</td><td class="num">' + money(p.mcap_usd) + '</td><td class="num">' + (p.mcap_tvl == null ? '—' : p.mcap_tvl.toFixed(2) + '×') + '</td><td class="num">' + pct(p.change_7d) + '</td></tr>';
      });
      html += '</tbody></table>';
    } else if (s.view === 'method') {
      var cal = DATA.calibration.by_category.map(function (c) {
        return '<tr><td>' + esc(c.category) + '</td><td class="num">' + c.multiple.toFixed(2) + '×</td><td class="num">' + c.comps + '</td><td>' + (c.fallback ? 'global median (too few comps)' : 'category median') + '</td></tr>';
      }).join('');
      html += '<section class="method"><h2>How the radar works</h2>' +
        '<h3>The value model</h3><p>Implied value = TVL × category multiple × growth × maturity × breadth.</p>' +
        '<ul><li><b>Category multiple:</b> the median market-cap/TVL of the protocols in this snapshot whose token already trades, per category (global median ' + DATA.calibration.global_multiple.toFixed(2) + '× across ' + DATA.calibration.global_comps + ' trading protocols). Clamped to 0.05–1.50×.</li>' +
        '<li><b>Growth:</b> the 7-day TVL change, clamped to −50…+100%, weighted at 0.5.</li>' +
        '<li><b>Maturity:</b> 0.60 + up to 0.40 for up to 3 years tracked with no token. A long runway with no token is pent-up launch value — and the dashboard says so, it never promises a launch.</li>' +
        '<li><b>Breadth:</b> +1.5% per extra chain, up to 10 chains. More chains, more surface for a token.</li></ul>' +
        '<h3>Calibration table (from the snapshot itself)</h3><table><thead><tr><th>Category</th><th class="num">Multiple</th><th class="num">Comps</th><th>Source</th></tr></thead><tbody>' + cal + '</tbody></table>' +
        '<h3>What this is not</h3><ul><li>Not a prediction that a token launches, or when. A protocol that <b>records no token</b> may still have one its DefiLlama record does not carry.</li>' +
        '<li>Not a price target. The implied value is the model’s claim about what a launch would be worth <i>if the protocol’s record stayed as it is</i>.</li>' +
        '<li>Not financial advice. Farm costs are estimates; check gas and the protocol’s own pages before you move funds.</li>' +
        '<li>Nothing here is hard-coded by name. The same function scores every protocol, and the board is rebuilt from the snapshot on every run — so a future snapshot finds future protocols early.</li></ul>' +
        '<h3>Data</h3><p>Snapshot: ' + esc(DATA.source) + ', as of ' + esc(DATA.as_of) + '. Watchlist floor: ' + money(DATA.floor_usd) + ' TVL. Board: ' + rows.length + ' rows, every watchlist protocol included, plus the strongest pre-token protocols below the floor by implied value.</p></section>';
    } else {
      var f = filtered();
      if (s.view === 'detail') {
        var d = rows.find(function (r) { return r.slug === s.detail; });
        if (d) html += detailHtml(d);
        else html += '<p class="count">No protocol matches that detail link.</p>';
      }
      html += '<div class="controls">' +
        '<input type="search" id="q" placeholder="Search name or slug…" value="' + esc(s.q) + '">' +
        '<select id="cat">' + options(cats, s.category, 'All categories') + '</select>' +
        '<select id="chain">' + options(chains, s.chain, 'All chains') + '</select>' +
        '<label><input type="checkbox" id="wl"' + (s.wl ? ' checked' : '') + '> Watchlist only</label>' +
        '<select id="sort">' +
        '<option value="implied"' + (s.sort === 'implied' ? ' selected' : '') + '>Sort: implied value</option>' +
        '<option value="tvl"' + (s.sort === 'tvl' ? ' selected' : '') + '>Sort: TVL</option>' +
        '<option value="growth"' + (s.sort === 'growth' ? ' selected' : '') + '>Sort: 7d growth</option>' +
        '<option value="age"' + (s.sort === 'age' ? ' selected' : '') + '>Sort: age</option>' +
        '<option value="name"' + (s.sort === 'name' ? ' selected' : '') + '>Sort: name</option>' +
        '</select></div>' +
        '<p class="count">Showing ' + Math.min(f.list.length, 100) + ' of ' + f.list.length + ' matching rows · ' + rows.length + ' on the board · click a row for its farm plan.</p>' +
        '<table id="board"><thead><tr><th>#</th><th>Protocol</th><th>Category</th><th>Chains</th><th class="num">TVL</th><th class="num">7d</th><th class="num">Age</th><th class="num">Implied value</th></tr></thead><tbody>' +
        f.list.slice(0, 100).map(rowHtml).join('') + '</tbody></table>';
    }
    html += '<footer>Token Radar · model ' + esc(DATA.model_version) + ' · snapshot ' + esc(DATA.as_of) + ' · ' + esc(DATA.source) + ' · Implied values are model estimates, not predictions. DYOR.</footer></div>';
    var app = document.getElementById('app');
    app.innerHTML = html;
    app.setAttribute('aria-busy', 'false');
    var q = document.getElementById('q');
    if (q) q.addEventListener('input', function () { setHash({ q: q.value, view: 'board', detail: '' }); });
    var cat = document.getElementById('cat');
    if (cat) cat.addEventListener('change', function () { setHash({ category: cat.value, view: cat.value ? 'filtered' : 'board', detail: '' }); });
    var ch = document.getElementById('chain');
    if (ch) ch.addEventListener('change', function () { setHash({ chain: ch.value, view: 'board', detail: '' }); });
    var wl = document.getElementById('wl');
    if (wl) wl.addEventListener('change', function () { setHash({ wl: wl.checked, view: 'board', detail: '' }); });
    var so = document.getElementById('sort');
    if (so) so.addEventListener('change', function () { setHash({ sort: so.value, view: 'board', detail: '' }); });
    document.querySelectorAll('.tabs button').forEach(function (b) {
      b.addEventListener('click', function () { setHash({ view: b.getAttribute('data-view'), detail: '', category: '', chain: '', q: '', wl: false }); });
    });
    document.querySelectorAll('tbody tr[data-slug]').forEach(function (tr) {
      tr.addEventListener('click', function () { setHash({ view: 'detail', detail: tr.getAttribute('data-slug') }); });
    });
  }
  window.addEventListener('hashchange', render);
  render();
})();
