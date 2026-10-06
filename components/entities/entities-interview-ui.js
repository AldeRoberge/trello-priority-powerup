/*
 * Role: UI of the Entity INTERVIEW, the default way to create an entity: type a name, then answer one short question
 * at a time. Each question shows a few suggestions with the best one highlighted: Enter keeps it, a digit picks
 * another, typing answers freely. The model and the web look things up in the background and the suggestions
 * improve while the user answers; nothing ever blocks. "Tout voir" opens the full page composer on the same draft.
 * Logic: EntitiesInterview (pure) and EntitiesInterviewAI (lookups). Same result as the page: EntitiesComposer.finalize.
 *
 * Usage: EntitiesInterviewUI.open({ t?, schema, entities, initialText?, initialTypes?, onDone(result), onClose? })
 *   result = { schema, entities, created, rootId, again, types }   (same as EntitiesComposerUI)
 *
 * REALITY MAP: as soon as the name is typed, EntitiesRealityAI builds in the background the map of what defines the
 * thing (contents, maker, parent company...) with parallel branch agents and a verifying orchestrator. The "Carte"
 * panel shows it growing; confident and verified nodes are built with the entity, the others wait for a click, any can
 * be switched off. The map never edits the answers: it is applied on top of the draft when the entity is created.
 *
 * Keys: Enter validate | ↑ ↓ choose | 1-9 pick (empty field) | Backspace on empty field: previous question |
 *       Alt+→ skip | Ctrl+Enter create now | Esc close
 *
 * Contents: 1 helpers | 2 open: state | 3 paint | 4 flow | 5 keys and boot
 */
