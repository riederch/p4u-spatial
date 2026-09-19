import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

const original = { ...process.env };

function restoreEnv(): void {
  for (const key of Object.keys(process.env)) {
    if (!(key in original)) delete process.env[key];
  }
  Object.assign(process.env, original);
}

afterEach(() => restoreEnv());

describe("RCHKB repository profile", () => {
  it("maps a knowledge-base root to its local Spatial projection and is read-only by default", () => {
    process.env.P4U_REPOSITORY_PROFILE = "rchkb";
    process.env.P4U_RCHKB_ROOT = "Feuerwehr/Pogoeriach";
    delete process.env.P4U_RCHKB_ALLOW_SPATIAL_WRITES;
    delete process.env.P4U_SPATIAL_SOURCE_TITLE;

    const config = loadConfig();

    expect(config.repositoryProfile).toBe("rchkb");
    expect(config.rchkbRoot).toBe("Feuerwehr/Pogoeriach");
    expect(config.spatialRoot).toBe("Feuerwehr/Pogoeriach/_agents/spatial");
    expect(config.spatialWritable).toBe(false);
    expect(config.spatialRouteId).toBe("rchkb-git");
    expect(config.spatialSourceTitle).toBe("RCHKB Spatial: Feuerwehr/Pogoeriach");
  });

  it("requires an explicit knowledge-base root", () => {
    process.env.P4U_REPOSITORY_PROFILE = "rchkb";
    delete process.env.P4U_RCHKB_ROOT;
    expect(() => loadConfig()).toThrow(/P4U_RCHKB_ROOT/);
  });

  it("only enables direct Spatial writes through explicit opt-in", () => {
    process.env.P4U_REPOSITORY_PROFILE = "rchkb";
    process.env.P4U_RCHKB_ROOT = "WWG";
    process.env.P4U_RCHKB_ALLOW_SPATIAL_WRITES = "true";
    expect(loadConfig().spatialWritable).toBe(true);
  });
});
