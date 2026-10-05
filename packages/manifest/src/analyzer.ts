// A Custom Elements Manifest analyzer plugin that records what the standard analysis leaves out:
// `@tessera-*` JSDoc tags, which properties are reactive, events fired through `this.emit()`,
// CSS parts and slots written in templates, and `defineElement('tag', Class)` calls.
import type * as TS from 'typescript';
import type { RawTag } from './tags.js';

export interface ClassFacts {
  name: string;
  /** 'src/components/button.ts:84' */
  at: string;
  superclass?: string;
  tags: RawTag[];
  /** Reactive properties from `static properties`; `state` ones are internal. */
  reactive: Map<string, { state: boolean }>;
  /** `static tesseraExposes`, when declared. */
  exposes?: string[];
  formAssociated: boolean;
  emits: string[];
  parts: string[];
  slots: string[];
}

export interface Collected {
  classes: Map<string, ClassFacts>;
  /** `type Placement = 'top' | 'bottom'` → name → the type as written. */
  aliases: Map<string, string>;
  definitions: Array<{ tag: string; className: string; at: string }>;
  problems: string[];
}

export function newCollected(): Collected {
  return { classes: new Map(), aliases: new Map(), definitions: [], problems: [] };
}

interface AnalyzePhaseParams {
  ts: typeof TS;
  node: TS.Node;
}

export function tesseraAnalyzerPlugin(collected: Collected): {
  name: string;
  analyzePhase(params: AnalyzePhaseParams): void;
} {
  return {
    name: 'tessera',
    analyzePhase({ ts, node }) {
      if (ts.isClassDeclaration(node) && node.name) collectClass(ts, node, collected);
      else if (ts.isTypeAliasDeclaration(node) && !node.typeParameters) {
        collected.aliases.set(node.name.text, node.type.getText());
      } else if (ts.isCallExpression(node)) collectDefinition(ts, node, collected);
    },
  };
}

function location(ts: typeof TS, node: TS.Node): string {
  const file = node.getSourceFile();
  const { line } = ts.getLineAndCharacterOfPosition(file, node.getStart(file));
  return `${file.fileName}:${line + 1}`;
}

function stringValue(ts: typeof TS, node: TS.Node | undefined): string | undefined {
  if (!node) return undefined;
  if (ts.isAsExpression(node) || ts.isSatisfiesExpression(node))
    return stringValue(ts, node.expression);
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  return undefined;
}

function collectClass(ts: typeof TS, node: TS.ClassDeclaration, collected: Collected): void {
  const name = node.name?.text as string;
  const facts: ClassFacts = {
    name,
    at: location(ts, node),
    tags: [],
    reactive: new Map(),
    formAssociated: false,
    emits: [],
    parts: [],
    slots: [],
  };
  const heritage = node.heritageClauses?.find((h) => h.token === ts.SyntaxKind.ExtendsKeyword);
  const base = heritage?.types[0]?.expression;
  if (base && ts.isIdentifier(base)) facts.superclass = base.text;

  for (const tag of ts.getJSDocTags(node)) {
    const tagName = tag.tagName.text;
    if (!tagName.startsWith('tessera-')) continue;
    facts.tags.push({
      name: tagName,
      text: (ts.getTextOfJSDocComment(tag.comment) ?? '').replace(/\s+/g, ' ').trim(),
      at: location(ts, tag),
    });
  }

  for (const member of node.members) {
    if (!ts.isPropertyDeclaration(member) || !member.name || !ts.isIdentifier(member.name))
      continue;
    const isStatic = member.modifiers?.some((m) => m.kind === ts.SyntaxKind.StaticKeyword);
    if (!isStatic || !member.initializer) continue;
    const init = member.initializer;
    if (member.name.text === 'properties' && ts.isObjectLiteralExpression(init)) {
      for (const prop of init.properties) {
        if (!ts.isPropertyAssignment(prop)) continue;
        const key =
          ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name) ? prop.name.text : undefined;
        if (!key) continue;
        let state = false;
        if (ts.isObjectLiteralExpression(prop.initializer)) {
          for (const option of prop.initializer.properties) {
            if (
              ts.isPropertyAssignment(option) &&
              ts.isIdentifier(option.name) &&
              option.name.text === 'state' &&
              option.initializer.kind === ts.SyntaxKind.TrueKeyword
            ) {
              state = true;
            }
          }
        }
        facts.reactive.set(key, { state });
      }
    } else if (member.name.text === 'tesseraExposes') {
      let list: TS.Expression = init;
      while (ts.isAsExpression(list) || ts.isSatisfiesExpression(list)) list = list.expression;
      if (ts.isArrayLiteralExpression(list)) {
        facts.exposes = list.elements
          .map((e) => stringValue(ts, e))
          .filter((v): v is string => v !== undefined);
      } else {
        collected.problems.push(
          `${location(ts, member)}: static tesseraExposes must be an array of string literals`,
        );
      }
    } else if (member.name.text === 'formAssociated') {
      facts.formAssociated = init.kind === ts.SyntaxKind.TrueKeyword;
    }
  }

  const visit = (child: TS.Node): void => {
    if (
      ts.isCallExpression(child) &&
      ts.isPropertyAccessExpression(child.expression) &&
      child.expression.expression.kind === ts.SyntaxKind.ThisKeyword &&
      child.expression.name.text === 'emit'
    ) {
      const event = stringValue(ts, child.arguments[0]);
      if (event && !facts.emits.includes(event)) facts.emits.push(event);
    }
    if (
      ts.isTaggedTemplateExpression(child) &&
      ts.isIdentifier(child.tag) &&
      child.tag.text === 'html'
    ) {
      const text = child.template.getText();
      for (const m of text.matchAll(/\bpart="([^"$]+)"/g)) {
        for (const part of (m[1] as string).split(/\s+/)) {
          if (part && !facts.parts.includes(part)) facts.parts.push(part);
        }
      }
      for (const m of text.matchAll(/<slot\b([^>]*)>/g)) {
        const slot = /\bname="([^"$]+)"/.exec(m[1] as string)?.[1] ?? '';
        if (!facts.slots.includes(slot)) facts.slots.push(slot);
      }
    }
    ts.forEachChild(child, visit);
  };
  ts.forEachChild(node, visit);

  if (collected.classes.has(name)) {
    collected.problems.push(
      `${facts.at}: another class is also called ${name}; class names must be unique in a package`,
    );
  }
  collected.classes.set(name, facts);
}

function collectDefinition(ts: typeof TS, node: TS.CallExpression, collected: Collected): void {
  const callee = node.expression;
  const isDefine =
    (ts.isIdentifier(callee) && callee.text === 'defineElement') ||
    (ts.isPropertyAccessExpression(callee) &&
      callee.name.text === 'define' &&
      ts.isIdentifier(callee.expression) &&
      callee.expression.text === 'customElements');
  if (!isDefine) return;
  const tag = stringValue(ts, node.arguments[0]);
  const ctor = node.arguments[1];
  if (tag && ctor && ts.isIdentifier(ctor)) {
    collected.definitions.push({ tag, className: ctor.text, at: location(ts, node) });
  }
}
