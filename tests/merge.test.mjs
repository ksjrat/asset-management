import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  mergePayloadPreservingPrivate,
  mergeCollection,
  recordTime,
} from '../js/sync-privacy.js';
import {
  stampLocalChanges,
  resetChangeBaseline,
  ensureTombstones,
  markRestored,
  pruneTombstones,
} from '../js/change-tracker.js';
import { extractSyncPayload, applyRemotePayload } from '../js/sync.js';

function emptyTombs() {
  return { assets: {}, transactions: {}, goals: {}, recurring: {} };
}

function baseAuth() {
  return {
    loggedIn: true,
    userName: 'A',
    userEmail: 'a@test.com',
    spouseName: '',
    spouseConnected: false,
    inviteCode: 'ABC123',
    inviteExpiresAt: null,
    householdId: 'ABC123',
    appPasswordSet: false,
    appPasswordSalt: null,
    appPasswordHash: null,
    policyAccepted: true,
    policyVersion: '1.0',
    onboardingDone: true,
    atStartScreen: false,
  };
}

function makeData(overrides = {}) {
  return {
    version: 1,
    auth: baseAuth(),
    settings: {
      snapshotDay: 28,
      hiddenCategories: [],
      lockOnLaunch: true,
      homeOwnerFilters: ['all'],
      homeOwnerFilter: 'all',
    },
    policyConsents: [],
    assets: { items: [], snapshots: [] },
    goals: [],
    budget: {
      setupDone: false,
      categories: [],
      monthlyPlan: {},
      actuals: {},
      subActuals: {},
      subItemsByCategory: {},
      subMonthlyPlan: {},
    },
    transactions: [],
    recurring: [],
    memos: [],
    guideChecks: {},
    tombstones: emptyTombs(),
    ...overrides,
  };
}

describe('tombstone delete propagation', () => {
  it('A deletes asset X → B still has older X → both merge results omit X', () => {
    const delAt = 2_000;
    const a = makeData({
      assets: { items: [], snapshots: [] },
      tombstones: { ...emptyTombs(), assets: { X: delAt } },
    });
    const b = makeData({
      assets: {
        items: [{ id: 'X', name: 'Stock', amount: 100, updatedAt: 1_000 }],
        snapshots: [],
      },
    });
    const ab = mergePayloadPreservingPrivate(structuredClone(a), structuredClone(b));
    const ba = mergePayloadPreservingPrivate(structuredClone(b), structuredClone(a));
    assert.equal(ab.assets.items.find((i) => i.id === 'X'), undefined);
    assert.equal(ba.assets.items.find((i) => i.id === 'X'), undefined);
  });

  it('edit after tombstone wins (updatedAt newer than tombstone)', () => {
    const a = makeData({
      assets: { items: [], snapshots: [] },
      tombstones: { ...emptyTombs(), assets: { X: 2_000 } },
    });
    const b = makeData({
      assets: {
        items: [{ id: 'X', name: 'Edited', amount: 200, updatedAt: 3_000 }],
        snapshots: [],
      },
    });
    const merged = mergePayloadPreservingPrivate(a, b);
    const x = merged.assets.items.find((i) => i.id === 'X');
    assert.ok(x);
    assert.equal(x.name, 'Edited');
    assert.equal(x.updatedAt, 3_000);
  });

  it('transaction delete propagates', () => {
    const a = makeData({
      transactions: [],
      tombstones: { ...emptyTombs(), transactions: { T1: 5_000 } },
    });
    const b = makeData({
      transactions: [{ id: 'T1', amount: 10, updatedAt: 1_000 }],
    });
    const merged = mergePayloadPreservingPrivate(a, b);
    assert.equal(merged.transactions.find((t) => t.id === 'T1'), undefined);
  });

  it('goal delete propagates', () => {
    const a = makeData({
      goals: [],
      tombstones: { ...emptyTombs(), goals: { G1: 5_000 } },
    });
    const b = makeData({
      goals: [{ id: 'G1', title: 'Travel', updatedAt: 1_000 }],
    });
    const merged = mergePayloadPreservingPrivate(a, b);
    assert.equal(merged.goals.find((g) => g.id === 'G1'), undefined);
  });
});

describe('concurrent field edits', () => {
  it('A edits asset1, B edits asset2 → both edits kept', () => {
    const a = makeData({
      assets: {
        items: [
          { id: '1', name: 'A-edit', amount: 10, updatedAt: 100 },
          { id: '2', name: 'orig2', amount: 20, updatedAt: 50 },
        ],
        snapshots: [],
      },
    });
    const b = makeData({
      assets: {
        items: [
          { id: '1', name: 'orig1', amount: 10, updatedAt: 50 },
          { id: '2', name: 'B-edit', amount: 99, updatedAt: 100 },
        ],
        snapshots: [],
      },
    });
    const merged = mergePayloadPreservingPrivate(a, b);
    const one = merged.assets.items.find((i) => i.id === '1');
    const two = merged.assets.items.find((i) => i.id === '2');
    assert.equal(one.name, 'A-edit');
    assert.equal(two.name, 'B-edit');
  });
});

