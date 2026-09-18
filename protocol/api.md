# Compatibility: Legacy Bridge API

The bridge API is now classified as the **XR profile**, not the common protocol API.

Canonical documentation:

- [XR Profile](xr/README.md)
- [XR Bridge Profile API](xr/bridge-api.md)
- [XR Pairing](xr/pairing.md)
- [Core Contract](core/README.md)

The historical P4U base path `/api/v1` may remain as an implementation compatibility alias. New clients MUST discover the XR contract URL through Core discovery instead of assuming this path.
