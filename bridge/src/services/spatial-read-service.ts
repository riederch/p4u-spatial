import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { BridgeError } from "../errors.js";
import type { RepositoryProvider } from "../repository/provider.js";
import { AtomicJsonStore } from "../storage/atomic-json-store.js";
import { atomicWrite, newId, nowIso, resolveBelow, sha256 } from "../util.js";

type ItemKind = "feature" | "relation";
type SpatialItem = Record<string, unknown>;

interface SourceState {
  sourceId?: string;
}

interface CollectionDefinition {
  id: string;
  title: string;
  itemKind: ItemKind;
  fileName: string;
}

interface LoadedCollection extends CollectionDefinition {
  revision: string;
  items: SpatialItem[];
}

interface LoadedState {
  sourceId: string;
  sourceRevision: string;
  viewRevision: string;
  collections: LoadedCollection[];
}

interface StoredSnapshot {
  snapshotId: string;
  sourceId: string;
  principalId: string;
  sourceRevision: string;
  viewRevision: string;
  createdAt: string;
  expiresAt: string;
  collections: Array<{
    id: string;
    title: string;
    itemKind: ItemKind;
    revision: string;
    items: SpatialItem[];
  }>;
}

const COLLECTIONS: readonly CollectionDefinition[] = [
  { id: "buildings", title: "Buildings", itemKind: "feature", fileName: "buildings.jsonl" },
  { id: "floors", title: "Floors", itemKind: "feature", fileName: "floors.jsonl" },
  { id: "rooms", title: "Rooms", itemKind: "feature", fileName: "rooms.jsonl" },
  { id: "assets", title: "Assets", itemKind: "feature", fileName: "assets.jsonl" },
  { id: "landmarks", title: "Landmarks", itemKind: "feature", fileName: "landmarks.jsonl" },
  { id: "relations", title: "Relations", itemKind: "relation", fileName: "relations.jsonl" },
];

function parseJsonl(data: Uint8Array, path: string): SpatialItem[] {
  const text = Buffer.from(data).toString("utf8");
  const result: SpatialItem[] = [];

  for (const [index, rawLine] of text.split(/\r?\n/).entries()) {
    const line = rawLine.trim();
    if (!line) continue;

    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      throw new BridgeError(500, "SPATIAL_MODEL_INVALID", `Invalid JSON in ${path} at line ${index + 1}.`);
    }

    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new BridgeError(500, "SPATIAL_MODEL_INVALID", `Expected JSON object in ${path} at line ${index + 1}.`);
    }
    result.push(value as SpatialItem);
  }

  return result;
}

