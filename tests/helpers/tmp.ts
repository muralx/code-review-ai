import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

export type Tree = Record<string, string>;

/** Create a temp directory and write every `relativePath: content` entry into it. */
export async function makeTree(tree: Tree, prefix = 'cra-'): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  await writeTree(root, tree);
  return root;
}

export async function writeTree(root: string, tree: Tree): Promise<void> {
  for (const [rel, content] of Object.entries(tree)) {
    const abs = join(root, rel);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, content, 'utf8');
  }
}

export async function removeTree(root: string): Promise<void> {
  await rm(root, { recursive: true, force: true });
}
