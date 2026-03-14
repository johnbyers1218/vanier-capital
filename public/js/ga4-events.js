/**
 * GA4 Custom Event Tracking — Vanier Capital
 *
 * Tracks: page context, CTA clicks, contact form submissions,
 * newsletter signups, investor club applications, article reads,
 * executive communication views, portfolio asset views,
 * outbound links, and scroll depth.
 *
 * Requires gtag() to already be loaded via the Google tag in <head>.
 */
(function () {
  'use strict';

  // Guard: only run if gtag is available
  if (typeof gtag !== 'function') return;

  // ── Helpers ──────────────────────────────────────────────────────
  function sendEvent(eventName, params) {
    gtag('event', eventName, params || {});
  }

  // Safely read meta content
  function getMeta(name) {
    var el = document.querySelector('meta[name="' + name + '"]');
    return el ? el.getAttribute('content') : '';
  }

  // ── 1. Enhanced Page-Context Event ──────────────────────────────
  // Fires once on every page to capture page-level metadata
  // (supplements the automatic page_view from gtag config)
  (function pageContext() {
    var path = window.location.pathname;
    var params = { page_path: path };

    // Detect content type from URL pattern
    if (/^\/blog\/[^/]+/.test(path)) {
      params.content_type = 'article';
      params.content_group = 'Perspectives';
      var h1 = document.querySelector('h1');
      if (h1) params.article_title = h1.textContent.trim();
    } else if (/^\/firm\/communications\/[^/]+/.test(path)) {
      params.content_type = 'executive_communication';
      params.content_group = 'Executive Communications';
      var h1c = document.querySelector('h1');
      if (h1c) params.article_title = h1c.textContent.trim();
    } else if (/^\/portfolio\/[^/]+/.test(path)) {
      params.content_type = 'portfolio_asset';
      params.content_group = 'Portfolio';
      var h1p = document.querySelector('h1');
      if (h1p) params.asset_name = h1p.textContent.trim();
    } else if (/^\/perspectives/.test(path)) {
      params.content_group = 'Perspectives';
    } else if (/^\/firm/.test(path)) {
      params.content_group = 'The Firm';
    } else if (/^\/investors/.test(path)) {
      params.content_group = 'Investors';
    } else if (/^\/contact/.test(path)) {
      params.content_group = 'Contact';
    } else if (/^\/strateg/.test(path)) {
      params.content_group = 'Strategy';
    } else if (path === '/') {
      params.content_group = 'Homepage';
    }

    sendEvent('page_context', params);
  })();

  // ── 2. CTA Button Click Tracking ───────────────────────────────
  // Tracks all anchor and button clicks that match CTA patterns
  document.addEventListener('click', function (e) {
    var el = e.target.closest('a, button');
    if (!el) return;

    var text = (el.textContent || '').trim().substring(0, 80);
    var href = el.getAttribute('href') || '';
    var isButton = el.tagName === 'BUTTON';

    // Skip trivial navigation (same-page anchors, empty)
    if (!href && !isButton) return;

    // Outbound link detection
    if (href && /^https?:\/\//i.test(href) && !href.includes('vaniercapital.com')) {
      sendEvent('outbound_click', {
        link_url: href,
        link_text: text,
      });
      return;
    }

    // CTA pattern matching: institutional buttons, tracking-worthy links
    var isCTA =
      el.classList.contains('btn-institutional-secondary') ||
      el.classList.contains('cta-button') ||
      /bg-\[#0f2e22\]/.test(el.className) ||
      /uppercase.*tracking-wider/.test(el.className) ||
      /Explore|View|Apply|Submit|Join|Request|Download|Learn More|Contact/i.test(text);

    if (isCTA) {
      sendEvent('cta_click', {
        cta_text: text,
        cta_url: href || 'button',
        cta_location: window.location.pathname,
      });
    }
  });

  // ── 3. Contact Form Submission ─────────────────────────────────
  (function trackContactForm() {
    var form = document.getElementById('contact-form');
    if (!form) return;

    form.addEventListener('submit', function () {
      var subjectEl = document.getElementById('subject');
      var subject = subjectEl ? (subjectEl.value || subjectEl.textContent || '').trim() : 'General';

      sendEvent('contact_form_submit', {
        form_type: 'contact',
        contact_subject: subject,
        page_path: window.location.pathname,
      });
    });
  })();

  // ── 4. Newsletter Subscription ─────────────────────────────────
  (function trackNewsletter() {
    var form = document.getElementById('newsletter-form') || document.getElementById('footer-newsletter-form');
    if (!form) return;

    form.addEventListener('submit', function () {
      sendEvent('newsletter_signup', {
        form_location: window.location.pathname,
      });
    });
  })();

  // ── 5. Investor Club Application ───────────────────────────────
  (function trackInvestorApply() {
    var form = document.getElementById('investor-apply-form');
    if (!form) return;

    form.addEventListener('submit', function () {
      sendEvent('investor_application_submit', {
        form_type: 'investor_vetting',
        page_path: window.location.pathname,
      });
    });
  })();

  // ── 6. Article / Exec Comm Read Tracking ───────────────────────
  // Fires when user scrolls past 50% of an article body
  (function trackArticleRead() {
    var article = document.querySelector('.editorial-content') || document.querySelector('article');
    if (!article) return;

    var path = window.location.pathname;
    var isBlog = /^\/blog\//.test(path);
    var isExecComm = /^\/firm\/communications\//.test(path);
    if (!isBlog && !isExecComm) return;

    var hasFired = false;
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting && !hasFired) {
            hasFired = true;
            var h1 = document.querySelector('h1');
            sendEvent('article_read', {
              article_title: h1 ? h1.textContent.trim() : document.title,
              content_type: isBlog ? 'article' : 'executive_communication',
              page_path: path,
            });
            observer.disconnect();
          }
        });
      },
      { threshold: 0.1 }
    );

    // Observe the midpoint of the article
    var children = article.children;
    var midChild = children[Math.floor(children.length / 2)];
    if (midChild) {
      observer.observe(midChild);
    } else {
      observer.observe(article);
    }
  })();

  // ── 7. Portfolio Asset View ────────────────────────────────────
  (function trackPortfolioView() {
    var path = window.location.pathname;
    if (!/^\/portfolio\/[^/]+/.test(path)) return;

    var h1 = document.querySelector('h1');
    sendEvent('portfolio_asset_view', {
      asset_name: h1 ? h1.textContent.trim() : document.title,
      page_path: path,
    });
  })();

  // ── 8. Scroll Depth Tracking ───────────────────────────────────
  // Fires at 25%, 50%, 75%, 100% scroll milestones
  (function trackScrollDepth() {
    var milestones = [25, 50, 75, 100];
    var fired = {};

    function getScrollPercent() {
      var docHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (docHeight <= 0) return 100;
      return Math.round((window.scrollY / docHeight) * 100);
    }

    var throttle;
    window.addEventListener('scroll', function () {
      clearTimeout(throttle);
      throttle = setTimeout(function () {
        var pct = getScrollPercent();
        milestones.forEach(function (m) {
          if (pct >= m && !fired[m]) {
            fired[m] = true;
            sendEvent('scroll_depth', {
              depth_threshold: m,
              page_path: window.location.pathname,
            });
          }
        });
      }, 200);
    });
  })();

  // ── 9. Data Room / PDF Download Tracking ───────────────────────
  document.addEventListener('click', function (e) {
    var el = e.target.closest('a[download], a[href$=".pdf"]');
    if (!el) return;

    sendEvent('file_download', {
      file_url: el.getAttribute('href') || '',
      link_text: (el.textContent || '').trim().substring(0, 80),
      page_path: window.location.pathname,
    });
  });

})();
