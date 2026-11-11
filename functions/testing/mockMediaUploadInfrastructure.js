/* global module */
const clone = value => value === undefined ? undefined : structuredClone(value);

class InMemoryMediaUploadRepository {
  constructor() {
    this.operations = new Map();
    this.resources = new Map();
    this.audit = [];
    this.queue = Promise.resolve();
    this.failNextCommit = false;
  }

  async runTransaction(callback) {
    const run = this.queue.then(async () => {
      const operations = new Map([...this.operations].map(([key, value]) => [key, clone(value)]));
      const resources = new Map([...this.resources].map(([key, value]) => [key, clone(value)]));
      const audit = this.audit.map(clone);
      const transaction = {
        getOperation: async id => clone(operations.get(id)),
        setOperation: async (id, value) => operations.set(id, clone(value)),
        createResource: async (id, value) => {
          if (resources.has(id)) throw new Error('resource_already_exists');
          resources.set(id, clone(value));
        },
        appendAudit: async value => audit.push(clone(value)),
      };
      const result = await callback(transaction);
      if (this.failNextCommit) {
        this.failNextCommit = false;
        throw new Error('simulated_transaction_failure');
      }
      this.operations = operations;
      this.resources = resources;
      this.audit = audit;
      return clone(result);
    });
    this.queue = run.catch(() => undefined);
    return run;
  }
}

class MockMediaProvider {
  constructor() {
    this.authorizations = [];
    this.inspections = [];
    this.resources = new Map();
    this.externalCalls = 0;
    this.authorizationError = null;
    this.inspectionError = null;
  }

  async createAuthorization(request) {
    this.authorizations.push(clone(request));
    if (this.authorizationError) throw this.authorizationError;
    return { mode: 'mock-only', signature: null, timestamp: request.issuedAt, expiresAt: request.expiresAt, parameters: { folder: request.folder, publicId: request.publicId, resourceType: request.resourceType } };
  }

  async inspectResource(request) {
    this.inspections.push(clone(request));
    if (this.inspectionError) throw this.inspectionError;
    return clone(this.resources.get(request.publicId) || { exists: false });
  }

  setResource(resource) {
    this.resources.set(resource.publicId, clone(resource));
  }

  failAuthorizationWith(error) {
    this.authorizationError = error;
  }

  failInspectionWith(error) {
    this.inspectionError = error;
  }
}

module.exports = { InMemoryMediaUploadRepository, MockMediaProvider };
