/**
 * Escape text before inserting into innerHTML (model output, user-facing strings).
 */
'use strict';

window.nfEscapeHtml = function(s) {
  if (s == null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
};
