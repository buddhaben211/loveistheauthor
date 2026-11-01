/*
 * lita-live.js — keeps the static copy of loveistheauthor.com working without WordPress.
 *
 * 1. Podcast Player plugin: before the plugin starts, the episode list is refreshed from the
 *    live podcast feed (Spotify for Podcasters / anchor.fm). The plugin's server calls
 *    ("Load More" and episode search) are answered in the browser from the same feed.
 * 2. "I Recommend This" hearts: answered by /assets/lita-live.js's small handler (see bottom).
 *
 * The plugin script tag is marked data-lita-defer="1" with data-src instead of src, so it only
 * loads after the fresh data is in place.
 */
(function () {
  var FEED = 'https://anchor.fm/s/2053fb2c/podcast/rss';
  var CACHE_KEY = 'lita-feed-v1';
  var CACHE_MS = 30 * 60 * 1000;
  var episodes = null; // parsed feed, newest first

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function fmtDate(d) {
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  }

  function fmtDuration(v) {
    if (!v) return '';
    if (/^\d+$/.test(v)) {
      var s = parseInt(v, 10), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
      return [h, m, sec].map(function (n) { return (n < 10 ? '0' : '') + n; }).join(':');
    }
    return v;
  }

  function hash(str) {
    var h = 0;
    for (var i = 0; i < str.length; i++) { h = ((h << 5) - h + str.charCodeAt(i)) | 0; }
    return ('00000000' + (h >>> 0).toString(16)).slice(-8);
  }

  function parseFeed(xml) {
    var doc = new DOMParser().parseFromString(xml, 'text/xml');
    var ITUNES = 'http://www.itunes.com/dtds/podcast-1.0.dtd';
    var CONTENT = 'http://purl.org/rss/1.0/modules/content/';
    var chanImg = doc.getElementsByTagNameNS(ITUNES, 'image')[0];
    var chanImgUrl = chanImg ? chanImg.getAttribute('href') : '';
    var chanAuthor = (doc.getElementsByTagNameNS(ITUNES, 'author')[0] || {}).textContent || '';
    var out = [];
    var items = doc.getElementsByTagName('item');
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var get = function (tag) { var n = it.getElementsByTagName(tag)[0]; return n ? n.textContent : ''; };
      var getNS = function (ns, tag) { var n = it.getElementsByTagNameNS(ns, tag)[0]; return n; };
      var enc = it.getElementsByTagName('enclosure')[0];
      if (!enc) continue;
      var img = getNS(ITUNES, 'image');
      var content = getNS(CONTENT, 'encoded');
      var pub = new Date(get('pubDate'));
      var season = getNS(ITUNES, 'season');
      var etype = getNS(ITUNES, 'episodeType');
      var author = getNS(ITUNES, 'author');
      var title = get('title').trim();
      out.push({
        title: esc(title),
        description: content ? content.textContent : get('description'),
        author: esc(author ? author.textContent : chanAuthor),
        date: isNaN(pub) ? '' : fmtDate(pub),
        link: get('link') || enc.getAttribute('url'),
        src: enc.getAttribute('url'),
        featured: img ? img.getAttribute('href') : chanImgUrl,
        featured_id: 0,
        mediatype: 'audio',
        season: season ? parseInt(season.textContent, 10) || 1 : 1,
        categories: [],
        duration: fmtDuration((getNS(ITUNES, 'duration') || {}).textContent),
        episodetype: etype ? etype.textContent : 'full',
        source_mime: enc.getAttribute('type') || 'audio/mpeg',
        source_format: 'mp3',
        is_hls: 0,
        timestamp: isNaN(pub) ? 0 : Math.floor(pub.getTime() / 1000),
        key: hash(get('guid') || enc.getAttribute('url')),
        fset: '',
        fratio: 1,
        _search: title.toLowerCase()
      });
    }
    out.sort(function (a, b) { return b.timestamp - a.timestamp; });
    return out;
  }

  function loadFeed() {
    try {
      var c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      if (c && Date.now() - c.t < CACHE_MS && c.e && c.e.length) return Promise.resolve(c.e);
    } catch (e) { /* storage unavailable */ }
    return fetch(FEED, { cache: 'no-cache' })
      .then(function (r) { if (!r.ok) throw new Error('feed ' + r.status); return r.text(); })
      .then(function (xml) {
        var e = parseFeed(xml);
        try { localStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), e: e })); } catch (err) { /* ignore */ }
        return e;
      });
  }

  function epData(ep) {
    var o = {};
    for (var k in ep) if (k.charAt(0) !== '_') o[k] = ep[k];
    return o;
  }

  function entryHtml(id, ep) {
    return '<div id="' + id + '" class="episode-list__entry pod-entry" data-search-term="' + esc(ep._search) +
      '" data-cats="s-' + ep.season + '"> <div class="pod-entry__wrapper"> <div class="pod-entry__content">' +
      ' <div class="pod-entry__title"> <a href="' + esc(ep.link) + '">' + ep.title + '</a> </div>' +
      ' <div class="pod-entry__date">' + esc(ep.date) + '</div> <div class="pod-entry__author">' + ep.author +
      '</div> </div> </div> </div>';
  }

  // Refresh every feed-based player instance on the page that shows a list of episodes.
  function refreshPlayers() {
    var data = window.podcastPlayerData;
    if (!data || !episodes || !episodes.length) return;
    Object.keys(data).forEach(function (pk) {
      if (pk.indexOf('pp-podcast-') !== 0) return;
      var p = data[pk];
      if (!p.rdata || p.rdata.from !== 'feedurl' || !p.load_info) return;
      var inst = pk.replace('pp-podcast-', '');
      var oldIds = Object.keys(p).filter(function (k) { return k.indexOf('ppe-') === 0; });
      if (oldIds.length < 2) return; // single-episode players stay as they are
      var n = Math.min(p.load_info.loaded || oldIds.length, episodes.length);
      oldIds.forEach(function (k) { delete p[k]; });
      for (var i = 0; i < n; i++) p['ppe-' + inst + '-' + (i + 1)] = epData(episodes[i]);
      p.load_info.loaded = n;
      p.load_info.maxItems = episodes.length;

      var root = document.getElementById(pk);
      if (!root) return;
      var wrap = root.querySelector('.episode-list__wrapper');
      if (wrap) {
        wrap.querySelectorAll('.episode-list__entry').forEach(function (el) { el.remove(); });
        var html = '';
        for (var j = 0; j < n; j++) html += entryHtml('ppe-' + inst + '-' + (j + 1), episodes[j]);
        wrap.insertAdjacentHTML('afterbegin', html);
      }
      // the "now playing" episode shown above the list
      var first = episodes[0];
      var t = root.querySelector('.episode-single__title'); if (t) t.innerHTML = first.title;
      var a = root.querySelector('.single-author'); if (a) a.innerHTML = first.author;
      var d = root.querySelector('.episode-single__description'); if (d) d.innerHTML = first.description;
      var img = root.querySelector('.ppjs__img-btn'); if (img && first.featured) { img.src = first.featured; img.alt = first.title.replace(/<[^>]+>/g, ''); }
      var src = root.querySelector('audio source'); if (src) { src.src = first.src; src.type = first.source_mime; }
    });
  }

  // Answer the plugin's admin-ajax calls in the browser.
  function installAjaxShim() {
    var $ = window.jQuery;
    if (!$ || $.__litaShim) return;
    $.__litaShim = true;
    var realAjax = $.ajax;
    $.ajax = function (opts) {
      var o = typeof opts === 'string' ? { url: opts } : (opts || {});
      if (!o.url || String(o.url).indexOf('admin-ajax.php') === -1) return realAjax.apply(this, arguments);
      var d = o.data || {};
      var reply = function (payload, raw) {
        var dfd = $.Deferred();
        setTimeout(function () {
          if (payload === null) {
            if (o.error) o.error({}, 'error', 'unavailable');
            dfd.reject();
          } else {
            var body = raw ? payload : JSON.stringify(payload);
            if (o.success) o.success(body);
            dfd.resolve(body);
          }
          if (o.complete) o.complete();
        }, 0);
        return dfd.promise();
      };
      var all = episodes || [];
      if (d.action === 'pp_fetch_episodes') {
        var from = parseInt(d.loaded, 10) || 0, step = parseInt(d.step, 10) || 10;
        var eps = {};
        for (var i = from; i < Math.min(from + step, all.length); i++) eps['ppe-' + d.instance + '-' + (i + 1)] = epData(all[i]);
        return reply({ loaded: Math.min(from + step, all.length), episodes: eps });
      }
      if (d.action === 'pp_search_episodes') {
        var q = String(d.search || '').toLowerCase(), res = {}, c = 0;
        all.forEach(function (ep) {
          if (q && ep._search.indexOf(q) !== -1 && c < 30) { c++; res['ppe-s-' + c] = epData(ep); }
        });
        return reply(c ? { episodes: res } : {});
      }
      if (d.action === 'pp_fetch_media_url') return reply(d.src || '#');
      if (d.action === 'irecommendthis') {
        // Likes are remembered per visitor in this browser (the site had no likes recorded).
        var likes = hearts();
        var id = String(d.recommend_id);
        var unlike = d.unrecommend === true || d.unrecommend === 'true';
        if (unlike) delete likes[id]; else likes[id] = 1;
        saveHearts(likes);
        var count = likes[id] ? 1 : 0;
        return reply('<span class="irecommendthis-count' + (count ? '' : ' count-zero') + '">' + count +
          '</span><span class="irecommendthis-suffix">' + esc(d.suffix || '') + '</span>', true);
      }
      return reply(null);
    };
  }

  function hearts() {
    try { return JSON.parse(localStorage.getItem('lita-likes') || '{}'); } catch (e) { return {}; }
  }

  function saveHearts(h) {
    try { localStorage.setItem('lita-likes', JSON.stringify(h)); } catch (e) { /* ignore */ }
  }

  // show hearts this visitor already liked
  function markHearts() {
    var likes = hearts();
    document.querySelectorAll('.irecommendthis[data-post-id]').forEach(function (a) {
      var id = a.getAttribute('data-post-id');
      if (likes[id]) {
        a.classList.add('active');
        var c = a.querySelector('.irecommendthis-count');
        if (c) { c.textContent = '1'; c.classList.remove('count-zero'); c.style.display = ''; }
        if (a.getAttribute('data-unlike')) { a.title = a.getAttribute('data-unlike'); a.setAttribute('aria-label', a.title); }
      }
    });
  }

  // Header search: send it to the static search page.
  function wireSearch() {
    document.querySelectorAll('form.search-form').forEach(function (f) {
      f.setAttribute('action', '/search/');
    });
  }

  document.addEventListener('DOMContentLoaded', function () { markHearts(); wireSearch(); });
  if (document.readyState !== 'loading') { markHearts(); wireSearch(); }

  function startPlugin() {
    installAjaxShim();
    var s = document.querySelector('script[data-lita-defer]');
    if (s && !s.__done) {
      s.__done = true;
      var n = document.createElement('script');
      n.src = s.getAttribute('data-src');
      n.id = s.id;
      document.body.appendChild(n);
    }
  }

  window.litaLive = { loadFeed: loadFeed };

  if (!document.querySelector('script[data-lita-defer]')) {
    // pages without the player still get the ajax shim (hearts)
    if (window.jQuery) installAjaxShim(); else document.addEventListener('DOMContentLoaded', installAjaxShim);
    return;
  }

  var ready = new Promise(function (res) {
    if (document.readyState !== 'loading') res(); else document.addEventListener('DOMContentLoaded', res);
  });
  var timeout = new Promise(function (res) { setTimeout(res, 4000); }); // never block the player for long
  Promise.race([
    Promise.all([loadFeed().then(function (e) { episodes = e; }).catch(function (err) { console.warn('LITA feed:', err); }), ready]),
    timeout
  ]).then(function () { return ready; }).then(function () {
    try { refreshPlayers(); } catch (e) { console.warn('LITA refresh:', e); }
    startPlugin();
  });
})();