describe('private assets', () => {
  it('local private asset wins over remote same id; extractSyncPayload omits it', () => {
    const local = makeData({
      assets: {
        items: [{ id: 'P', name: 'Secret', amount: 1, private: true, updatedAt: 1 }],
        snapshots: [],
      },
    });
    const remote = makeData({
      assets: {
        items: [{ id: 'P', name: 'PublicRemote', amount: 999, updatedAt: 9_999 }],
        snapshots: [],
      },
    });
    const merged = mergePayloadPreservingPrivate(local, remote);
    const p = merged.assets.items.find((i) => i.id === 'P');
    assert.equal(p.name, 'Secret');
    assert.equal(p.private, true);

    const payload = extractSyncPayload(merged);
    assert.equal(payload.assets.items.find((i) => i.id === 'P'), undefined);
  });
});

describe('legacy rows without updatedAt', () => {
  it('merges without throwing', () => {
    const a = makeData({
      assets: { items: [{ id: 'L', name: 'old', amount: 1, createdAt: '2020-01-01' }], snapshots: [] },
    });
    const b = makeData({
      assets: { items: [{ id: 'L', name: 'old2', amount: 2, createdAt: '2020-02-01' }], snapshots: [] },
    });
    assert.doesNotThrow(() => mergePayloadPreservingPrivate(a, b));
    const merged = mergePayloadPreservingPrivate(a, b);
    assert.ok(merged.assets.items.some((i) => i.id === 'L'));
    assert.equal(typeof recordTime(merged.assets.items[0]), 'number');
  });
});

describe('stampLocalChanges', () => {
  it('stamps edit updatedAt, creates tombstone on delete, no stamp after reset', () => {
    const data = makeData({
      assets: {
        items: [
          { id: 'A', name: 'one', amount: 1 },
          { id: 'B', name: 'two', amount: 2 },
        ],
        snapshots: [],
      },
    });
    resetChangeBaseline(data);

    data.assets.items[0].name = 'one-edited';
    data.assets.items = data.assets.items.filter((i) => i.id !== 'B');
    const now = 12_345;
    stampLocalChanges(data, now);

    assert.equal(data.assets.items[0].updatedAt, now);
    assert.equal(data.tombstones.assets.B, now);

    const before = structuredClone(data.assets.items[0]);
    stampLocalChanges(data, now + 1000);
    assert.equal(data.assets.items[0].updatedAt, before.updatedAt);
  });
});

describe('applyRemotePayload shrink guard', () => {
  it('does not reject when merged has fewer items (normal delete)', () => {
    const local = makeData({
      assets: {
        items: [
          { id: 'Keep', name: 'k', amount: 1, updatedAt: 10 },
          { id: 'Gone', name: 'g', amount: 2, updatedAt: 10 },
        ],
        snapshots: [],
      },
    });
    const remote = makeData({
      assets: {
        items: [{ id: 'Keep', name: 'k', amount: 1, updatedAt: 10 }],
        snapshots: [],
      },
      tombstones: { ...emptyTombs(), assets: { Gone: 20 } },
    });
    const { data, rejectedEmptyRemote } = applyRemotePayload(local, remote, Date.now());
    assert.equal(rejectedEmptyRemote, false);
    assert.equal(data.assets.items.find((i) => i.id === 'Gone'), undefined);
    assert.ok(data.assets.items.find((i) => i.id === 'Keep'));
  });
});

describe('mergeCollection tie-break', () => {
  it('keeps local when times equal', () => {
    const local = [{ id: '1', name: 'local', updatedAt: 100 }];
    const remote = [{ id: '1', name: 'remote', updatedAt: 100 }];
    const out = mergeCollection(local, remote, {});
    assert.equal(out.rows[0].name, 'local');
    assert.equal(out.localAhead, false);
  });
});

describe('ensureTombstones migration', () => {
  it('creates tombstones structure when missing', () => {
    const data = { assets: { items: [] } };
    ensureTombstones(data);
    assert.deepEqual(data.tombstones, emptyTombs());
  });
});

