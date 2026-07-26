/* ============================================================
   ETC — nav.js  (injects loader + nav + mobile drawer + FAB)
   Loads AFTER main.js. Pages contain no nav HTML of their own.
   ============================================================ */
(function () {
  'use strict';

  /* ---------- LOADER ---------- */
  var loader = document.createElement('div');
  loader.id = 'loader';
  loader.innerHTML =
    '<svg class="ldr-hook-svg" viewBox="0 0 74 88" xmlns="http://www.w3.org/2000/svg">' +
    '<line x1="37" y1="0" x2="37" y2="30" stroke="#F59E0B" stroke-width="4"/>' +
    '<rect x="27" y="30" width="20" height="12" rx="2" fill="#F59E0B"/>' +
    '<path d="M37 42 v10 a16 16 0 1 0 16 16" fill="none" stroke="#F59E0B" stroke-width="6" stroke-linecap="round"/>' +
    '<circle cx="37" cy="36" r="3" fill="#0B0E14"/></svg>' +
    '<div class="ldr-brand"><div class="ldr-brand-t">Energy Tech <span>Crane</span></div></div>' +
    '<div class="ldr-bar-w"><div class="ldr-bar"></div></div>' +
    '<div class="ldr-tag">Lifting India Since 2016</div>';
  document.body.prepend(loader);
  window.addEventListener('load', function () {
    setTimeout(function () { loader.classList.add('done'); }, 350);
  });
  setTimeout(function () { loader.classList.add('done'); }, 2600); /* safety */

  /* ---------- I18N ---------- */
  var LANG_KEY = 'etc-lang';
  var lang = 'en';
  try { lang = localStorage.getItem(LANG_KEY) || 'en'; } catch (e) {}
  var T = {
    en: { home: 'Home', products: 'Products', about: 'About Us', more: 'More', service: 'Service & Support', apps: 'Applications', quality: 'Quality & Certs', contact: 'Contact', quote: 'Get Quote', erp: 'ERP', tagline: 'Crane Manufacturer' },
    hi: { home: 'होम', products: 'उत्पाद', about: 'हमारे बारे में', more: 'अधिक', service: 'सेवा और सहायता', apps: 'अनुप्रयोग', quality: 'गुणवत्ता प्रमाणन', contact: 'संपर्क', quote: 'कोटेशन पाएं', erp: 'ईआरपी', tagline: 'क्रेन निर्माता' }
  };
  var t = T[lang] || T.en;

  /* ---------- PRODUCT LINKS (single source) ---------- */
  var P = [
    { h: 'EOT & Overhead', items: [
      ['<svg class="eic" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18M6 21V9M6 9L18 4v17M6 13h12M6 17h12"/><path d="M18 8l3 1v3"/></svg>', 'EOT Crane — Single Girder', '/eot-crane/single-girder'],
      ['<svg class="eic" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18M6 21V9M6 9L18 4v17M6 13h12M6 17h12"/><path d="M18 8l3 1v3"/></svg>', 'EOT Crane — Double Girder', '/eot-crane/double-girder']
    ]},
    { h: 'Gantry & Semi Goliath', items: [
      ['<svg class="eic" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16v6H4zM6 6l4 6M12 6l4 6M18 6l2 3"/><path d="M7 12v9M17 12v9M5 21h4M15 21h4"/></svg>', 'Gantry Crane — Single Girder', '/gantry-crane/single-girder'],
      ['<svg class="eic" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16v6H4zM6 6l4 6M12 6l4 6M18 6l2 3"/><path d="M7 12v9M17 12v9M5 21h4M15 21h4"/></svg>', 'Gantry Crane — Double Girder', '/gantry-crane/double-girder'],
      ['<svg class="eic" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3h4l1 3-3 2-3-2zM12 8v4"/><path d="M8 14h8v4l-4 3-4-3z"/></svg>', 'Semi Goliath — Single Girder', '/semi-goliath/single-girder'],
      ['<svg class="eic" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3h4l1 3-3 2-3-2zM12 8v4"/><path d="M8 14h8v4l-4 3-4-3z"/></svg>', 'Semi Goliath — Double Girder', '/semi-goliath/double-girder']
    ]},
    { h: 'Hoists & Components', items: [
      ['<svg class="eic" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="3.5" r="1.5"/><path d="M12 5v6a4 4 0 0 0 8 0"/></svg>', 'Wire Rope Hoist', '/wire-rope-hoist'],
      ['<svg class="eic" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="7" height="10" rx="3.5"/><rect x="13" y="10" width="7" height="10" rx="3.5"/></svg>', 'Electric Chain Hoist', '/electric-chain-hoist'],
      ['<svg class="eic" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="8" width="18" height="12" rx="2"/><path d="M9 8V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18M10 13v2h4v-2"/></svg>', 'Crab Unit Assembly', '/crab-unit'],
      ['<svg class="eic" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="10" rx="2"/><path d="M3 11h18"/><circle cx="8" cy="19" r="1.6"/><circle cx="16" cy="19" r="1.6"/></svg>', 'End Carriage — L-Block', '/end-carriage/l-block'],
      ['<svg class="eic" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="10" rx="2"/><path d="M3 11h18"/><circle cx="8" cy="19" r="1.6"/><circle cx="16" cy="19" r="1.6"/></svg>', 'End Carriage — Open Type', '/end-carriage/open-type']
    ]},
    { h: 'Circular Crane', items: [
      ['<svg class="eic" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2"/><path d="M12 3v7M12 14v7M3.5 8.5l6.7 2.4M20.5 8.5l-6.7 2.4"/></svg>', 'Circular Crane — Single Girder', '/circular-crane/single-girder'],
      ['<svg class="eic" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2"/><path d="M12 3v7M12 14v7M3.5 8.5l6.7 2.4M20.5 8.5l-6.7 2.4"/></svg>', 'Circular Crane — Double Girder', '/circular-crane/double-girder']
    ]}
  ];

  function megaCols() {
    return P.map(function (col) {
      return '<div class="ml"><div class="mh-t">' + col.h + '</div>' +
        col.items.map(function (i) {
          return '<a class="ml-i" href="' + i[2] + '"><span class="ic">' + i[0] + '</span>' + i[1] + '</a>';
        }).join('') + '</div>';
    }).join('');
  }

  /* ---------- NAV ---------- */
  var path = location.pathname;
  function on(p) { return path === p ? ' on' : ''; }
  var nav = document.createElement('nav');
  nav.id = 'nav';
  nav.innerHTML =
    '<div class="nav-inner">' +
      '<a class="nav-logo" href="/"><img src="/public/images/logo.svg" alt="Energy Tech Crane logo">' +
        '<div class="nav-logo-t">Energy Tech <span>Crane</span><small>' + t.tagline + ' · Ahmedabad</small></div></a>' +
      '<div class="nav-crane-deco" aria-hidden="true">' +
        '<svg viewBox="0 0 190 44" xmlns="http://www.w3.org/2000/svg">' +
          '<line x1="6" y1="10" x2="184" y2="10" stroke="var(--tx2)" stroke-width="3" stroke-linecap="round" opacity=".55"/>' +
          '<line x1="14" y1="10" x2="14" y2="16" stroke="var(--tx2)" stroke-width="2" opacity=".4"/>' +
          '<line x1="176" y1="10" x2="176" y2="16" stroke="var(--tx2)" stroke-width="2" opacity=".4"/>' +
          '<g class="ncd-trolley">' +
            '<rect x="80" y="6" width="22" height="10" rx="2" fill="var(--amb)"/>' +
            '<rect x="84" y="8.5" width="14" height="5" rx="1" fill="var(--bg)" opacity=".55"/>' +
            '<line x1="91" y1="16" x2="91" y2="27" stroke="var(--tx2)" stroke-width="1.6" stroke-dasharray="2.4 2.4"/>' +
            '<g class="ncd-hook">' +
              '<rect x="86" y="27" width="10" height="5" rx="1.5" fill="var(--amb)"/>' +
              '<path d="M91 32 v3 a4.5 4.5 0 1 0 4.5 4.5" fill="none" stroke="var(--amb)" stroke-width="2.1" stroke-linecap="round"/>' +
            '</g>' +
          '</g>' +
        '</svg>' +
      '</div>' +
      '<div class="nav-links">' +
        '<a class="nl' + on('/') + '" href="/">' + t.home + '</a>' +
        '<div class="nd"><a class="nl' + (path === '/products' || path.indexOf('/eot') === 0 || path.indexOf('/gantry') === 0 || path.indexOf('/goliath') === 0 || path.indexOf('/semi') === 0 || path.indexOf('/wire') === 0 || path.indexOf('/electric') === 0 || path.indexOf('/crab') === 0 || path.indexOf('/end-carriage') === 0 || path.indexOf('/circular') === 0 ? ' on' : '') + '" href="/products">' + t.products + ' <span class="car">▾</span></a>' +
          '<div class="mp"><div class="mi"><span class="mc">8 Categories · 13 Variants</span><span class="mh">IS:3177 · IS:4137 · FEM 1.001 certified manufacturing</span></div>' +
          megaCols() +
          '<div class="mcta"><span>Capacities 1 – 200 Ton · Custom spans & heights</span><a class="qb" href="/products">View All Products →</a></div></div></div>' +
        '<a class="nl' + on('/about') + '" href="/about">' + t.about + '</a>' +
        '<div class="nd"><a class="nl" href="/service">' + t.more + ' <span class="car">▾</span></a>' +
          '<div class="dp">' +
            '<a class="dl" href="/service"><svg class="eic" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 6.5a4 4 0 0 0-5.4 5L3 17.6 6.4 21l6.1-6.1a4 4 0 0 0 5-5.4L14.7 12 12 9.3z"/></svg> ' + t.service + '</a>' +
            '<a class="dl" href="/applications"><svg class="eic" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21V9l6 4V9l6 4V5h6v16z"/><path d="M8 17h2M13 17h2M18 17h2M18 3v2"/></svg> ' + t.apps + '</a>' +
            '<a class="dl" href="/quality"><svg class="eic" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="14" r="5"/><path d="M9 10L6 2h5l1 3 1-3h5l-3 8"/><path d="M12 12v2.5l1.8 1"/></svg> ' + t.quality + '</a>' +
          '</div></div>' +
        '<a class="nl' + on('/contact') + '" href="/contact">' + t.contact + '</a>' +
      '</div>' +
      '<div class="nav-act">' +
        '<div class="lang-sw"><button class="lb' + (lang === 'en' ? ' on' : '') + '" data-lang="en">EN</button><button class="lb' + (lang === 'hi' ? ' on' : '') + '" data-lang="hi">हिं</button></div>' +
        '<button class="thm-btn" onclick="toggleTheme()" aria-label="Toggle theme"><span id="thm-ic">' + (document.documentElement.getAttribute('data-theme') === 'light' ? '<svg class="eic" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13.5A8.5 8.5 0 0 1 10.5 4 8.5 8.5 0 1 0 20 13.5z"/></svg>' : '<svg class="eic" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/></svg>') + '</span></button>' +
        '<a class="qb" href="/contact">' + t.quote + '</a>' +
        '<button class="ham" id="ham" aria-label="Open menu"><span></span><span></span><span></span></button>' +
      '</div>' +
    '</div>';
  document.body.prepend(nav);

  /* ---------- MOBILE DRAWER ---------- */
  var ov = document.createElement('div');
  ov.className = 'mob-ov';
  var dr = document.createElement('div');
  dr.className = 'mob-dr';
  dr.innerHTML =
    '<div class="mob-dr-inner">' +
      '<div class="mob-dr-hd"><div class="nav-logo-t">Energy Tech <span>Crane</span></div>' +
        '<button class="thm-btn" onclick="toggleTheme()" aria-label="Toggle theme"><svg class="eic" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 3v18"/></svg></button></div>' +
      '<a class="mnl" href="/">' + t.home + '</a>' +
      '<details class="mdet"><summary class="msum">' + t.products + '</summary><div class="mdet-body">' +
        '<a href="/products"><b>→ All Products</b></a>' +
        P.map(function (c) { return c.items.map(function (i) { return '<a href="' + i[2] + '">' + i[1] + '</a>'; }).join(''); }).join('') +
      '</div></details>' +
      '<a class="mnl" href="/about">' + t.about + '</a>' +
      '<details class="mdet"><summary class="msum">' + t.more + '</summary><div class="mdet-body">' +
        '<a href="/service">' + t.service + '</a>' +
        '<a href="/applications">' + t.apps + '</a><a href="/quality">' + t.quality + '</a>' +
      '</div></details>' +
      '<a class="mnl" href="/contact">' + t.contact + '</a>' +
      '<div class="mob-cta">' +
        '<a class="btn-a" href="/contact">' + t.quote + '</a>' +
        '<a class="btn-wa" href="https://wa.me/918780005104?text=Hi%2C%20I%20need%20a%20crane%20quotation" target="_blank" rel="noopener">WhatsApp Us</a>' +
        '<div class="lang-sw"><button class="lb' + (lang === 'en' ? ' on' : '') + '" data-lang="en">EN</button><button class="lb' + (lang === 'hi' ? ' on' : '') + '" data-lang="hi">हिंदी</button></div>' +
      '</div>' +
    '</div>';
  document.body.appendChild(ov);
  document.body.appendChild(dr);

  var ham = document.getElementById('ham');
  function closeDr() { ov.classList.remove('open'); dr.classList.remove('open'); ham.classList.remove('x'); document.body.style.overflow = ''; }
  ham.addEventListener('click', function () {
    var open = dr.classList.toggle('open');
    ov.classList.toggle('open', open);
    ham.classList.toggle('x', open);
    document.body.style.overflow = open ? 'hidden' : '';
  });
  ov.addEventListener('click', closeDr);
  dr.querySelectorAll('a').forEach(function (a) { a.addEventListener('click', closeDr); });

  /* ---------- LANGUAGE TOGGLE ---------- */
  document.querySelectorAll('.lb').forEach(function (b) {
    b.addEventListener('click', function () {
      var l = b.getAttribute('data-lang');
      try { localStorage.setItem(LANG_KEY, l); } catch (e) {}
      location.reload();
    });
  });

  /* ---------- FULL-SITE HINDI (dictionary in /public/js/hi.js) ----------
     When the user selects हिं, hi.js (English → Hindi map) is loaded and every
     text node, placeholder and the page title are translated in place. Strings
     not in the dictionary (codes, emails, numbers) stay as they are. */
  function applyHindi(dict) {
    document.documentElement.setAttribute('lang', 'hi');
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
    var n;
    while ((n = walker.nextNode())) {
      var pn = n.parentNode && n.parentNode.nodeName;
      if (pn === 'SCRIPT' || pn === 'STYLE') continue;
      var raw = n.nodeValue;
      var m = raw.match(/^(\s*)([\s\S]*?)(\s*)$/);
      var key = m[2].replace(/\s+/g, ' ');
      if (key && Object.prototype.hasOwnProperty.call(dict, key)) {
        n.nodeValue = m[1] + dict[key] + m[3];
      }
    }
    document.querySelectorAll('[placeholder]').forEach(function (el) {
      var k = el.getAttribute('placeholder').replace(/\s+/g, ' ').trim();
      if (k && dict[k]) el.setAttribute('placeholder', dict[k]);
    });
    var tk = document.title.replace(/\s+/g, ' ').trim();
    if (dict[tk]) document.title = dict[tk];
  }
  if (lang === 'hi') {
    var hs = document.createElement('script');
    hs.src = '/public/js/hi.js?v=25';
    hs.onload = function () {
      function go() { if (window.ETC_HI) applyHindi(window.ETC_HI); }
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', go);
      } else { go(); }
      /* second + third pass: catch content injected after load
         (product reviews, form alerts). applyHindi is idempotent —
         already-translated nodes no longer match any dictionary key. */
      window.addEventListener('load', function () { go(); setTimeout(go, 900); });
    };
    document.head.appendChild(hs);
  }

  /* ---------- WHATSAPP FAB ---------- */
  var fab = document.createElement('a');
  fab.className = 'wa-fab';
  fab.href = 'https://wa.me/918780005104?text=Hi%2C%20I%20need%20a%20crane%20quotation';
  fab.target = '_blank';
  fab.rel = 'noopener';
  fab.setAttribute('aria-label', 'Chat on WhatsApp');
  fab.innerHTML = '<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><path d="M16 3C9.4 3 4 8.3 4 14.9c0 2.6.8 5 2.3 7L4 29l7.3-2.2c1.9 1 4 1.6 6.2 1.6 6.6 0 12-5.3 12-11.9S22.6 3 16 3zm0 21.8c-2 0-3.9-.6-5.5-1.6l-.4-.2-4.1 1.2 1.2-4-.3-.4c-1.2-1.7-1.9-3.7-1.9-5.9C5 9.4 9.9 4.6 16 4.6s11 4.8 11 10.3-4.9 9.9-11 9.9zm5.6-7.4c-.3-.2-1.8-.9-2.1-1-.3-.1-.5-.2-.7.2-.2.3-.8 1-1 1.2-.2.2-.4.2-.7.1-.3-.2-1.3-.5-2.4-1.5-.9-.8-1.5-1.8-1.7-2.1-.2-.3 0-.5.1-.6l.5-.6c.2-.2.2-.3.3-.5.1-.2 0-.4 0-.6-.1-.2-.7-1.7-1-2.3-.3-.6-.5-.5-.7-.5h-.6c-.2 0-.6.1-.9.4-.3.3-1.1 1.1-1.1 2.7s1.2 3.1 1.3 3.3c.2.2 2.3 3.6 5.7 5 3.3 1.4 3.3.9 3.9.9.6-.1 1.8-.7 2.1-1.5.3-.7.3-1.3.2-1.5-.1-.1-.3-.2-.6-.4z"/></svg>';
  document.body.appendChild(fab);
})();
