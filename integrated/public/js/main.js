/* ============================================================
   ETC — main.js  (theme, scroll reveal, counters, forms, FAQ,
   applications slider, reviews)  — loads BEFORE nav.js
   ============================================================ */
(function () {
  'use strict';

  /* ---------- THEME (set immediately, before paint) ---------- */
  var saved = null;
  try { saved = localStorage.getItem('etc-theme'); } catch (e) {}
  if (saved === 'light' || saved === 'dark') {
    document.documentElement.setAttribute('data-theme', saved);
  }
  window.toggleTheme = function () {
    var cur = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', cur);
    try { localStorage.setItem('etc-theme', cur); } catch (e) {}
    var b = document.getElementById('thm-ic');
    if (b) b.innerHTML = cur === 'light' ? '<svg class="eic" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13.5A8.5 8.5 0 0 1 10.5 4 8.5 8.5 0 1 0 20 13.5z"/></svg>' : '<svg class="eic" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/></svg>';
  };

  /* ---------- helpers ---------- */
  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  ready(function () {

    /* ---------- SCROLL REVEAL ---------- */
    var revealed = document.querySelectorAll('[data-r]');
    if ('IntersectionObserver' in window && revealed.length) {
      var ro = new IntersectionObserver(function (es) {
        es.forEach(function (e) {
          if (e.isIntersecting) { e.target.classList.add('in'); ro.unobserve(e.target); }
        });
      }, { threshold: 0.12 });
      revealed.forEach(function (el) { ro.observe(el); });
    } else {
      revealed.forEach(function (el) { el.classList.add('in'); });
    }

    /* ---------- COUNTERS ---------- */
    var counters = document.querySelectorAll('[data-count]');
    if ('IntersectionObserver' in window && counters.length) {
      var co = new IntersectionObserver(function (es) {
        es.forEach(function (e) {
          if (!e.isIntersecting) return;
          co.unobserve(e.target);
          var el = e.target,
              end = parseInt(el.getAttribute('data-count'), 10) || 0,
              suf = el.getAttribute('data-suf') || '',
              t0 = null;
          function step(t) {
            if (!t0) t0 = t;
            var p = Math.min((t - t0) / 1400, 1);
            el.textContent = Math.floor((1 - Math.pow(1 - p, 3)) * end) + suf;
            if (p < 1) requestAnimationFrame(step);
          }
          requestAnimationFrame(step);
        });
      }, { threshold: 0.4 });
      counters.forEach(function (el) { co.observe(el); });
    }

    /* ---------- ENQUIRY FORMS (contact page + every product page) ---------- */
    var enqForms = document.querySelectorAll('#enq-form, [data-product-enquiry]');
    enqForms.forEach(function (enq) {
      enq.addEventListener('submit', function (ev) {
        ev.preventDefault();
        var alertBox = enq.parentElement.querySelector('.f-alert') || document.getElementById('f-alert');
        var btn = enq.querySelector('button[type="submit"]');
        var data = {};
        new FormData(enq).forEach(function (v, k) { data[k] = String(v).trim(); });
        if (!data.name || !data.phone) {
          showAlert(alertBox, 'err', 'Please fill your name and phone number.');
          return;
        }
        if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
        fetch('/api/enquiry', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        }).then(function (r) { return r.json(); }).then(function (j) {
          if (j.ok) {
            showAlert(alertBox, 'ok', '✅ Enquiry received! Our team will contact you within 24 hours.');
            enq.reset();
          } else {
            showAlert(alertBox, 'err', j.error || 'Something went wrong. Please call us directly.');
          }
        }).catch(function () {
          showAlert(alertBox, 'err', 'Network error. Please call +91 87800 05104.');
        }).finally(function () {
          if (btn) { btn.disabled = false; btn.textContent = 'Send Enquiry'; }
        });
      });
    });
    function showAlert(box, type, msg) {
      if (!box) return;
      box.className = 'f-alert ' + (type === 'ok' ? 'f-ok' : 'f-err');
      box.textContent = msg;
      box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    /* ---------- PRODUCTS CATEGORY FILTER ---------- */
    var fbs = document.querySelectorAll('.fb');
    if (fbs.length) {
      var catSecs = document.querySelectorAll('.cat-sec');
      fbs.forEach(function (b) {
        b.addEventListener('click', function () {
          fbs.forEach(function (x) { x.classList.remove('on'); });
          b.classList.add('on');
          var f = b.getAttribute('data-f');
          catSecs.forEach(function (s) {
            s.hidden = (f !== 'all' && s.getAttribute('data-cat') !== f);
          });
        });
      });
    }

    /* ---------- FAQ ACCORDION ---------- */
    document.querySelectorAll('.faq-q').forEach(function (q) {
      q.addEventListener('click', function () {
        var item = q.closest('.faq-item');
        var open = item.classList.contains('open');
        document.querySelectorAll('.faq-item.open').forEach(function (i) { i.classList.remove('open'); });
        if (!open) item.classList.add('open');
      });
    });

    /* ---------- APPLICATIONS SLIDER ---------- */
    document.querySelectorAll('.app-wrap').forEach(function (wrap) {
      var track = wrap.querySelector('.app-track');
      var slides = wrap.querySelectorAll('.app-sl');
      var prev = wrap.parentElement.querySelector('.app-prev');
      var next = wrap.parentElement.querySelector('.app-next');
      var dotsW = wrap.parentElement.querySelector('.app-dots');
      if (!track || !slides.length) return;
      var idx = 0;
      function perView() {
        var w = window.innerWidth;
        return w <= 768 ? 1 : (w <= 1100 ? 2 : 3);
      }
      function maxIdx() { return Math.max(0, slides.length - perView()); }
      function dots() {
        if (!dotsW) return;
        dotsW.innerHTML = '';
        for (var i = 0; i <= maxIdx(); i++) {
          var d = document.createElement('button');
          d.className = 'app-dot' + (i === idx ? ' on' : '');
          d.setAttribute('aria-label', 'Slide ' + (i + 1));
          (function (n) { d.addEventListener('click', function () { idx = n; go(); }); })(i);
          dotsW.appendChild(d);
        }
      }
      function go() {
        idx = Math.max(0, Math.min(idx, maxIdx()));
        var gap = 18;
        var slideW = slides[0].getBoundingClientRect().width + gap;
        track.style.transform = 'translateX(' + (-idx * slideW) + 'px)';
        dots();
      }
      if (prev) prev.addEventListener('click', function () { idx--; go(); });
      if (next) next.addEventListener('click', function () { idx++; go(); });
      window.addEventListener('resize', go);
      // Touch swipe — mobile users expect to drag these cards, not just tap arrows
      var touchStartX = 0, touchDX = 0, dragging = false;
      track.addEventListener('touchstart', function (e) {
        touchStartX = e.touches[0].clientX;
        dragging = true;
        track.style.transition = 'none';
      }, { passive: true });
      track.addEventListener('touchmove', function (e) {
        if (!dragging) return;
        touchDX = e.touches[0].clientX - touchStartX;
      }, { passive: true });
      track.addEventListener('touchend', function () {
        if (!dragging) return;
        dragging = false;
        track.style.transition = '';
        var threshold = 40; // px — small flicks shouldn't trigger a page change
        if (touchDX < -threshold) idx++;
        else if (touchDX > threshold) idx--;
        touchDX = 0;
        go();
      });
      go();
    });

    /* ---------- REVIEWS (localStorage per product) ---------- */
    var rvList = document.getElementById('rv-list');
    var rvForm = document.getElementById('rv-form');
    if (rvList) {
      var key = 'etc-rv-' + (document.body.getAttribute('data-product') || location.pathname);
      var stars = 5;
      function load() {
        var arr = [];
        try { arr = JSON.parse(localStorage.getItem(key) || '[]'); } catch (e) {}
        if (!arr.length) {
          rvList.innerHTML = '<div class="rv-empty">No reviews yet — be the first to rate this product.</div>';
          return;
        }
        rvList.innerHTML = arr.map(function (r) {
          return '<div class="rv-card"><div class="rv-top"><div><div class="rv-name">' + esc(r.name) +
            '</div><div class="rv-co">' + esc(r.co || '') + '</div></div><div class="rv-stars">' +
            '★'.repeat(r.stars) + '☆'.repeat(5 - r.stars) + '</div></div>' +
            '<div class="rv-text">' + esc(r.text) + '</div><div class="rv-dt">' + esc(r.dt) + '</div></div>';
        }).join('');
      }
      function esc(s) {
        return String(s || '').replace(/[&<>"']/g, function (c) {
          return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
      }
      document.querySelectorAll('.star-btn').forEach(function (b, i) {
        b.addEventListener('click', function () {
          stars = i + 1;
          document.querySelectorAll('.star-btn').forEach(function (x, j) {
            x.classList.toggle('on', j < stars);
          });
        });
      });
      document.querySelectorAll('.star-btn').forEach(function (x, j) { x.classList.toggle('on', j < stars); });
      if (rvForm) {
        rvForm.addEventListener('submit', function (ev) {
          ev.preventDefault();
          var d = {};
          new FormData(rvForm).forEach(function (v, k) { d[k] = String(v).trim(); });
          if (!d.name || !d.text) return;
          var arr = [];
          try { arr = JSON.parse(localStorage.getItem(key) || '[]'); } catch (e) {}
          arr.unshift({ name: d.name, co: d.co, text: d.text, stars: stars, dt: new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) });
          try { localStorage.setItem(key, JSON.stringify(arr.slice(0, 20))); } catch (e) {}
          rvForm.reset();
          load();
        });
      }
      load();
    }
  });
})();

/* ============================================================
   Product gallery controller — slide model.
   Slides = the product photos, plus the video when the product has
   real footage. Handles thumbnails, prev/next buttons, keyboard,
   touch swipe, the counter and gentle autoplay in one place, so the
   behaviour is identical on every product page without per-page wiring.
   Crossfade is done on the GPU (opacity only) to stay smooth.
   ============================================================ */
(function () {
  var REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function initGallery(gallery) {
    var main = gallery.querySelector('.pd-gallery-main');
    var img = gallery.querySelector('[data-main-img]');
    var videoWrap = gallery.querySelector('[data-main-video]');
    var video = videoWrap ? videoWrap.querySelector('video') : null;
    var counter = gallery.querySelector('[data-counter]');
    var thumbs = Array.prototype.slice.call(gallery.querySelectorAll('.pd-thumb'));
    if (!main || !img) return;

    // A product may have a single photo and no thumbnail strip. There is then
    // nothing to navigate: hide the arrows and counter and stop here, but leave
    // the image showing correctly.
    var navCount = thumbs.length || (img.getAttribute('src') ? 1 : 0);
    if (navCount < 2) {
      var pv = gallery.querySelector('.pd-prev'), nx = gallery.querySelector('.pd-next');
      if (pv) pv.style.display = 'none';
      if (nx) nx.style.display = 'none';
      if (counter) counter.style.display = 'none';
      if (thumbs.length === 1) thumbs[0].classList.add('on');
      return;
    }

    var index = 0, manual = false, hovered = false, visible = true, timer = null;
    var sources = thumbs.map(function (t) { return t.getAttribute('data-thumb-img') || ''; });

    // preload every photo once so switching never flashes an empty frame
    sources.forEach(function (src) { if (src) { var p = new Image(); p.src = src; } });

    function show(i, viaUser) {
      if (i === index && viaUser) return;
      index = (i + thumbs.length) % thumbs.length;
      var thumb = thumbs[index];
      thumbs.forEach(function (t) { t.classList.remove('on'); t.setAttribute('aria-current', 'false'); });
      thumb.classList.add('on');
      thumb.setAttribute('aria-current', 'true');
      if (counter) counter.textContent = (index + 1) + ' / ' + thumbs.length;

      if (thumb.hasAttribute('data-thumb-video') && videoWrap) {
        img.hidden = true;
        videoWrap.hidden = false;
        stopAuto();
        return;
      }
      if (video && !video.paused) video.pause();
      if (videoWrap) videoWrap.hidden = true;
      img.hidden = false;
      var src = sources[index];
      if (!src || img.getAttribute('src') === src) return;
      img.classList.add('pd-fade');
      var pre = new Image();
      pre.onload = pre.onerror = function () {
        img.src = src;
        requestAnimationFrame(function () { img.classList.remove('pd-fade'); });
      };
      pre.src = src;
    }

    function step(d) { manual = true; stopAuto(); show(index + d, true); }

    function startAuto() {
      if (REDUCED || manual || timer || thumbs.length < 2) return;
      timer = setInterval(function () {
        if (hovered || !visible || document.hidden) return;
        show(index + 1);
      }, 4200);
    }
    function stopAuto() { if (timer) { clearInterval(timer); timer = null; } }

    gallery.addEventListener('click', function (e) {
      var t = e.target.closest('.pd-thumb');
      if (t) { manual = true; stopAuto(); show(thumbs.indexOf(t), true); return; }
      if (e.target.closest('.pd-prev')) step(-1);
      else if (e.target.closest('.pd-next')) step(1);
    });

    // keyboard when the gallery has focus, and touch swipe on mobile
    gallery.setAttribute('tabindex', '0');
    gallery.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
    });
    var x0 = null;
    main.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; }, { passive: true });
    main.addEventListener('touchend', function (e) {
      if (x0 === null) return;
      var dx = e.changedTouches[0].clientX - x0;
      if (Math.abs(dx) > 45) step(dx < 0 ? 1 : -1);
      x0 = null;
    }, { passive: true });

    gallery.addEventListener('mouseenter', function () { hovered = true; });
    gallery.addEventListener('mouseleave', function () { hovered = false; });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (en) { visible = en[0].isIntersecting; }, { threshold: 0.15 })
        .observe(gallery);
    }

    show(0);
    startAuto();
  }

  function init() { document.querySelectorAll('[data-gallery]').forEach(initGallery); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

/* ── AUTOMATIC PRODUCT ANIMATIONS ────────────────────────────────────────────
   1) Product grids (.pgrid, .sim-grid): cards take turns in a soft amber
      "spotlight" while the grid is on screen — draws the eye across the range.
   2) Product detail gallery: photos auto-advance with a crossfade until the
      visitor clicks a thumbnail themselves (then manual control wins).
   Everything pauses when off-screen, while hovered, in background tabs, and
   switches off entirely under prefers-reduced-motion. */
(function () {
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  function initProductAnimations() {

  /* 1 — spotlight cycle across product cards */
  document.querySelectorAll('.pgrid, .sim-grid').forEach(function (grid) {
    var cards = grid.querySelectorAll('.pc, .sim-card');
    if (cards.length < 2) return;
    var i = -1, visible = false, hovered = false;
    function clearSpot() { cards.forEach(function (c) { c.classList.remove('pc-live'); }); }
    grid.addEventListener('mouseenter', function () { hovered = true; clearSpot(); });
    grid.addEventListener('mouseleave', function () { hovered = false; });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (en) {
        visible = en[0].isIntersecting;
        if (!visible) clearSpot();
      }, { threshold: 0.2 }).observe(grid);
    } else { visible = true; }
    setInterval(function () {
      if (!visible || hovered || document.hidden) return;
      clearSpot();
      i = (i + 1) % cards.length;
      cards[i].classList.add('pc-live');
    }, 2400);
  });

  /* 2 — gallery autoplay lives in the gallery controller (see above) */

  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initProductAnimations);
  } else {
    initProductAnimations();
  }
})();
