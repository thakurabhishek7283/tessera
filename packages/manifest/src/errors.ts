/** One or more problems found while generating a manifest, each with its source location. */
export class ManifestError extends Error {
  readonly problems: string[];

  constructor(problems: string[]) {
    super(`The manifest could not be generated:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
    this.name = 'ManifestError';
    this.problems = problems;
  }
}
