import { gzipSync } from 'node:zlib';
import { rolldown } from 'rolldown';
import type { TesseraManifest } from './types.js';

/**
 * Gzip size of a package's own code from its built entries: dependencies stay external (the page
 * budgets measure them), dynamic chunks count as lazy.
 */
export async function measureSizes(
  root: string,
  entries: { elements?: string | undefined; plugin?: string | undefined },
): Promise<TesseraManifest['size']> {
  const elements = entries.elements
    ? await measure(root, entries.elements)
    : { initial: 0, lazy: 0 };
  const plugin = entries.plugin ? await measure(root, entries.plugin) : { initial: 0, lazy: 0 };
  return {
    elementsGzip: elements.initial,
    pluginGzip: plugin.initial,
    ...(elements.lazy > 0 ? { lazyGzip: elements.lazy } : {}),
  };
}

async function measure(root: string, input: string): Promise<{ initial: number; lazy: number }> {
  const bundle = await rolldown({
    input,
    cwd: root,
    platform: 'browser',
    logLevel: 'silent',
    // Own code only: every bare import (a dependency or peer) stays out.
    external: (id) => !id.startsWith('.') && !id.startsWith('/') && !/^[A-Za-z]:[\\/]/.test(id),
    transform: { define: { 'process.env.NODE_ENV': '"production"' } },
  });
  const { output } = await bundle.generate({ format: 'esm', minify: true });
  await bundle.close();
  const chunks = output.filter((o) => o.type === 'chunk');
  const byName = new Map(chunks.map((c) => [c.fileName, c]));
  const initial = new Set<string>();
  const visit = (file: string): void => {
    if (initial.has(file)) return;
    initial.add(file);
    for (const dep of byName.get(file)?.imports ?? []) visit(dep);
  };
  for (const chunk of chunks) if (chunk.isEntry) visit(chunk.fileName);
  let a = 0;
  let b = 0;
  for (const chunk of chunks) {
    const size = gzipSync(chunk.code, { level: 9 }).length;
    if (initial.has(chunk.fileName)) a += size;
    else b += size;
  }
  return { initial: a, lazy: b };
}