function itemId(item: SpatialItem): string | null {
  for (const key of ["objectId", "id", "relationId"]) {
    const value = item[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return null;
}

// ADR: docs/adr/contracts/0006-source-route-identity.md — local source authority is stable and separate from the route used to reach it.
export class SpatialReadService {
  private readonly sourceStore: AtomicJsonStore<SourceState>;
  private readonly snapshotRoot: string;

  constructor(
    stateDir: string,
    private readonly repository: RepositoryProvider,
    private readonly spatialRoot: string,
    private readonly sourceTitle: string,
    private readonly routeId: string,
    private readonly writable: boolean,
    private readonly snapshotTtlSeconds: number,
    private readonly operationRetentionSeconds: number,
  ) {
    this.sourceStore = new AtomicJsonStore(join(stateDir, "spatial-source.json"), () => ({}));
    this.snapshotRoot = join(stateDir, "spatial-snapshots");
  }

  async sourceId(): Promise<string> {
    const current = await this.sourceStore.read();
    if (current.sourceId) return current.sourceId;

    return this.sourceStore.mutate((state) => {
      state.sourceId ??= newId();
      return state.sourceId;
    });
  }

  async assertSource(sourceId: string): Promise<void> {
    if (sourceId !== await this.sourceId()) {
      throw new BridgeError(404, "SOURCE_NOT_FOUND", "Spatial source not found.");
    }
  }

  private async loadCollection(definition: CollectionDefinition): Promise<LoadedCollection | null> {
    const path = `${this.spatialRoot}/model/${definition.fileName}`;
    const data = await this.repository.readFile(path);
    if (!data) return null;

    const items = parseJsonl(data, path);
    for (const item of items) {
      if (!itemId(item)) {
        throw new BridgeError(500, "SPATIAL_MODEL_INVALID", `Item without id/objectId/relationId in ${path}.`);
      }
    }

    return {
      ...definition,
      revision: `sha256:${sha256(data)}`,
      items,
    };
  }

  private async loadState(): Promise<LoadedState> {
    const collections: LoadedCollection[] = [];
    for (const definition of COLLECTIONS) {
      const loaded = await this.loadCollection(definition);
      if (loaded) collections.push(loaded);
    }

    const sourceRevision = `sha256:${sha256(Buffer.from(
      collections.map((collection) => `${collection.id}\n${collection.revision}`).join("\n"),
    ))}`;

    return {
      sourceId: await this.sourceId(),
      sourceRevision,
      viewRevision: sourceRevision,
      collections,
    };
  }

  private collectionMetadata(collection: LoadedCollection, baseUrl: string, sourceId: string) {
    const root = `${baseUrl}/spatial/v1/sources/${encodeURIComponent(sourceId)}/collections/${encodeURIComponent(collection.id)}`;
    return {
      id: collection.id,
      title: collection.title,
      itemKind: collection.itemKind,
      revision: collection.revision,
      itemCount: collection.items.length,
      permissions: {
        read: true,
        create: this.writable,
        update: this.writable,
        delete: this.writable,
      },
      sync: {
        snapshot: true,
        delta: false,
      },
      links: [
        { rel: "self", href: root },
        { rel: "items", href: `${root}/items` },
      ],
    };
  }

  async sourceDescriptor(baseUrl: string) {
    const state = await this.loadState();
    const root = `${baseUrl}/spatial/v1/sources/${encodeURIComponent(state.sourceId)}`;
    return {
      sourceId: state.sourceId,
      title: this.sourceTitle,
      sourceRevision: state.sourceRevision,
      route: {
        routeId: this.routeId,
        kind: "direct",
      },
      access: {
        viewRevision: state.viewRevision,
      },
      delivery: {
        mode: "live",
        freshness: "current",
        observedAt: nowIso(),
      },
      capabilities: [
        "spatial.read",
        "spatial.snapshots",
        "spatial.artifacts.read",
        ...(this.writable
          ? ["spatial.create", "spatial.update", "spatial.delete", "spatial.artifacts.write"]
          : []),
      ],
      ...(this.writable ? {
        writePolicy: {
          operationRetentionSeconds: this.operationRetentionSeconds,
          clientAssignedObjectIds: true,
        },
      } : {}),
      links: [
        { rel: "self", href: root },
        { rel: "collections", href: `${root}/collections` },
        { rel: "snapshots", href: `${root}/snapshots` },
        { rel: "operations", href: `${baseUrl}/spatial/v1/operations` },
        ...(this.writable ? [{ rel: "artifact-uploads", href: `${root}/artifact-uploads` }] : []),
      ],
    };
  }

  async listCollections(baseUrl: string) {
    const state = await this.loadState();
    return {
      sourceId: state.sourceId,
      viewRevision: state.viewRevision,
      collections: state.collections.map((collection) => this.collectionMetadata(collection, baseUrl, state.sourceId)),
    };
  }

  async getCollection(collectionId: string, baseUrl: string) {
    const state = await this.loadState();
    const collection = state.collections.find((item) => item.id === collectionId);
    if (!collection) throw new BridgeError(404, "COLLECTION_NOT_FOUND", "Spatial collection not found.");
    return this.collectionMetadata(collection, baseUrl, state.sourceId);
  }

  async listItems(collectionId: string): Promise<{ items: SpatialItem[] }> {
    const state = await this.loadState();
    const collection = state.collections.find((item) => item.id === collectionId);
    if (!collection) throw new BridgeError(404, "COLLECTION_NOT_FOUND", "Spatial collection not found.");
    return { items: collection.items };
  }

  async getItem(collectionId: string, objectId: string): Promise<SpatialItem> {
    const state = await this.loadState();
    const collection = state.collections.find((item) => item.id === collectionId);
    if (!collection) throw new BridgeError(404, "COLLECTION_NOT_FOUND", "Spatial collection not found.");
    const item = collection.items.find((candidate) => itemId(candidate) === objectId);
    if (!item) throw new BridgeError(404, "OBJECT_NOT_FOUND", "Spatial object not found.");
    return item;
  }

  private snapshotPath(snapshotId: string): string {
    return resolveBelow(this.snapshotRoot, `${snapshotId}.json`);
  }

  async createSnapshot(principalId: string, baseUrl: string) {
    const state = await this.loadState();
    const snapshotId = newId();
    const createdAt = nowIso();
    const expiresAt = new Date(Date.now() + this.snapshotTtlSeconds * 1000).toISOString();

    const snapshot: StoredSnapshot = {
      snapshotId,
      sourceId: state.sourceId,
      principalId,
      sourceRevision: state.sourceRevision,
      viewRevision: state.viewRevision,
      createdAt,
      expiresAt,
      collections: state.collections.map(({ id, title, itemKind, revision, items }) => ({
        id,
        title,
        itemKind,
        revision,
        items,
      })),
    };

    await atomicWrite(this.snapshotPath(snapshotId), `${JSON.stringify(snapshot, null, 2)}\n`);
    return this.snapshotDescriptor(snapshot, baseUrl);
  }

  private async loadSnapshot(snapshotId: string, principalId: string): Promise<StoredSnapshot> {
    let data: Uint8Array;
    try {
      data = await readFile(this.snapshotPath(snapshotId));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new BridgeError(404, "SNAPSHOT_NOT_FOUND", "Spatial snapshot not found.");
      }
      throw error;
    }

    const snapshot = JSON.parse(Buffer.from(data).toString("utf8")) as StoredSnapshot;
    if (snapshot.principalId !== principalId) {
      throw new BridgeError(404, "SNAPSHOT_NOT_FOUND", "Spatial snapshot not found.");
    }
    if (Date.parse(snapshot.expiresAt) <= Date.now()) {
      throw new BridgeError(409, "SNAPSHOT_EXPIRED", "Spatial snapshot has expired.");
    }
    return snapshot;
  }

  private snapshotDescriptor(snapshot: StoredSnapshot, baseUrl: string) {
    const root = `${baseUrl}/spatial/v1/snapshots/${encodeURIComponent(snapshot.snapshotId)}`;
    return {
      snapshotId: snapshot.snapshotId,
      sourceId: snapshot.sourceId,
      viewRevision: snapshot.viewRevision,
      sourceRevision: snapshot.sourceRevision,
      createdAt: snapshot.createdAt,
      expiresAt: snapshot.expiresAt,
      collectionsHref: `${root}/collections`,
    };
  }

  async getSnapshot(snapshotId: string, principalId: string, baseUrl: string) {
    return this.snapshotDescriptor(await this.loadSnapshot(snapshotId, principalId), baseUrl);
  }

  async listSnapshotCollections(snapshotId: string, principalId: string, baseUrl: string) {
    const snapshot = await this.loadSnapshot(snapshotId, principalId);
    const root = `${baseUrl}/spatial/v1/snapshots/${encodeURIComponent(snapshotId)}/collections`;

    return {
      snapshotId,
      sourceId: snapshot.sourceId,
      viewRevision: snapshot.viewRevision,
      collections: snapshot.collections.map((collection) => ({
        id: collection.id,
        title: collection.title,
        itemKind: collection.itemKind,
        revision: collection.revision,
        itemCount: collection.items.length,
        permissions: { read: true, create: false, update: false, delete: false },
        sync: { snapshot: true, delta: false },
        links: [
          { rel: "self", href: `${root}/${encodeURIComponent(collection.id)}` },
          { rel: "items", href: `${root}/${encodeURIComponent(collection.id)}/items` },
        ],
      })),
    };
  }

  async listSnapshotItems(snapshotId: string, principalId: string, collectionId: string) {
    const snapshot = await this.loadSnapshot(snapshotId, principalId);
    const collection = snapshot.collections.find((item) => item.id === collectionId);
    if (!collection) throw new BridgeError(404, "COLLECTION_NOT_FOUND", "Spatial collection not found.");
    return { items: collection.items };
  }

  async getSnapshotItem(snapshotId: string, principalId: string, collectionId: string, objectId: string) {
    const snapshot = await this.loadSnapshot(snapshotId, principalId);
    const collection = snapshot.collections.find((item) => item.id === collectionId);
    if (!collection) throw new BridgeError(404, "COLLECTION_NOT_FOUND", "Spatial collection not found.");
    const item = collection.items.find((candidate) => itemId(candidate) === objectId);
    if (!item) throw new BridgeError(404, "OBJECT_NOT_FOUND", "Spatial object not found.");
    return item;
  }
}
