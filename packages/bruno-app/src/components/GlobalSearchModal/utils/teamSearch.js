import { SEARCH_TYPES, MATCH_TYPES } from '../constants';
import { TEAM_PREFIX } from 'providers/ReduxStore/slices/backend';

/**
 * Maps `GET /workspaces/:id/search` hits onto the result shape the modal
 * already renders and navigates with.
 *
 * A team hit can name an item the renderer has never loaded, so `item` is
 * synthesized from the hit rather than looked up in Redux — enough for the row
 * to render and for `revealTeamItem` to walk down to the real one.
 */

const MATCHED_ON_TO_MATCH_TYPE = {
  url: MATCH_TYPES.URL,
  tag: MATCH_TYPES.PATH,
  method: MATCH_TYPES.PATH,
  description: MATCH_TYPES.PATH
};

const matchTypeFor = (hit) => {
  if (hit.matchedOn && MATCHED_ON_TO_MATCH_TYPE[hit.matchedOn]) {
    return MATCHED_ON_TO_MATCH_TYPE[hit.matchedOn];
  }
  if (hit.type === SEARCH_TYPES.COLLECTION) return MATCH_TYPES.COLLECTION;
  if (hit.type === SEARCH_TYPES.FOLDER) return MATCH_TYPES.FOLDER;
  return MATCH_TYPES.REQUEST;
};

/** "Orders API/v2/orders/List orders" — the breadcrumb shown under the name. */
const displayPath = (hit) =>
  [hit.collectionName, ...(hit.path || []).map((segment) => segment.name), hit.name]
    .filter(Boolean)
    .join('/');

export const teamHitToResult = (hit) => {
  const collectionUid = TEAM_PREFIX + hit.collectionId;
  const base = {
    path: displayPath(hit),
    matchType: matchTypeFor(hit),
    collectionUid,
    // Kept so handleResultSelection can load the way down to the item.
    teamHit: hit
  };

  if (hit.type === SEARCH_TYPES.COLLECTION) {
    return {
      ...base,
      type: SEARCH_TYPES.COLLECTION,
      name: hit.name,
      path: hit.collectionName,
      item: { uid: collectionUid, name: hit.name }
    };
  }

  if (hit.type === SEARCH_TYPES.FOLDER) {
    return {
      ...base,
      type: SEARCH_TYPES.FOLDER,
      name: hit.name,
      item: { uid: hit.id, name: hit.name, type: 'folder' }
    };
  }

  return {
    ...base,
    type: SEARCH_TYPES.REQUEST,
    name: hit.name,
    method: hit.method || '',
    item: {
      uid: hit.id,
      name: hit.name,
      // The backend's `kind` is already Bruno's item type (http-request, ...).
      type: hit.kind,
      request: { method: hit.method || '', url: hit.url || '' }
    }
  };
};

export const teamHitsToResults = (hits = []) => hits.map(teamHitToResult);
