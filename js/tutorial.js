/**
 * tutorial.js
 * ─────────────────────────────────────────────────────────────
 * Spotlight tutorial guide for Maloca.
 *
 * - Auto-shows until the user signs in with Google
 * - A "? Guide" button in the header always reopens it
 * - Highlights real UI elements with a copper frame
 * - Switches to each relevant tab as you step through
 * ─────────────────────────────────────────────────────────────
 */

window.TutorialManager = (function () {
  'use strict';

  var STEPS = [
    {
      icon: '🏡',
      heading: 'Welcome to Maloca',
      text: 'Finding a home together is one of the biggest decisions you\'ll make. Maloca is your calm, organised companion — cutting through the noise so you can focus on what actually matters to both of you.',
      targetId: null,
      tabName: null
    },
    {
      icon: '✨',
      heading: 'Your AI filter',
      text: 'Tell the Maloca Agent what you care about in plain English. It reads your setup profile and colour-codes every area on the map — green for a good fit, amber for a trade-off, red to avoid. Ask it anything and it refines the colours live.',
      targetId: 'tab-filter',
      tabName: 'filter'
    },
    {
      icon: '🔍',
      heading: 'Finding real listings',
      text: 'Once your areas are colour-coded, Search pulls live listings from Rightmove and Zoopla. Set your budget and bedrooms up top, and Maloca finds properties only in areas that actually work for both your commutes.',
      targetId: 'tab-search',
      tabName: 'search'
    },
    {
      icon: '📍',
      heading: 'Exploring a neighbourhood',
      text: 'Tap any coloured bubble on the map to open its Area panel. You\'ll see commute times from both your stations, local transport links, parks, shops, schools, and ratings from both of you — all in one place.',
      targetId: 'tab-area',
      tabName: 'area'
    },
    {
      icon: '📅',
      heading: 'Keeping track of viewings',
      text: 'Log every viewing with an address, date, and notes. Maloca keeps them in a calendar so you never lose track of what you\'ve seen, what\'s coming up, and what you want to revisit.',
      targetId: 'tab-viewings',
      tabName: 'viewings'
    },
    {
      icon: '🏆',
      heading: 'Your shared shortlist',
      text: 'Once you\'ve rated areas, Rankings lines them up as a league table — both your scores side by side so you can agree on a shortlist without the spreadsheet.',
      targetId: 'tab-shortlist',
      tabName: 'shortlist'
    },
    {
      icon: '🗺️',
      heading: 'You\'re all set',
      text: 'Your areas are already being colour-coded in the background. By the time you close this, the map will be ready — just tap any bubble to start exploring.',
      targetId: null,
      tabName: null
    }
  ];

  var currentStep = 0;
  var cardEl = null;
  var overlayEl = null;
  var frameEl = null;

  // ── Public: called by map.html on DOMContentLoaded ──────────
  function init() {
    document.addEventListener('DOMContentLoaded', function () {
      injectGuideButton();
      if (!localStorage.getItem('tutorialSeen')) {
        // Short delay so the map tiles have a moment to start loading
        setTimeout(show, 700);
      }
    });
  }

  // ── Inject "? Guide" button next to the auth container ──────
  // We insert it as a sibling BEFORE #auth-container so that
  // auth.js replacing authContainer.innerHTML doesn't destroy it.
  function injectGuideButton() {
    var authContainer = document.getElementById('auth-container');
    if (!authContainer || document.getElementById('tutorial-guide-btn')) return;
    var btn = document.createElement('button');
    btn.id = 'tutorial-guide-btn';
    btn.textContent = '? Guide';
    btn.onclick = function () {
      currentStep = 0;
      show();
    };
    authContainer.parentNode.insertBefore(btn, authContainer);
  }

  // ── Build and show the tutorial ──────────────────────────────
  function show() {
    if (document.getElementById('tut-overlay')) return; // already open

    // Dark backdrop — blocks all clicks behind the card
    overlayEl = document.createElement('div');
    overlayEl.id = 'tut-overlay';
    document.body.appendChild(overlayEl);

    // Spotlight frame — copper border that floats over the target element
    frameEl = document.createElement('div');
    frameEl.id = 'tut-frame';
    document.body.appendChild(frameEl);

    // Tutorial card
    cardEl = document.createElement('div');
    cardEl.id = 'tut-card';
    cardEl.innerHTML = [
      '<div class="tut-icon"   id="tut-icon"></div>',
      '<div class="tut-heading" id="tut-heading"></div>',
      '<div class="tut-text"   id="tut-text"></div>',
      '<div class="tut-counter" id="tut-counter"></div>',
      '<div class="tut-footer">',
      '  <button class="tut-btn-skip" id="tut-skip"',
      '          onclick="TutorialManager.skip()">Skip</button>',
      '  <span class="tut-spacer"></span>',
      '  <button class="tut-btn-back" id="tut-back"',
      '          onclick="TutorialManager.goBack()">← Back</button>',
      '  <button class="tut-btn-next" id="tut-next"',
      '          onclick="TutorialManager.goNext()">Next →</button>',
      '</div>'
    ].join('');
    document.body.appendChild(cardEl);

    renderStep(currentStep);
  }

  // ── Render a specific step ───────────────────────────────────
  function renderStep(index) {
    if (!cardEl) return;
    var step  = STEPS[index];
    var total = STEPS.length;
    var isFirst = index === 0;
    var isLast  = index === total - 1;

    document.getElementById('tut-icon').textContent    = step.icon;
    document.getElementById('tut-heading').textContent = step.heading;
    document.getElementById('tut-text').textContent    = step.text;
    document.getElementById('tut-counter').textContent = (index + 1) + ' of ' + total;

    document.getElementById('tut-back').style.visibility = isFirst ? 'hidden' : 'visible';
    document.getElementById('tut-next').textContent = isLast ? 'Let\'s go →' : 'Next →';
    document.getElementById('tut-skip').style.display = isLast ? 'none' : '';

    // Switch tab if this step has one
    if (step.tabName && typeof switchTab === 'function') {
      switchTab(step.tabName);
    }

    // Position spotlight frame + card
    if (step.targetId) {
      var targetEl = document.getElementById(step.targetId);
      // Only spotlight if element is actually visible (some tabs are display:none)
      if (targetEl && targetEl.offsetParent !== null) {
        positionFrame(targetEl);
        positionCard(targetEl);
        frameEl.style.display = 'block';
        return;
      }
    }
    // Fallback: no spotlight, card centered
    frameEl.style.display = 'none';
    centerCard();
  }

  // ── Position the copper spotlight frame over an element ──────
  function positionFrame(el) {
    var rect = el.getBoundingClientRect();
    var pad  = 6; // breathing room around the element
    frameEl.style.top    = (rect.top  - pad) + 'px';
    frameEl.style.left   = (rect.left - pad) + 'px';
    frameEl.style.width  = (rect.width  + pad * 2) + 'px';
    frameEl.style.height = (rect.height + pad * 2) + 'px';
  }

  // ── Position the card to the right of (or centered on) target ─
  function positionCard(el) {
    var rect   = el.getBoundingClientRect();
    var cardW  = 280;
    var cardH  = 240; // approximate
    var margin = 16;
    var viewW  = window.innerWidth;
    var viewH  = window.innerHeight;

    // Prefer right of element; fall back to left; fall back to centered
    var left = rect.right + margin;
    if (left + cardW > viewW - margin) {
      left = rect.left - cardW - margin;
    }
    if (left < margin) {
      centerCard();
      return;
    }

    // Vertically align to middle of target, clamped to viewport
    var top = rect.top + (rect.height / 2) - (cardH / 2);
    top = Math.max(margin, Math.min(viewH - cardH - margin, top));

    cardEl.style.left      = left + 'px';
    cardEl.style.top       = top  + 'px';
    cardEl.style.transform = 'none';
  }

  function centerCard() {
    cardEl.style.left      = '50%';
    cardEl.style.top       = '50%';
    cardEl.style.transform = 'translate(-50%, -50%)';
  }

  // ── Navigation ───────────────────────────────────────────────
  function goNext() {
    if (currentStep >= STEPS.length - 1) {
      closeTutorial();
    } else {
      currentStep++;
      renderStep(currentStep);
    }
  }

  function goBack() {
    if (currentStep > 0) {
      currentStep--;
      renderStep(currentStep);
    }
  }

  function skip() {
    closeTutorial();
  }

  // ── Close and mark as seen ───────────────────────────────────
  function closeTutorial() {
    localStorage.setItem('tutorialSeen', 'true');
    if (overlayEl && overlayEl.parentNode) overlayEl.parentNode.removeChild(overlayEl);
    if (frameEl   && frameEl.parentNode)   frameEl.parentNode.removeChild(frameEl);
    if (cardEl    && cardEl.parentNode)    cardEl.parentNode.removeChild(cardEl);
    overlayEl = null;
    frameEl   = null;
    cardEl    = null;
  }

  // ── Called by auth.js on successful sign-in ──────────────────
  function onSignIn() {
    localStorage.setItem('tutorialSeen', 'true');
    if (document.getElementById('tut-overlay')) {
      closeTutorial();
    }
  }

  return {
    init:     init,
    goNext:   goNext,
    goBack:   goBack,
    skip:     skip,
    onSignIn: onSignIn
  };

})();
