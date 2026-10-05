// Trello webhook payload -> Activities. Pure: no I/O.
// Every board action becomes one or more activity rows (who did what, before/after), so the
// Activities tab is a full audit trail of what people do in Trello.

import { COLUMNS } from './columns.js';

const VERBS = {
  createCard: 'créée',
  deleteCard: 'supprimée',
  copyCard: 'copiée',
  moveCardToBoard: 'déplacée vers un autre tableau',
  moveCardFromBoard: 'déplacée depuis un autre tableau',
  commentCard: 'commentaire',
  addMemberToCard: 'membre ajouté',
  removeMemberFromCard: 'membre retiré',
  addLabelToCard: 'étiquette ajoutée',
  removeLabelFromCard: 'étiquette retirée',
  addChecklistToCard: 'liste de tâches ajoutée',
  removeChecklistFromCard: 'liste de tâches retirée',
  createCheckItem: 'tâche ajoutée',
  updateCheckItemStateOnCard: 'tâche cochée/décochée',
  addAttachmentToCard: 'pièce jointe ajoutée',
  deleteAttachmentFromCard: 'pièce jointe retirée',
};

const label = (key) => (COLUMNS[key] ? COLUMNS[key].header : key);

/**
 * Documents of the Power-Up's Document view are archived cards named "📄 Title" (see
 * components/docs/docs-trello.js). They autosave a lot and are not tasks, so their webhook events
 * must neither fill the Activities tab nor trigger a Sheet sync.
 */
export function isDocumentAction(payload) {
  const card = payload && payload.action && payload.action.data && payload.action.data.card;
  return !!(card && typeof card.name === 'string' && card.name.startsWith('📄'));
}

/**
 * Entities of the Power-Up's Entities view are archived cards named "🧩 Name" (see
 * components/entities/entities-trello.js). Same reasoning as documents, and no Drive copy either.
 */
export function isEntityAction(payload) {
  const card = payload && payload.action && payload.action.data && payload.action.data.card;
  return !!(card && typeof card.name === 'string' && card.name.startsWith('🧩'));
}

/**
 * @returns {{activities: object[], cardId: string|null}}  each activity:
 *   { user, origin:'Trello', action, card, cardId, field, fieldKey, before, after, ref, at }
 */
export function describeAction(payload) {
  const action = payload && payload.action;
  if (!action || !action.type || isDocumentAction(payload) || isEntityAction(payload)) return { activities: [], cardId: null };
  const d = action.data || {};
  const card = d.card || {};
  const base = {
    user: (action.memberCreator && (action.memberCreator.fullName || action.memberCreator.username)) || 'Trello',
    origin: 'Trello',
    card: card.name || '',
    cardId: card.id || null,
    ref: action.id || '',
    at: action.date ? new Date(action.date) : new Date(),
  };
  const out = [];
  const add = (o) => out.push({ ...base, field: '', fieldKey: null, before: '', after: '', ...o });

  if (action.type === 'updateCard') {
    const old = d.old || {};
    if ('name' in old) add({ action: 'modifiée', field: label('name'), fieldKey: 'name', before: old.name, after: card.name });
    if ('desc' in old) add({ action: 'modifiée', field: label('desc'), fieldKey: 'desc', before: old.desc, after: card.desc });
    if ('idList' in old) {
      add({
        action: 'déplacée',
        field: label('statut'),
        fieldKey: 'statut',
        before: d.listBefore ? d.listBefore.name : '',
        after: d.listAfter ? d.listAfter.name : '',
      });
    }
    if ('closed' in old) add({ action: card.closed ? 'archivée' : 'restaurée', fieldKey: 'closed' });
    if ('due' in old) add({ action: 'modifiée', field: label('due'), fieldKey: 'due', before: old.due || '', after: card.due || '' });
    if ('dueComplete' in old) add({ action: card.dueComplete ? 'échéance terminée' : 'échéance rouverte', fieldKey: 'due' });
    if ('start' in old) add({ action: 'modifiée', field: 'Début', fieldKey: 'start', before: old.start || '', after: card.start || '' });
    return { activities: out, cardId: card.id || null };
  }

  if (action.type === 'updateCustomFieldItem') {
    const cf = d.customField || {};
    const item = d.customFieldItem || {};
    const value = item.value && (item.value.text || item.value.number || item.value.date || item.value.checked);
    add({
      action: 'modifiée',
      field: cf.name || 'Champ personnalisé',
      fieldKey: cf.name === COLUMNS.category.header ? 'category' : 'custom',
      after: value == null ? '' : String(value),
    });
    return { activities: out, cardId: card.id || null };
  }

  if (action.type === 'commentCard') {
    add({ action: VERBS.commentCard, after: d.text || '' });
    return { activities: out, cardId: card.id || null };
  }

  if (action.type === 'createCard') {
    add({ action: VERBS.createCard, field: label('statut'), fieldKey: 'statut', after: d.list ? d.list.name : '' });
    return { activities: out, cardId: card.id || null };
  }

  if (VERBS[action.type]) {
    const detail = (d.member && d.member.name) || (d.label && d.label.name) || (d.checklist && d.checklist.name) || (d.checkItem && d.checkItem.name) || (d.attachment && d.attachment.name) || '';
    add({ action: VERBS[action.type], after: detail });
    return { activities: out, cardId: card.id || null };
  }

  return { activities: [], cardId: card.id || null }; // list/board-level actions are not card activity
}

/**
 * True when this Trello activity is just the echo of a change the Worker itself made a moment ago
 * (Sheet -> Trello), so it must not be attributed to a Trello user.
 * @param {{cardId:string,fieldKey:string|null}} activity
 * @param {{cardId:string,field:string,at:number}[]} recentWrites
 */
export function isEcho(activity, recentWrites, nowMs = Date.now(), windowMs = 90_000) {
  return (recentWrites || []).some(
    (w) =>
      w.cardId === activity.cardId &&
      nowMs - w.at <= windowMs &&
      (w.field === '*' || w.field === activity.fieldKey),
  );
}
