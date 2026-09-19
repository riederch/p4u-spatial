# XR Application Lifecycle v0.1 Conformance

## XRA-001 Bootstrap separation

Initial APK installation does not embed bridge, repository or federation credentials.

## XRA-002 Release integrity

A downloaded package whose SHA-256 differs from the release descriptor is rejected before installation.

## XRA-003 Signing identity

A package with an unexpected Android signing-certificate fingerprint is rejected even if its package digest is otherwise valid.

## XRA-004 Version monotonicity

The updater does not install a package with an Android version code less than or equal to the installed version through the normal update path.

## XRA-005 Durable outbox

Create pending primary XR data, perform an application update and restart.

Expected: pending scans/observations remain available and uploadable.

## XRA-006 Pairing continuity

Perform an application update without clearing application data.

Expected: device identity and refresh credential remain valid unless independently revoked or expired.

## XRA-007 Failed update

Interrupt download or fail package verification.

Expected: current application remains usable and primary local data is preserved.

## XRA-008 Channel isolation

A stable installation is not silently offered a beta-only release.

## XRA-009 Protocol independence

A newer application release does not require equal application and bridge versions; compatibility is decided from declared contract versions.
