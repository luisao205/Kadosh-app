/* global module */

const clone = value => value === undefined ? undefined : structuredClone(value);

class MockCloudinaryAdminTransport {
  constructor() {
    this.publicIdResponses = [];
    this.assetIdResponses = [];
    this.calls = [];
    this.externalCalls = 0;
  }

  enqueuePublicId(...responses) { this.publicIdResponses.push(...responses); }
  enqueueAssetId(...responses) { this.assetIdResponses.push(...responses); }

  async consume(method, request, queue) {
    this.calls.push({ method, request: clone(request) });
    if (queue.length === 0) throw new Error('mock_response_missing');
    const response = queue.shift();
    if (response instanceof Error) throw response;
    return clone(response);
  }

  getByPublicId(request) { return this.consume('publicId', request, this.publicIdResponses); }
  getByAssetId(request) { return this.consume('assetId', request, this.assetIdResponses); }
}

module.exports = { MockCloudinaryAdminTransport };
