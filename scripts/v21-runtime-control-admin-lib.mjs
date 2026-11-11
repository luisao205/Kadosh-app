const CONTROL_PATH = 'sistema/v21RuntimeControl';

const versionOf = snapshot => snapshot.exists ? snapshot.updateTime.toDate().toISOString() : 'MISSING';

export const prepareV21RuntimeControl = async ({ db, projectId, expectedProjectId, operationId, enabled }) => {
  if (!db || projectId !== expectedProjectId) throw new Error('project_id_mismatch');
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(operationId || '')) throw new Error('operation_id_required');
  if (typeof enabled !== 'boolean') throw new Error('enabled_boolean_required');
  const snapshot = await db.doc(CONTROL_PATH).get();
  const current = snapshot.exists ? snapshot.data() : null;
  return {
    path: CONTROL_PATH,
    projectId,
    operationId,
    expectedUpdateTime: versionOf(snapshot),
    current,
    proposed: {
      schemaVersion: 1,
      enabled,
      projectId,
      version: Number(current?.version || 0) + 1,
      lastOperationId: operationId,
    },
  };
};

export const applyV21RuntimeControl = async ({ db, fieldValue, plan, expectedUpdateTime, actor }) => {
  if (!plan || expectedUpdateTime !== plan.expectedUpdateTime) throw new Error('expected_update_time_required');
  if (typeof actor !== 'string' || !actor.trim()) throw new Error('actor_required');
  const controlRef = db.doc(CONTROL_PATH);
  const auditRef = controlRef.collection('audit').doc(plan.operationId);
  return db.runTransaction(async transaction => {
    const [current, priorAudit] = await Promise.all([transaction.get(controlRef), transaction.get(auditRef)]);
    if (priorAudit.exists) {
      const audit = priorAudit.data();
      if (audit.expectedUpdateTime === expectedUpdateTime && audit.enabled === plan.proposed.enabled) {
        return { applied: false, idempotent: true, version: audit.version };
      }
      throw new Error('operation_id_conflict');
    }
    if (versionOf(current) !== expectedUpdateTime) throw new Error('cas_version_conflict');
    const next = { ...plan.proposed, updatedAt: fieldValue.serverTimestamp(), updatedBy: actor.trim() };
    transaction.set(controlRef, next, { merge: false });
    transaction.create(auditRef, {
      operationId: plan.operationId,
      projectId: plan.projectId,
      enabled: plan.proposed.enabled,
      version: plan.proposed.version,
      expectedUpdateTime,
      previousEnabled: current.exists ? current.data()?.enabled === true : null,
      actor: actor.trim(),
      createdAt: fieldValue.serverTimestamp(),
    });
    return { applied: true, idempotent: false, version: plan.proposed.version };
  });
};

export { CONTROL_PATH };
