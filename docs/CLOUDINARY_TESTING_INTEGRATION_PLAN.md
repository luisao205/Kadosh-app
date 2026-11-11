# Cloudinary Testing Integration Plan

Status: offline design only. No Cloudinary account, secret, endpoint, upload, or deployed Function is enabled.

## Preconditions

- Use a dedicated Cloudinary product environment containing no production assets.
- Confirm its folder mode from Cloudinary configuration. Do not infer it from delivery URLs.
- Create testing-only API credentials and store the secret with Firebase Functions Secrets.
- Confirm Admin API quotas, upload limits, allowed formats, derived-resource behavior, and cleanup costs.
- Use a fresh `demo-kadosh-e2e` Firestore Emulator instance and synthetic media only.
- Keep the HTTP transport disabled until its injected requester has reviewed TLS, timeout, redirect, and response-size controls.

## Controlled Test Sequence

1. Configure the verified cloud name, folder mode, allowed delivery hosts, and testing credentials in an isolated backend process.
2. Start Auth, Firestore, and Functions emulators for `demo-kadosh-e2e`; verify all effective hosts before seeding.
3. Authorize one small synthetic JPG and one small synthetic MP4 through the backend contract.
4. Upload with the server-generated signed parameters and `overwrite=false`.
5. Inspect through Admin API by public ID, then by returned immutable asset ID.
6. Verify cloud, asset ID, public ID, resource type, delivery type, namespace, owner, operation ID, creation time, URL, bytes, format, dimensions, duration, and codec.
7. Finalize against Firestore Emulator and verify one active record, one operation, and an audit trail.
8. Repeat finalization and concurrent finalization; verify idempotency and create-only behavior.
9. Run negative cases for altered namespace, public ID, asset ID, MIME, size, dimensions, duration, suspended actor, revoked permission, expired operation, 420/429, timeout, and Firestore failure.
10. Inventory provider assets and emulator operations by operation ID. Do not delete ambiguous resources automatically.
11. After review, delete only synthetic fixtures whose immutable asset IDs are recorded in the test audit, revoke testing credentials, remove secrets, and verify no process retains them.

## Failure Matrix

| Case | Expected state | Retry | Manual review / orphan evidence |
| --- | --- | --- | --- |
| Authorization rejected | No operation or unchanged prior operation | Only after correcting actor/request | Audit denial; no provider asset expected |
| Authorized, no upload | `pending` until expiry | Upload while valid or reauthorize after expiry | Expired pending operation, no asset ID |
| Upload succeeds, inspection fails | `pending`, never `active` | Yes for transient provider errors | Possible orphan; record operation/public ID and inspect manually |
| Upload succeeds, Firestore fails | `pending`, never falsely `active` | Yes; reinspect then retry transaction | Provider asset exists without active record |
| Duplicate upload authorization | Provider must not overwrite | Do not retry blindly | Compare immutable asset IDs and operation audit |
| Existing public ID conflict | `pending`; conflict rejected | Reauthorize only after review | Never attach historical asset to new operation |
| Cloudinary unavailable | `pending` | Bounded retry outside transaction | Provider error code/status only; no secret/body logs |
| Firestore unavailable | No partial commit | Retry transaction after provider reinspection | Provider asset may be orphaned temporarily |
| Account suspended before finalize | `pending`, finalize denied | No until account restored | Authorization and denial audit |
| Permission revoked before finalize | `pending`, finalize denied | No until permission restored | Authorization and denial audit |
| Expired before upload | Expired operation | Reauthorize; do not reuse old operation | No expected provider asset |
| Expired after upload | Not active | Manual reconciliation and new authorization | Provider asset is orphan candidate |

## Orphan Reconciliation

- Produce a read-only report joining pending/expired operations to provider results by exact namespace and immutable asset ID.
- Classify as matched, missing, ambiguous, already-associated, or orphan candidate.
- Require human approval for ambiguous or destructive action.
- Never reuse a historical public ID as proof of ownership for a new operation.
- Automated deletion and scheduled cleanup remain out of scope.

## Known Limits

- KADOSH's five-minute operation TTL does not cryptographically revoke an already-issued Cloudinary signature.
- Cloudinary and Firestore cannot be committed atomically.
- Codec, duration, bitrate, and processing state vary by asset type and provider processing; missing mandatory evidence blocks finalization.
- Real account folder mode, quotas, rate-limit headers, custom delivery domains, and metadata shape remain unverified.
