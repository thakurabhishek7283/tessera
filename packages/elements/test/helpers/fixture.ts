import axe from 'axe-core';
import { render, type TemplateResult } from 'lit';
import { expect } from 'vitest';

/** Renders a Lit template into a fresh container and waits for nested elements to settle. */
export async function fixture<T extends Element = HTMLElement>(
  template: TemplateResult,
): Promise<T> {
  const host = document.createElement('div');
  document.body.append(host);
  render(template, host);
  const el = host.firstElementChild as T;
  await settle(el);
  return el;
}

/** Waits for an element and every Lit element in its shadow tree to finish rendering. */
export async function settle(el: Element): Promise<void> {
  const pending: Array<Promise<unknown>> = [];
  const visit = (node: Element | ShadowRoot): void => {
    for (const child of node.querySelectorAll('*')) {
      const updateComplete = (child as { updateComplete?: Promise<unknown> }).updateComplete;
      if (updateComplete) pending.push(updateComplete);
      if (child.shadowRoot) visit(child.shadowRoot);
    }
  };
  const own = (el as { updateComplete?: Promise<unknown> }).updateComplete;
  if (own) pending.push(own);
  visit(el);
  if (el.shadowRoot) visit(el.shadowRoot);
  await Promise.all(pending);
  // Children created during that render need one more pass.
  await new Promise((r) => requestAnimationFrame(() => r(undefined)));
}

export function cleanup(): void {
  document.body.replaceChildren();
}

/** Fails with a readable list when axe finds WCAG A/AA violations inside `el`. */
export async function expectAccessible(el: Element): Promise<void> {
  const results = await axe.run(el, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
    // Components are tested in isolation, so page-level rules do not apply.
    rules: {
      region: { enabled: false },
      'landmark-one-main': { enabled: false },
      'page-has-heading-one': { enabled: false },
    },
  });
  const summary = results.violations.map(
    (v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).join(', ')})`,
  );
  expect(summary).toEqual([]);
}
