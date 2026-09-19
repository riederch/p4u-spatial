# RCHKB Spatial pilot: Bärenwirt LW

The first real RCHKB projection is stored in the `riederch/rchkb` repository under:

```text
Bärenwirt LW/_agents/spatial/
```

The pilot intentionally starts with one object whose identity already exists canonically in RCHKB:

```text
asset:baerenwirt-lw:kwb-usv-80
```

Its canonical RCHKB page declares `asset_id: kwb-usv-80` and documents the concrete KWB USV 80 installation. The projection therefore does not invent a new equipment identity.

No coordinates, floor, room or exact indoor position are asserted. The pilot uses `precision: relative-only` until stronger spatial evidence is added to RCHKB.

A bridge pointed at the RCHKB repository can expose the pilot with:

```bash
P4U_REPOSITORY_PROVIDER=git
P4U_REPOSITORY_PROFILE=rchkb
P4U_RCHKB_ROOT='Bärenwirt LW'
P4U_GIT_REMOTE_URL=<RCHKB git remote>
P4U_GIT_BRANCH=main
```

Expected Spatial behavior:

- the source route is `rchkb-git`;
- the source is read-only unless explicitly opted into projection writes;
- the `assets` collection exists because `assets.jsonl` exists;
- `GET .../collections/assets/items` contains `asset:baerenwirt-lw:kwb-usv-80`;
- absent model files are not exposed as empty collections;
- source and collection revisions are derived from the actual repository bytes.

This pilot is deliberately small. It proves the repository/profile boundary before building geometry or broader asset inventories.