(function (global) {
  'use strict';

  function EM() {
    return global.EntitiesModel;
  }
  function EC() {
    return global.EntitiesComposer;
  }
  function EI() {
    return global.EntitiesInterview;
  }
  function ER() {
    return global.EntitiesReality;
  }

  /* ── 1. Helpers ──────────────────────────────────────────────────── */

  function h(tag, attrs, children) {
    var el = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'value') el.value = v;
      else if (k.indexOf('on') === 0) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    });
    (children || []).forEach(function (c) {
      if (c != null) el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return el;
  }

  function icon(name) {
    return h('i', { class: 'ti ti-' + name, 'aria-hidden': 'true' });
  }

  function clone(o) {
    return o == null ? o : JSON.parse(JSON.stringify(o));
  }

  function pseudoOf(d) {
    return { id: d.id, name: d.name || 'Sans nom', types: d.types, aliases: d.aliases, relations: [], data: {}, updatedAt: '9', draft: true };
  }

  /* ── 2. Open: state ──────────────────────────────────────────────── */

  function open(ctx) {
    var st = {
      schema: ctx.schema,
      entities: ctx.entities,
      stage: 'name', // 'name' while the name is typed, then 'ask'
      draft: null,
      extras: [], // drafts of what the answers created (a person, a place...)
      hints: { det: '', types: [], candidates: {}, ask: [] },
      card: null,
      sel: -1,
      picked: false, // the highlighted option was chosen with the arrows (it wins over typed text)
      history: [],
      error: '',
      loading: false,
      confirmClose: false,
      seq: 0,
      reality: { plan: null, state: 'idle', excluded: {}, accepted: {}, open: true, run: null, hints: null },
    };
    var opener = document.activeElement;
    var timer = null;

    var els = {
      overlay: h('div', { class: 'cp-overlay' }),
      head: h('header', { class: 'cp-head iv-head' }),
      body: h('section', { class: 'iv-body', 'aria-live': 'polite' }),
      foot: h('footer', { class: 'cp-foot iv-foot' }),
    };
    var dialog = h('div', { class: 'cp-dialog iv-dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Nouvelle entité' }, [els.head, els.body, els.foot]);
    els.overlay.appendChild(dialog);
    var input = null;

    function pool() {
      return st.entities.concat(st.extras.map(pseudoOf));
    }
    function cx() {
      return { schema: st.schema, entities: pool(), draft: st.draft, hints: st.hints, now: new Date(), library: global.EntitiesLibrary };
    }
    /** The draft, its answers and the map applied on top: what is really created (see EntitiesReality.build). */
    function overlay() {
      var base = { schema: st.schema, draft: st.draft, extras: st.extras, reused: [] };
      var r = st.reality;
      if (!r.plan || !ER() || !st.draft) return base;
      try {
        var b = ER().build({ schema: st.schema, entities: pool(), draft: st.draft, library: global.EntitiesLibrary }, r.plan, r);
        return { schema: b.schema, draft: b.draft, extras: st.extras.concat(b.extras), reused: b.reused };
      } catch (e) {
        return base;
      }
    }
    function snapshot() {
      st.history.push({ schema: clone(st.schema), draft: clone(st.draft), extras: clone(st.extras), hints: st.hints, card: st.card, stage: st.stage });
    }

    /* ── 3. Paint ──────────────────────────────────────────────────── */

    function sourceBadge(o) {
      if (o.source === 'web') return h('span', { class: 'iv-src', title: 'Trouvé sur le web' }, [icon('world')]);
      if (o.source === 'ia') return h('span', { class: 'iv-src', title: 'Suggestion de l’assistant' }, [icon('sparkles')]);
      return null;
    }

    function paintHead() {
      els.head.textContent = '';
      els.head.appendChild(h('div', { class: 'cp-title' }, [icon('sparkles'), h('span', { text: st.draft && st.draft.name ? st.draft.name : 'Nouvelle entité' })]));
      if (st.confirmClose) {
        els.head.appendChild(
          h('div', { class: 'iv-confirm', role: 'alert' }, [
            h('span', { text: 'Abandonner cette entité ?' }),
            h('button', { class: 'cp-btn', type: 'button', onclick: function () { st.confirmClose = false; paint(); } }, ['Continuer']),
            h('button', { class: 'cp-btn cp-btn--danger', type: 'button', onclick: close }, ['Abandonner']),
          ])
        );
        return;
      }
      if (st.stage === 'ask') {
        els.head.appendChild(h('button', { class: 'cp-link', type: 'button', onclick: seeAll, title: 'Ouvrir la page complète avec tous les champs' }, [icon('layout-list'), 'Tout voir']));
      }
      els.head.appendChild(h('button', { class: 'cp-x cp-x--lg', type: 'button', 'aria-label': 'Fermer', onclick: requestClose }, [icon('x')]));
    }

    /** Thin bar: answers given out of the questions still to come. */
    function paintProgress() {
      if (st.stage !== 'ask') return null;
      var done = EI().thread(cx()).length;
      var total = done + EI().remaining(cx());
      if (!total) return null;
      var pct = Math.min(100, Math.round((done / total) * 100));
      return h('div', { class: 'iv-progress', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(pct) }, [h('span', { style: 'width:' + pct + '%' })]);
    }

    var STATE_WORDS = {
      planning: 'Je cherche ce qui définit cette chose…',
      exploring: 'J’explore plusieurs pistes en même temps…',
      verifying: 'Je vérifie la carte…',
    };

    function nodeAction(row) {
      var r = st.reality;
      if (row.status === 'on') r.excluded[row.ref] = true;
      else if (row.status === 'off') delete r.excluded[row.ref];
      else r.accepted[row.ref] = true;
      if (st.card && st.card.kind === 'done') paint();
      else repaintMap();
    }

    function paintMap() {
      var r = st.reality;
      var rows = r.plan && ER() ? ER().tree(r.plan, { schema: st.schema, entities: pool(), library: global.EntitiesLibrary }, r) : [];
      var working = !!STATE_WORDS[r.state];
      if (st.stage !== 'ask' || (!rows.length && !working)) return h('div', { class: 'iv-map iv-map--empty' });
      var on = rows.filter(function (x) { return x.status === 'on'; }).length;
      var wait = rows.filter(function (x) { return x.status === 'suggested' || x.status === 'pending'; }).length;
      var status = working ? STATE_WORDS[r.state] : on + ' ajouté' + (on > 1 ? 's' : '') + (wait ? ', ' + wait + ' à confirmer' : '');
      var head = h('div', { class: 'iv-map-head' }, [
        h('button', { class: 'iv-map-toggle', type: 'button', 'aria-expanded': r.open ? 'true' : 'false', onclick: function () { r.open = !r.open; repaintMap(); } }, [
          icon(working ? 'loader-2' : 'sitemap'),
          h('strong', { text: 'Carte' }),
          h('span', { text: status }),
          icon(r.open ? 'chevron-up' : 'chevron-down'),
        ]),
        working ? h('button', { class: 'cp-link', type: 'button', title: 'Arrêter la recherche', onclick: function () { stopReality(); repaintMap(); } }, ['Arrêter']) : null,
      ]);
      var box = h('div', { class: 'iv-map' + (working ? ' iv-map--busy' : '') }, [head]);
      var genres = r.plan && ER() ? ER().rootTypes(r.plan, { schema: st.schema, library: global.EntitiesLibrary }, r) : [];
      if (r.open && genres.length > 1) {
        // a genre is only a list of components: the thing can carry several, each one can be switched off
        var line = h('div', { class: 'iv-genres' }, [h('span', { text: 'Genres' })]);
        genres.forEach(function (g) {
          line.appendChild(
            h('button', { class: 'iv-genre' + (g.on ? ' is-on' : ''), type: 'button', 'aria-pressed': g.on ? 'true' : 'false', title: g.on ? 'Retirer ce genre' : 'Remettre ce genre', onclick: function () {
              if (g.on) r.excluded['type:' + g.id] = true;
              else delete r.excluded['type:' + g.id];
              repaintMap();
            } }, [icon(g.icon || 'stack-2'), g.name])
          );
        });
        box.appendChild(line);
      }
      if (!r.open || !rows.length) return box;
      var list = h('ul', { class: 'iv-map-list' });
      rows.forEach(function (row) {
        var verb = row.status === 'on' ? 'Retirer' : row.status === 'off' ? 'Remettre' : 'Ajouter';
        list.appendChild(
          h('li', { class: 'iv-node iv-node--' + row.status, style: '--depth:' + (row.depth - 1) }, [
            icon(row.icon || 'stack-2'),
            h('span', { class: 'iv-node-name', text: row.name }),
            row.typeName ? h('em', { text: row.typeName }) : null,
            row.via ? h('small', { text: row.via }) : null,
            row.existing ? h('small', { class: 'iv-node-has', text: 'existe déjà' }) : null,
            row.working ? h('span', { class: 'iv-node-spin', title: 'J’explore cette piste' }, [icon('loader-2')]) : null,
            row.source === 'web' ? h('span', { class: 'iv-src', title: 'Trouvé sur le web' }, [icon('world')]) : null,
            row.verified ? h('span', { class: 'iv-src', title: 'Vérifié' }, [icon('shield-check')]) : null,
            h('button', { class: 'iv-node-btn', type: 'button', title: verb, 'aria-label': verb + ' ' + row.name, onclick: function () { nodeAction(row); } }, [
              icon(row.status === 'on' ? 'check' : row.status === 'off' ? 'arrow-back-up' : 'plus'),
            ]),
          ])
        );
      });
      box.appendChild(list);
      return box;
    }

    function repaintMap() {
      var old = els.body.querySelector('.iv-map');
      if (old) old.parentNode.replaceChild(paintMap(), old);
    }

    function paintOptions(card) {
      if (!card.options.length) return null;
      var visible = st.text ? EI().matchOptions(card, st.text) : card.options.map(function (o, i) { return i; });
      var box = h('div', { class: 'iv-opts', role: 'listbox', 'aria-label': 'Suggestions' });
      visible.forEach(function (i, n) {
        var o = card.options[i];
        var cls = 'iv-opt' + (i === st.sel ? ' iv-opt--sel' : '') + (i === card.best ? ' iv-opt--best' : '');
        box.appendChild(
          h('button', { class: cls, type: 'button', role: 'option', 'aria-selected': i === st.sel ? 'true' : 'false', onclick: function () { st.sel = i; st.picked = true; submit(); } }, [
            h('kbd', { text: String(n + 1) }),
            o.icon ? icon(o.icon) : null,
            h('span', { class: 'iv-opt-label', text: o.label }),
            o.detail ? h('em', { text: o.detail }) : null,
            sourceBadge(o),
          ])
        );
      });
      if (!visible.length) box.appendChild(h('span', { class: 'cp-hint', text: 'Aucune suggestion : Entrée pour utiliser ce que vous avez tapé.' }));
      return box;
    }

    function dateHint() {
      var c = st.card;
      if (!c || !c.field || c.field.kind !== 'date' || !st.text || !global.QuickParse) return null;
      var w = global.QuickParse.parseWhen(st.text, new Date());
      return h('div', { class: 'iv-read', text: w ? '→ ' + w.label : 'Je ne comprends pas encore cette date.' });
    }

    function paintCard() {
      var c = st.card;
      var box = h('div', { class: 'iv-card' });
      if (!c) return box;
      box.appendChild(h('h2', { class: 'iv-q', text: c.question }));
      if (c.kind === 'batch') {
        var list = h('ul', { class: 'iv-batch' });
        c.items.forEach(function (it) {
          list.appendChild(h('li', {}, [h('em', { text: it.label }), h('span', { text: it.display }), h('span', { class: 'iv-src' }, [icon(it.source === 'web' ? 'world' : 'sparkles')])]));
        });
        box.appendChild(list);
      }
      if (c.kind === 'done') {
        var th = EI().thread(cx());
        box.appendChild(
          h('p', { class: 'cp-hint', text: th.length ? th.map(function (x) { return x.label + ' : ' + x.display; }).join(' · ') : 'Vous pourrez compléter la fiche plus tard.' })
        );
        var also = allDrafts().slice(1).map(function (d) { return d.name; });
        if (also.length) box.appendChild(h('p', { class: 'cp-hint', text: 'Sera aussi créé : ' + also.join(', ') + '.' }));
      } else {
        var opts = paintOptions(c);
        if (opts) box.appendChild(opts);
      }
      if (c.input) {
        input = h('input', {
          class: 'iv-input',
          type: 'text',
          autocomplete: 'off',
          'data-noenter': '1',
          placeholder: c.input.placeholder || 'Autre…',
          'aria-label': c.question,
          value: st.text || '',
          oninput: function () {
            st.text = input.value;
            st.picked = false;
            if (!st.text && st.card.best >= 0) st.sel = st.card.best;
            else if (st.text) {
              var m = EI().matchOptions(st.card, st.text);
              st.sel = m.length ? m[0] : -1;
            }
            repaintOptions();
          },
        });
        box.appendChild(input);
      } else {
        input = null;
      }
      var rd = dateHint();
      if (rd) box.appendChild(rd);
      if (st.error) box.appendChild(h('p', { class: 'iv-error', role: 'alert', text: st.error }));
      var status = st.loading ? 'Je cherche des idées…' : '';
      box.appendChild(h('p', { class: 'iv-status', text: status }));
      return box;
    }

    /** Only the suggestion row and the date hint change while typing: the field keeps focus. */
    function repaintOptions() {
      var old = els.body.querySelector('.iv-opts');
      var fresh = st.card ? paintOptions(st.card) : null;
      if (old && fresh) old.parentNode.replaceChild(fresh, old);
      var oldRead = els.body.querySelector('.iv-read');
      var rd = dateHint();
      if (oldRead && rd) oldRead.parentNode.replaceChild(rd, oldRead);
      else if (oldRead && !rd) oldRead.parentNode.removeChild(oldRead);
      else if (!oldRead && rd && input) input.parentNode.insertBefore(rd, input.nextSibling);
    }

    function paintName() {
      var box = h('div', { class: 'iv-card' }, [h('h2', { class: 'iv-q', text: 'Que voulez-vous ajouter ?' })]);
      input = h('input', {
        class: 'iv-input iv-input--lg',
        type: 'text',
        autocomplete: 'off',
        'data-noenter': '1',
        placeholder: 'Ex. : Tablette graphique',
        'aria-label': 'Nom',
        value: st.text || '',
        oninput: function () { st.text = input.value; },
      });
      box.appendChild(input);
      box.appendChild(h('p', { class: 'cp-hint', text: 'Tapez un nom, je pose ensuite les bonnes questions.' }));
      if (st.error) box.appendChild(h('p', { class: 'iv-error', role: 'alert', text: st.error }));
      return box;
    }

    function paintFoot() {
      els.foot.textContent = '';
      if (st.stage !== 'ask') {
        els.foot.appendChild(h('button', { class: 'cp-btn cp-btn--primary', type: 'button', onclick: submit }, [icon('arrow-right'), 'Continuer']));
        return;
      }
      els.foot.appendChild(h('button', { class: 'cp-btn', type: 'button', disabled: st.history.length ? null : true, onclick: goBack }, [icon('arrow-left'), 'Précédent']));
      if (st.card && st.card.kind === 'field') els.foot.appendChild(h('button', { class: 'cp-btn', type: 'button', onclick: skip, title: 'Alt + flèche droite' }, ['Passer']));
      els.foot.appendChild(h('span', { class: 'iv-spacer' }));
      if (!st.card || st.card.kind !== 'done') els.foot.appendChild(h('button', { class: 'cp-btn', type: 'button', onclick: function () { finish(false); }, title: 'Ctrl + Entrée' }, [icon('check'), 'Créer maintenant']));
      else {
        els.foot.appendChild(h('button', { class: 'cp-btn', type: 'button', onclick: function () { finish(true); } }, [icon('plus'), 'Créer et ajouter une autre']));
        els.foot.appendChild(h('button', { class: 'cp-btn cp-btn--primary', type: 'button', onclick: function () { finish(false); } }, [icon('check'), 'Créer']));
      }
    }

    function paint() {
      paintHead();
      els.body.textContent = '';
      var pg = paintProgress();
      if (pg) els.body.appendChild(pg);
      els.body.appendChild(st.stage === 'name' ? paintName() : paintCard());
      els.body.appendChild(paintMap());
      paintFoot();
      if (input) {
        input.focus();
        try {
          input.setSelectionRange(input.value.length, input.value.length);
        } catch (e) {
          /* ignore */
        }
      } else {
        var b = els.body.querySelector('.iv-opt--sel') || els.foot.querySelector('.cp-btn--primary');
        if (b) b.focus();
      }
    }

    /* ── 4. Flow ───────────────────────────────────────────────────── */

    function setCard(card) {
      st.card = card;
      st.text = '';
      st.picked = false;
      st.error = '';
      st.sel = card && card.best >= 0 ? card.best : -1;
    }

    function advance() {
      setCard(EI().next(cx()));
      paint();
      scheduleEnrich();
    }

    /** Looks things up in the background; the answer upgrades the current question unless the user is typing. */
    function scheduleEnrich() {
      clearTimeout(timer);
      if (!ctx.t || !global.EntitiesInterviewAI || !st.draft || !st.draft.name) return;
      var mine = ++st.seq;
      st.loading = true;
      refreshStatus();
      timer = setTimeout(function () {
        global.EntitiesInterviewAI.enrich(ctx.t, cx()).then(function (hints) {
          if (mine !== st.seq || !els.overlay.parentNode) return;
          st.loading = false;
          hints = withRealityHints(hints);
          var changed = JSON.stringify(hints) !== JSON.stringify(st.hints);
          st.hints = hints;
          if (changed && st.card && !st.text && !st.picked && st.card.kind !== 'sub') {
            var fresh = EI().next(cx());
            if (st.card.parent) fresh = st.card; // a sub question stays as it is
            setCard(fresh);
            paint();
          } else refreshStatus();
        });
      }, 350);
    }

    /** The model's hints plus what the map knows (the genre, the maker as brand): the map's ideas come first. */
    function withRealityHints(hints) {
      var rh = st.reality.hints;
      if (!rh) return hints;
      var out = global.EntitiesInterviewAI ? global.EntitiesInterviewAI.merge(hints, rh) : hints;
      Object.keys(rh.candidates).forEach(function (path) {
        var rest = ((hints.candidates || {})[path] || []).filter(function (c) {
          return !rh.candidates[path].some(function (x) { return EM().normKey(x.label) === EM().normKey(c.label); });
        });
        out.candidates[path] = rh.candidates[path].concat(rest);
      });
      return out;
    }

    function startReality() {
      stopReality();
      var RAI = global.EntitiesRealityAI;
      if (!ctx.t || !RAI || !st.draft || !st.draft.name) return;
      var r = (st.reality = { plan: null, state: 'planning', excluded: {}, accepted: {}, open: true, run: null, hints: null });
      r.run = RAI.run(
        ctx.t,
        { schema: st.schema, entities: pool(), name: st.draft.name, types: st.draft.types, library: global.EntitiesLibrary, now: new Date() },
        {
          onUpdate: function (plan, state) {
            if (st.reality !== r || !els.overlay.parentNode) return;
            r.plan = plan;
            r.state = state;
            r.hints = ER().hintsFromPlan(plan, cx());
            var next = withRealityHints(st.hints);
            var changed = JSON.stringify(next) !== JSON.stringify(st.hints);
            st.hints = next;
            if (changed && st.card && !st.text && !st.picked && !st.card.parent && st.card.kind !== 'done') {
              setCard(EI().next(cx()));
              paint();
            } else if (st.card && st.card.kind === 'done') paint();
            else repaintMap();
          },
        }
      );
    }

    function stopReality() {
      if (st.reality.run) st.reality.run.cancel();
      st.reality.state = st.reality.plan ? 'done' : 'idle';
    }

    function refreshStatus() {
      var s = els.body.querySelector('.iv-status');
      if (s && st.loading) s.textContent = 'Je cherche des idées…';
      else if (s && !st.loading && /cherche/.test(s.textContent)) s.textContent = '';
    }

    function startWith(text) {
      var raw = String(text || '').trim();
      if (!raw) {
        st.error = 'Donnez un nom pour commencer.';
        return paint();
      }
      var types = (ctx.initialTypes || []).filter(function (t) { return !!EM().findById(st.schema.types, t); });
      var draft = EC().newDraft({ types: types });
      var r = EC().readIntent(st.schema, st.entities, raw);
      draft = EC().pruneAnswers(st.schema, EC().applyIntent(st.schema, draft, r));
      draft.name = r.name || raw;
      var p = EI().prepare({ schema: st.schema, draft: draft, library: global.EntitiesLibrary });
      st.schema = p.schema;
      st.draft = p.draft;
      st.stage = 'ask';
      st.text = '';
      advance();
      startReality();
    }

    function apply(res) {
      if (res.error) {
        st.error = res.error;
        return paint();
      }
      if (res.sub) {
        snapshot();
        setCard(res.sub);
        paint();
        return;
      }
      snapshot();
      st.schema = res.schema;
      st.draft = res.draft;
      (res.extra || []).forEach(function (d) {
        if (!st.extras.some(function (x) { return x.id === d.id; })) st.extras.push(d);
      });
      advance();
    }

    function submit() {
      if (st.stage === 'name') return startWith(st.text);
      var c = st.card;
      if (!c) return;
      if (c.kind === 'done') return finish(false);
      var typed = (st.text || '').trim();
      var inputSpec;
      if (c.kind === 'batch') inputSpec = { option: st.sel >= 0 ? st.sel : 0 };
      else if (typed && !st.picked) inputSpec = { text: typed };
      else if (st.sel >= 0) inputSpec = { option: st.sel };
      else if (typed) inputSpec = { text: typed };
      else inputSpec = { skip: true };
      apply(EI().answer(cx(), c, inputSpec));
    }

    function skip() {
      if (!st.card || st.card.kind === 'done') return;
      apply(EI().answer(cx(), st.card, { skip: true }));
    }

    function goBack() {
      var s = st.history.pop();
      if (!s) return;
      st.schema = s.schema;
      st.draft = s.draft;
      st.extras = s.extras;
      st.hints = s.hints;
      st.stage = s.stage;
      setCard(s.card);
      paint();
    }

    function reopen(path) {
      snapshot();
      var r = EI().reopen(cx(), path);
      st.draft = r.draft;
      setCard(r.card);
      paint();
    }

    function allDrafts() {
      var o = overlay();
      return EI().reachable(o.draft.id, [o.draft].concat(o.extras));
    }

    function finish(again) {
      if (!st.draft || !st.draft.name) return;
      var o = overlay();
      var r = EC().finalize(o.schema, st.entities, allDrafts());
      if (r.skipped.length) {
        st.error = 'Impossible de créer : un nom manque ou existe déjà. Ouvrez « Tout voir » pour corriger.';
        return paint();
      }
      var res = { schema: o.schema, entities: r.entities, created: r.created, rootId: st.draft.id, again: !!again, types: o.draft.types.slice() };
      teardown();
      if (ctx.onDone) ctx.onDone(res);
    }

    /** The full page composer, on the same draft and the people or places the answers created. */
    function seeAll() {
      if (!global.EntitiesComposerUI || !st.draft) return;
      var drafts = allDrafts();
      var seeSchema = overlay().schema;
      teardown();
      global.EntitiesComposerUI.open({
        t: ctx.t,
        schema: seeSchema,
        entities: st.entities,
        initialDrafts: drafts,
        onDone: ctx.onDone,
        onClose: ctx.onClose,
      });
    }

    function requestClose() {
      if (st.stage === 'name' && !(st.text || '').trim()) return close();
      st.confirmClose = true;
      paint();
    }

    function teardown() {
      clearTimeout(timer);
      st.seq++;
      stopReality();
      document.removeEventListener('keydown', onKey, true);
      if (els.overlay.parentNode) els.overlay.parentNode.removeChild(els.overlay);
      try {
        if (opener && opener.focus) opener.focus();
      } catch (e) {
        /* ignore */
      }
    }

    function close() {
      teardown();
      if (ctx.onClose) ctx.onClose();
    }

    /* ── 5. Keys and boot ──────────────────────────────────────────── */

    function moveSel(dir) {
      var c = st.card;
      if (!c || !c.options.length) return;
      var vis = st.text ? EI().matchOptions(c, st.text) : c.options.map(function (o, i) { return i; });
      if (!vis.length) return;
      var at = vis.indexOf(st.sel);
      var nextAt = at < 0 ? (dir > 0 ? 0 : vis.length - 1) : (at + dir + vis.length) % vis.length;
      st.sel = vis[nextAt];
      st.picked = true;
      repaintOptions();
    }

    function onKey(ev) {
      if (ev.key === 'Escape') {
        ev.preventDefault();
        ev.stopPropagation();
        if (st.confirmClose) {
          st.confirmClose = false;
          paint();
        } else requestClose();
        return;
      }
      if (ev.key === 'Tab') {
        var f = Array.prototype.filter.call(dialog.querySelectorAll('button, input, [href]'), function (x) {
          return !x.disabled && x.offsetParent !== null;
        });
        if (!f.length) return;
        var first = f[0];
        var lastEl = f[f.length - 1];
        if (ev.shiftKey && document.activeElement === first) {
          ev.preventDefault();
          lastEl.focus();
        } else if (!ev.shiftKey && document.activeElement === lastEl) {
          ev.preventDefault();
          first.focus();
        }
        return;
      }
      if (st.confirmClose) return;
      var onInput = ev.target === input;
      if (ev.key === 'Enter' && (onInput || ev.target === document.body)) {
        ev.preventDefault();
        if (ev.ctrlKey || ev.metaKey) return st.stage === 'ask' ? finish(false) : startWith(st.text);
        return submit();
      }
      if (st.stage !== 'ask' || !onInput) return;
      if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
        ev.preventDefault();
        return moveSel(ev.key === 'ArrowDown' ? 1 : -1);
      }
      if (ev.altKey && ev.key === 'ArrowRight') {
        ev.preventDefault();
        return skip();
      }
      if (ev.key === 'Backspace' && !input.value && st.history.length) {
        ev.preventDefault();
        return goBack();
      }
      if (/^[1-9]$/.test(ev.key) && !input.value && st.card && st.card.options.length) {
        var vis = EI().matchOptions(st.card, '');
        var i = vis[+ev.key - 1];
        if (i !== undefined) {
          ev.preventDefault();
          st.sel = i;
          st.picked = true;
          submit();
        }
      }
    }

    document.addEventListener('keydown', onKey, true);
    els.overlay.addEventListener('mousedown', function (ev) {
      if (ev.target === els.overlay) requestClose();
    });
    document.body.appendChild(els.overlay);
    st.text = ctx.initialText || '';
    if (st.text.trim()) startWith(st.text);
    else paint();

    return { close: close, state: st, els: els, submit: submit, skip: skip, back: goBack, finish: finish };
  }

  global.EntitiesInterviewUI = { open: open };
})(typeof window !== 'undefined' ? window : this);