describe('needsPush', () => {
  it('local-only new asset → needsPush true', () => {
    const local = makeData({
      assets: {
        items: [
          { id: 'Shared', name: 's', amount: 1, updatedAt: 50 },
          { id: 'New', name: 'only-local', amount: 1, updatedAt: 100 },
        ],
        snapshots: [],
      },
    });
    const remote = makeData({
      assets: {
        items: [{ id: 'Shared', name: 's', amount: 1, updatedAt: 50 }],
        snapshots: [],
      },
    });
    const { needsPush, data } = applyRemotePayload(local, remote, Date.now());
    assert.equal(needsPush, true);
    assert.equal('_needsPush' in data, false);
  });

  it('identical local and remote → needsPush false', () => {
    const item = { id: '1', name: 'same', amount: 1, updatedAt: 100 };
    const local = makeData({ assets: { items: [structuredClone(item)], snapshots: [] } });
    const remote = makeData({ assets: { items: [structuredClone(item)], snapshots: [] } });
    const { needsPush } = applyRemotePayload(local, remote, Date.now());
    assert.equal(needsPush, false);
  });

  it('only remote newer → needsPush false', () => {
    const local = makeData({
      assets: {
        items: [{ id: '1', name: 'old', amount: 1, updatedAt: 50 }],
        snapshots: [],
      },
    });
    const remote = makeData({
      assets: {
        items: [{ id: '1', name: 'new', amount: 2, updatedAt: 200 }],
        snapshots: [],
      },
    });
    const { needsPush, data } = applyRemotePayload(local, remote, Date.now());
    assert.equal(needsPush, false);
    assert.equal(data.assets.items[0].name, 'new');
  });

  it('local-only tombstone → needsPush true', () => {
    const shared = { id: 'Shared', name: 's', amount: 1, updatedAt: 50 };
    const local = makeData({
      assets: { items: [structuredClone(shared)], snapshots: [] },
      tombstones: { ...emptyTombs(), assets: { Gone: 5_000 } },
    });
    const remote = makeData({
      assets: { items: [structuredClone(shared)], snapshots: [] },
      tombstones: emptyTombs(),
    });
    const { needsPush } = applyRemotePayload(local, remote, Date.now());
    assert.equal(needsPush, true);
  });

  it('merged data and extractSyncPayload omit _needsPush', () => {
    const local = makeData({
      assets: {
        items: [
          { id: 'Shared', name: 's', amount: 1, updatedAt: 50 },
          { id: 'New', name: 'only-local', amount: 1, updatedAt: 100 },
        ],
        snapshots: [],
      },
    });
    const remote = makeData({
      assets: {
        items: [{ id: 'Shared', name: 's', amount: 1, updatedAt: 50 }],
        snapshots: [],
      },
    });
    const { data, needsPush } = applyRemotePayload(local, remote, Date.now());
    assert.equal(needsPush, true);
    assert.equal('_needsPush' in data, false);
    const payload = extractSyncPayload(data);
    assert.equal('_needsPush' in payload, false);
  });
});

describe('markRestored', () => {
  it('revives only missing/tombstoned rows; keeps shared updatedAt and post-backup tombs', () => {
    const prev = makeData({
      assets: {
        items: [
          { id: 'Shared', name: 's', amount: 1, updatedAt: 10 },
          { id: 'Extra', name: 'e', amount: 2, updatedAt: 10 },
        ],
        snapshots: [],
      },
      tombstones: {
        ...emptyTombs(),
        assets: { Revived: 99, PostBackupDel: 200 },
      },
    });
    const backup = makeData({
      assets: {
        items: [
          { id: 'Shared', name: 's', amount: 1, updatedAt: 10 },
          { id: 'Missing', name: 'm', amount: 3, updatedAt: 5 },
          { id: 'Revived', name: 'r', amount: 4, updatedAt: 5 },
        ],
        snapshots: [],
      },
      tombstones: emptyTombs(),
    });
    const now = 50_000;
    markRestored(backup, prev, now);

    assert.equal(backup.assets.items.find((i) => i.id === 'Missing').updatedAt, now);
    assert.equal(backup.assets.items.find((i) => i.id === 'Revived').updatedAt, now);
    assert.equal(backup.tombstones.assets.Revived, undefined);
    assert.equal(backup.assets.items.find((i) => i.id === 'Shared').updatedAt, 10);
    assert.equal(backup.tombstones.assets.PostBackupDel, 200);
    assert.equal(backup.tombstones.assets.Extra, undefined);

    stampLocalChanges(backup, now + 1);
    assert.equal(backup.tombstones.assets.Extra, undefined);
  });
});

describe('pruneTombstones', () => {
  it('drops entries older than 180 days without mutating input', () => {
    const old = Date.now() - 200 * 24 * 60 * 60 * 1000;
    const recent = Date.now() - 10 * 24 * 60 * 60 * 1000;
    const input = {
      assets: { oldId: old, freshId: recent },
      transactions: {},
      goals: {},
      recurring: {},
    };
    const frozen = structuredClone(input);
    const out = pruneTombstones(input);
    assert.deepEqual(input, frozen);
    assert.equal(out.assets.oldId, undefined);
    assert.equal(out.assets.freshId, recent);
  });
});
