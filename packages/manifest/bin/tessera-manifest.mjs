#!/usr/bin/env node
// tessera-manifest: generate, check and validate Tessera kit manifests. See the package README.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import {
  apiSnapshot,
  diffApi,
  formatDiff,
  generateManifest,
  ManifestError,
  manifestJsonSchema,
  validateManifest,
} from '../dist/index.js';

const USAGE = `Usage:
  tessera-manifest build    [--package <dir>] [--out <file>]       write dist/tessera.manifest.json
  tessera-manifest check    [--package <dir>] [--api <file>] [--update]
                            compare the public API with the committed snapshot (tessera.manifest.api.json)
  tessera-manifest validate <file>                                  check a manifest against the schema
  tessera-manifest schema   --out <file>                            write the manifest JSON Schema`;

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    package: { type: 'string', default: '.' },
    out: { type: 'string' },
    api: { type: 'string' },
    update: { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
});
const [command, file] = positionals;
const write = (path, data) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
};
const packageDir = resolve(values.package);

try {
  if (values.help || !command) {
    console.log(USAGE);
  } else if (command === 'build') {
    const manifest = await generateManifest({ packageDir, measureSize: true });
    const out = resolve(packageDir, values.out ?? 'dist/tessera.manifest.json');
    write(out, manifest);
    console.log(`${manifest.package.name}: ${manifest.elements.length} elements → ${out}`);
  } else if (command === 'check') {
    const api = resolve(packageDir, values.api ?? 'tessera.manifest.api.json');
    const fresh = apiSnapshot(await generateManifest({ packageDir }));
    if (values.update) {
      write(api, fresh);
      console.log(`Updated ${api}`);
    } else if (!existsSync(api)) {
      console.error(`${api} does not exist. Run "tessera-manifest check --update" and commit it.`);
      process.exitCode = 1;
    } else {
      const diffs = diffApi(JSON.parse(readFileSync(api, 'utf8')), fresh);
      if (diffs.length === 0) {
        console.log(`${fresh.package.name}: the manifest matches the source.`);
      } else {
        console.error(
          `${fresh.package.name}: the public API changed without the manifest (${diffs.length} difference${diffs.length === 1 ? '' : 's'}):\n${formatDiff(diffs)}\n\nIf the change is intended, run "tessera-manifest check --update" in that package and commit tessera.manifest.api.json, with a changeset.`,
        );
        process.exitCode = 1;
      }
    }
  } else if (command === 'validate') {
    if (!file) throw new Error('validate needs a file');
    const problems = validateManifest(JSON.parse(readFileSync(resolve(file), 'utf8')));
    if (problems.length === 0) console.log(`${file} is a valid Tessera manifest.`);
    else {
      console.error(
        `${file} is not a valid Tessera manifest:\n${problems.map((p) => `  - ${p}`).join('\n')}`,
      );
      process.exitCode = 1;
    }
  } else if (command === 'schema') {
    if (!values.out) throw new Error('schema needs --out <file>');
    write(resolve(values.out), manifestJsonSchema());
  } else {
    console.error(`Unknown command "${command}".\n\n${USAGE}`);
    process.exitCode = 1;
  }
} catch (error) {
  console.error(error instanceof ManifestError ? error.message : error);
  process.exitCode = 1;
}
