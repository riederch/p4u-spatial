import { readFile } from "node:fs/promises";
import { atomicWrite } from "../util.js";

export class AtomicJsonStore<T> {
  private gate: Promise<void> = Promise.resolve();

  constructor(
    private readonly path: string,
    private readonly initialValue: () => T,
  ) {}

  async read(): Promise<T> {
    try {
      return JSON.parse(await readFile(this.path, "utf8")) as T;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return this.initialValue();
      throw error;
    }
  }

  async mutate<R>(fn: (value: T) => R | Promise<R>): Promise<R> {
    let release!: () => void;
    const next = new Promise<void>((resolve) => { release = resolve; });
    const previous = this.gate;
    this.gate = previous.then(() => next);
    await previous;
    try {
      const value = await this.read();
      const result = await fn(value);
      await atomicWrite(this.path, `${JSON.stringify(value, null, 2)}\n`);
      return result;
    } finally {
      release();
    }
  }
}
