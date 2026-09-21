/**
 * Container-wide guard against hollow constructor dependencies.
 *
 * A constructor parameter with no explicit `@inject(token)` relies on
 * `design:paramtypes`, which only `tsc` emits. tsx, vitest and Next.js all use
 * esbuild/SWC and emit none — so tsyringe passes `undefined` for that parameter
 * and STILL constructs the instance. Resolution succeeds, and the crash lands
 * later as `Cannot read properties of undefined (reading '<method>')` at a line
 * that looks unrelated to DI.
 *
 * Neither typecheck, lint, nor a `toBeDefined()` resolution test catches this.
 * This guard resolves every class token in the container and asserts no
 * constructor-injected field arrived as `undefined`.
 */

import { describe, it, expect } from 'vitest';
import ts from 'typescript';

/** tsyringe keeps its token map private; the guard needs to enumerate it. */
interface RegistryInternals {
  _registry: { entries(): Iterable<[unknown, unknown]> };
}

interface Constructable {
  new (...args: never[]): object;
  name: string;
  length: number;
}

/**
 * Names of the constructor-injected fields of an instance.
 *
 * Read constructor assignments rather than relying on Object.keys ordering.
 * Native class fields and downlevel transforms initialize fields in different
 * orders; optional state must not be mistaken for a constructor dependency.
 */
function injectedFields(ctor: Constructable): string[] {
  if (ctor.length === 0) return [];
  const source = ts.createSourceFile(
    'constructor.ts',
    `(${ctor.toString()})`,
    ts.ScriptTarget.Latest
  );
  const fields = new Set<string>();
  function visit(node: ts.Node): void {
    if (ts.isConstructorDeclaration(node)) {
      const parameters = new Set(
        node.parameters.slice(0, ctor.length).map((p) => p.name.getText(source))
      );
      function assignment(child: ts.Node): void {
        if (
          ts.isBinaryExpression(child) &&
          child.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
          ts.isPropertyAccessExpression(child.left) &&
          child.left.expression.kind === ts.SyntaxKind.ThisKeyword &&
          ts.isIdentifier(child.right) &&
          parameters.has(child.right.text)
        ) {
          fields.add(child.left.name.text);
        }
        ts.forEachChild(child, assignment);
      }
      if (node.body) assignment(node.body);
    } else ts.forEachChild(node, visit);
  }
  visit(source);
  return [...fields];
}

describe('DI container has no hollow constructor dependencies', () => {
  it('identifies parameter assignments independently of optional class field order', () => {
    class Example {
      dependency: unknown;
      optionalState?: string;
      constructor(dependency: unknown) {
        this.dependency = dependency;
      }
    }
    expect(injectedFields(Example)).toEqual(['dependency']);
    const broken = new Example(undefined);
    expect(
      injectedFields(Example).filter(
        (key) => (broken as unknown as Record<string, unknown>)[key] === undefined
      )
    ).toEqual(['dependency']);
  });
  it('injects every constructor parameter of every registered class token', async () => {
    const { initializeContainer } = await import('@/infrastructure/di/container.js');
    const container = await initializeContainer();

    const registry = (container as unknown as RegistryInternals)._registry;
    const hollow: string[] = [];

    for (const [token] of registry.entries()) {
      if (typeof token !== 'function') {
        continue;
      }
      const ctor = token as unknown as Constructable;

      let instance: object;
      try {
        instance = container.resolve(ctor as never) as object;
      } catch {
        // Tokens that legitimately fail to construct in a bare test container
        // (missing runtime config, optional native deps) are out of scope —
        // this guard is about silently-undefined parameters, not resolution.
        continue;
      }
      if (!instance || typeof instance !== 'object') {
        continue;
      }

      const undefinedFields = injectedFields(ctor).filter(
        (field) => (instance as Record<string, unknown>)[field] === undefined
      );
      if (undefinedFields.length > 0) {
        hollow.push(`${ctor.name} -> ${undefinedFields.join(', ')}`);
      }
    }

    expect(
      hollow,
      `Constructor parameters resolved to undefined. Add an explicit @inject(Token) ` +
        `to each — a bare class-typed parameter only works under tsc:\n${hollow.join('\n')}`
    ).toEqual([]);
  });
});
