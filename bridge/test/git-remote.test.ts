import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { GitRemoteRepositoryProvider } from "../src/repository/git-remote.js";
import { sha256 } from "../src/util.js";

const exec = promisify(execFile);
const roots: string[] = [];

async function git(cwd: string, ...args: string[]): Promise<string> {
  return (await exec("git", args, { cwd })).stdout.trim();
}

async function fixture(): Promise<{ root: string; remote: string; work: string }> {
  const root = await mkdtemp(join(tmpdir(), "p4u-git-remote-"));
  roots.push(root);
  const remote = join(root, "remote.git");
  const seed = join(root, "seed");
  const work = join(root, "work");
  await git(root, "init", "--bare", remote);
  await git(root, "init", "-b", "main", seed);
  await git(seed, "config", "user.name", "Fixture");
  await git(seed, "config", "user.email", "fixture@example.invalid");
  await exec("sh", ["-c", "mkdir -p spatial/model && printf '{\"objectId\":\"asset:1\",\"name\":\"Pump\"}\\n' > spatial/model/assets.jsonl"], { cwd: seed });
  await git(seed, "add", ".");
  await git(seed, "commit", "-m", "seed");
  await git(seed, "remote", "add", "origin", remote);
  await git(seed, "push", "-u", "origin", "main");
  await git(root, "--git-dir", remote, "symbolic-ref", "HEAD", "refs/heads/main");
  return { root, remote, work };
}

afterEach(async () => {
  while (roots.length) await rm(roots.pop()!, { recursive: true, force: true });
});

describe("GitRemoteRepositoryProvider", () => {
  it("reads, commits and pushes through a plain Git remote", async () => {
    const { remote, work, root } = await fixture();
    const provider = new GitRemoteRepositoryProvider({ root: work, remoteUrl: remote, branch: "main", refreshIntervalMs: 1 });
    await provider.initialize();

    const before = await provider.readFile("spatial/model/assets.jsonl");
    expect(Buffer.from(before!).toString("utf8")).toContain("asset:1");

    const next = Buffer.from('{"objectId":"asset:1","name":"Pump","status":"checked"}\n');
    const result = await provider.commitFiles([{
      path: "spatial/model/assets.jsonl",
      content: next,
      expectedSha256: sha256(before!),
    }], "update asset");
    expect(result.revision).toMatch(/^[0-9a-f]{40,64}$/);

    const verify = join(root, "verify");
    await git(root, "clone", remote, verify);
    expect(await readFile(join(verify, "spatial/model/assets.jsonl"), "utf8")).toContain('"status":"checked"');
  });

  it("supports CAS creation of a previously absent file", async () => {
    const { remote, work } = await fixture();
    const provider = new GitRemoteRepositoryProvider({ root: work, remoteUrl: remote, branch: "main" });
    await provider.initialize();

    const emptyHash = sha256(new Uint8Array());
    await provider.commitFiles([{
      path: "spatial/model/rooms.jsonl",
      content: Buffer.from('{"objectId":"room:1","name":"Plant room"}\n'),
      expectedSha256: emptyHash,
    }], "create room collection");

    expect(Buffer.from((await provider.readFile("spatial/model/rooms.jsonl"))!).toString("utf8")).toContain("room:1");
  });
});
