/* Day's End: Google Docs sync engine.
   Pure planning functions (no network) plus a thin API wrapper whose fetch and token source are injected,
   so the index maths can be tested without Google. Each day is one section in the doc, headed
   "YYYY-MM-DD · Weekday D Month YYYY". Saving a day replaces that day's section in place, and a new day
   is inserted in date order. The doc always ends with one empty trailing paragraph that belongs to the
   last section. */
(function (root) {
  'use strict';

  var DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var HEAD_RE = /^(\d{4}-\d{2}-\d{2}) · /;
  var HB = { yes: 'Yes', sofar: 'So-so', no: 'No' };

  function prettyDate(k) {
    var p = k.split('-');
    var d = new Date(+p[0], +p[1] - 1, +p[2]);
    return DOW[d.getDay()] + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear();
  }
  function has(v) { return !!(v && String(v).trim()); }
  function isEmptyEntry(e) {
    if (!e) return true;
    var t = ['proud', 'other', 'better', 'comfortWhat', 'kindWhat', 'feel', 'tomorrow'];
    var s = ['move', 'sleep', 'eat', 'comfort', 'kind'];
    return !t.some(function (f) { return has(e[f]); }) && !s.some(function (f) { return e[f]; });
  }
  function withWhat(flag, what) {
    var a = flag ? HB[flag] : '';
    if (has(what)) a += (a ? ' – ' : '') + String(what).trim();
    return a;
  }

  /* One day as paragraphs: [{t, kind}] where kind is h (heading), l (label), a (answer). */
  function sectionParas(e) {
    var paras = [{ t: e.date + ' · ' + prettyDate(e.date), kind: 'h' }];
    function q(label, ans) {
      if (!has(ans)) return;
      paras.push({ t: label, kind: 'l' });
      String(ans).split(/\r?\n/).forEach(function (line) { if (line.trim()) paras.push({ t: line.trim(), kind: 'a' }); });
    }
    q('Happy or proud', e.proud);
    q('Other things I did', e.other);
    q('Could have done better', e.better);
    q('Body and health', [['Exercise', e.move], ['Sleep', e.sleep], ['Eating', e.eat]]
      .filter(function (r) { return r[1]; }).map(function (r) { return r[0] + ': ' + HB[r[1]]; }).join('  ·  '));
    q('Outside my comfort zone', withWhat(e.comfort, e.comfortWhat));
    q('Something kind for someone', withWhat(e.kind, e.kindWhat));
    q('Feeling', e.feel);
    q('Tomorrow I would like to', e.tomorrow);
    return paras;
  }

  function sectionOf(e) {
    var paras = sectionParas(e), text = '', labels = [], headLen = 0;
    paras.forEach(function (p, i) {
      var start = text.length;
      text += p.t + '\n';
      if (p.kind === 'h') headLen = text.length;
      if (p.kind === 'l') labels.push([start, start + p.t.length]);
    });
    return { text: text, headLen: headLen, labels: labels };
  }

  /* Reads a documents.get response into paragraphs with indices. */
  function parseDoc(doc) {
    var content = (doc && doc.body && doc.body.content) || [];
    var paras = [], endIndex = 1;
    content.forEach(function (it) {
      if (typeof it.endIndex === 'number') endIndex = Math.max(endIndex, it.endIndex);
      if (it.paragraph) {
        var text = (it.paragraph.elements || []).map(function (el) { return el.textRun ? el.textRun.content : ''; }).join('');
        paras.push({ start: it.startIndex || 0, end: it.endIndex, text: text });
      }
    });
    return { paras: paras, endIndex: endIndex };
  }

  function findSections(model) {
    var secs = [];
    model.paras.forEach(function (p) {
      var m = HEAD_RE.exec(p.text);
      if (m) secs.push({ date: m[1], start: p.start });
    });
    return secs;
  }

  /* Returns the batchUpdate requests that make the doc show this entry, or [] when nothing changes. */
  function planUpsert(doc, entry) {
    var model = parseDoc(doc), secs = findSections(model), docEnd = model.endIndex;
    var idx = -1, i, reqs = [], pos;
    for (i = 0; i < secs.length; i++) if (secs[i].date === entry.date) idx = i;
    var empty = isEmptyEntry(entry);

    if (idx > -1) {
      var s = secs[idx].start;
      var e = idx + 1 < secs.length ? secs[idx + 1].start : docEnd - 1;
      if (e > s) reqs.push({ deleteContentRange: { range: { startIndex: s, endIndex: e } } });
      pos = s;
    } else {
      if (empty) return [];
      var next = null;
      for (i = 0; i < secs.length; i++) if (secs[i].date > entry.date) { next = secs[i]; break; }
      pos = next ? next.start : docEnd - 1;
    }
    if (empty) return reqs;

    var sec = sectionOf(entry), end = pos + sec.text.length;
    reqs.push({ insertText: { location: { index: pos }, text: sec.text } });
    reqs.push({ updateParagraphStyle: { range: { startIndex: pos, endIndex: end }, paragraphStyle: { namedStyleType: 'NORMAL_TEXT' }, fields: 'namedStyleType' } });
    reqs.push({ updateParagraphStyle: { range: { startIndex: pos, endIndex: pos + sec.headLen }, paragraphStyle: { namedStyleType: 'HEADING_2' }, fields: 'namedStyleType' } });
    reqs.push({ updateTextStyle: { range: { startIndex: pos, endIndex: end }, textStyle: { bold: false }, fields: 'bold' } });
    sec.labels.forEach(function (l) {
      reqs.push({ updateTextStyle: { range: { startIndex: pos + l[0], endIndex: pos + l[1] }, textStyle: { bold: true }, fields: 'bold' } });
    });
    return reqs;
  }

  /* ---------- network layer ---------- */
  function makeApi(fetchFn, getToken) {
    async function call(method, url, body) {
      var tok = await getToken();
      var r = await fetchFn(url, {
        method: method,
        headers: { 'Authorization': 'Bearer ' + tok, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined
      });
      if (r.status === 401) { var a = new Error('auth'); a.code = 'auth'; throw a; }
      if (!r.ok) {
        var t = ''; try { t = await r.text(); } catch (x) {}
        var e = new Error('Docs API ' + r.status + ': ' + t.slice(0, 200));
        e.status = r.status; e.body = t; throw e;
      }
      return r.json();
    }
    var FIELDS = 'revisionId,body(content(startIndex,endIndex,paragraph(elements(textRun(content)))))';
    return {
      createDoc: function (title) { return call('POST', 'https://docs.googleapis.com/v1/documents', { title: title }); },
      getDoc: function (id) { return call('GET', 'https://docs.googleapis.com/v1/documents/' + encodeURIComponent(id) + '?fields=' + encodeURIComponent(FIELDS)); },
      batch: function (id, requests, rev) {
        var b = { requests: requests };
        if (rev) b.writeControl = { requiredRevisionId: rev };
        return call('POST', 'https://docs.googleapis.com/v1/documents/' + encodeURIComponent(id) + ':batchUpdate', b);
      }
    };
  }

  /* Reads the doc fresh, plans, applies. Retries when the doc changed between the read and the write. */
  async function syncEntry(api, docId, entry) {
    for (var attempt = 0; attempt < 3; attempt++) {
      var doc = await api.getDoc(docId);
      var reqs = planUpsert(doc, entry);
      if (!reqs.length) return false;
      try { await api.batch(docId, reqs, doc.revisionId); return true; }
      catch (e) {
        if (e.status === 400 && /revision/i.test(e.body || '') && attempt < 2) continue;
        throw e;
      }
    }
    return false;
  }

  var api = { prettyDate: prettyDate, isEmptyEntry: isEmptyEntry, sectionOf: sectionOf, parseDoc: parseDoc, findSections: findSections, planUpsert: planUpsert, makeApi: makeApi, syncEntry: syncEntry };
  root.DocSync = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
