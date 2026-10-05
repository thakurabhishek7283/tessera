// A built plugin, as tsdown would emit it: the default export is what the generator reads.
import * as z from 'zod/mini';

export default {
  id: 'fixture',
  version: '1.2.3',
  requires: ['storage'],
  optional: ['presence'],
  configSchema: z.object({
    enabled: z.boolean(),
    columns: z._default(z.array(z.string()), ['todo', 'done']).check(z.describe('Column names, left to right.')),
    limit: z.optional(z.number().check(z.minimum(1))).check(z.describe('Most cards per column.')),
  }),
  setup: () => ({}),
};
