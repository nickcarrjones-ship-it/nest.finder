/**
 * toast.js — Maloca toast notifications
 *
 * Replaces browser alert() popups with styled, auto-dismissing messages.
 * Mobile-first: anchored to the bottom of the screen above the thumb zone,
 * full-width on small screens, respects iPhone safe-area insets.
 *
 * Usage:
 *   Toast.show('Saved!');                  // neutral
 *   Toast.show('Linked!', 'success');      // green accent
 *   Toast.show('Code not found', 'error'); // red accent, stays longer
 */
'use strict';

window.Toast = (function() {

  var DISMISS_MS = { info: 3500, success: 3500, error: 5000 };
  var _hideTimer = null;

  function _ensureContainer() {
    var el = document.getElementById('nf-toast');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'nf-toast';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.addEventListener('click', hide);
    document.body.appendChild(el);
    return el;
  }

  function show(message, type) {
    type = DISMISS_MS[type] ? type : 'info';
    var el = _ensureContainer();
    el.textContent = message;
    el.className = 'nf-toast--' + type;

    // restart the entrance animation if a toast is already showing
    el.classList.remove('nf-toast--visible');
    void el.offsetWidth;
    el.classList.add('nf-toast--visible');

    clearTimeout(_hideTimer);
    _hideTimer = setTimeout(hide, DISMISS_MS[type]);
  }

  function hide() {
    var el = document.getElementById('nf-toast');
    if (el) el.classList.remove('nf-toast--visible');
    clearTimeout(_hideTimer);
  }

  return { show: show, hide: hide };
})();
