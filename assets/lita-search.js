/* Site search for the static loveistheauthor.com: pages + live podcast episodes. */
(function () {
  var params = new URLSearchParams(location.search);
  var q = (params.get('s') || '').trim();
  var out = document.getElementById('lita-results');
  var label = document.getElementById('lita-q');
  if (label) label.textContent = q || '…';
  document.querySelectorAll('form.search-form input[name="s"]').forEach(function (i) { i.value = q; });

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function strip(h) { var d = document.createElement('div'); d.innerHTML = h || ''; return d.textContent || ''; }
  function snippet(text, terms) {
    var lower = text.toLowerCase(), i = -1;
    terms.forEach(function (t) { var j = lower.indexOf(t); if (j !== -1 && (i === -1 || j < i)) i = j; });
    var start = Math.max(0, i - 80);
    return (start > 0 ? '… ' : '') + text.substr(start, 260) + (text.length > start + 260 ? ' …' : '');
  }
  function score(title, text, terms) {
    var t = title.toLowerCase(), b = text.toLowerCase(), s = 0;
    for (var i = 0; i < terms.length; i++) {
      var hit = false;
      if (t.indexOf(terms[i]) !== -1) { s += 10; hit = true; }
      if (b.indexOf(terms[i]) !== -1) { s += 1; hit = true; }
      if (!hit) return 0;
    }
    return s;
  }
  function render(items) {
    if (!items.length) {
      out.innerHTML = '<p>Sorry, nothing matched <strong>' + esc(q) + '</strong>. Try another word.</p>';
      return;
    }
    out.innerHTML = items.map(function (r) {
      return '<article class="post hentry"><div class="hentry-middle"><header class="entry-header">' +
        '<h2 class="entry-title"><a href="' + esc(r.url) + '"' + (r.external ? ' target="_blank" rel="noopener"' : '') + '>' +
        esc(r.title) + '</a></h2>' + (r.meta ? '<div class="entry-meta below-title">' + esc(r.meta) + '</div>' : '') +
        '</header><div class="entry-content"><p>' + esc(r.snippet) + '</p></div></div></article>';
    }).join('');
  }

  if (!q) { out.innerHTML = '<p>Type a word in the search box to search the site and all podcast episodes.</p>'; return; }
  var terms = q.toLowerCase().split(/\s+/).filter(Boolean);

  var pages = fetch('/assets/search-index.json').then(function (r) { return r.json(); }).catch(function () { return []; });
  var eps = (window.litaLive ? window.litaLive.loadFeed() : Promise.resolve([])).catch(function () { return []; });
  Promise.all([pages, eps]).then(function (res) {
    var results = [];
    res[0].forEach(function (p) {
      var s = score(p.title, p.text, terms);
      if (s) results.push({ s: s + 5, url: p.url, title: p.title, snippet: snippet(p.text, terms) });
    });
    res[1].forEach(function (e) {
      var title = strip(e.title), text = strip(e.description);
      var s = score(title, text, terms);
      if (s) results.push({ s: s, url: e.link, external: true, title: title, meta: 'Podcast episode · ' + e.date, snippet: snippet(text, terms) });
    });
    results.sort(function (a, b) { return b.s - a.s; });
    render(results.slice(0, 50));
  });
})();
