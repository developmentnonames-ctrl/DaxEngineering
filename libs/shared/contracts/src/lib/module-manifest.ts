export const GRANT_SCOPES = ['OWN', 'DEPARTMENT', 'ALL'] as const;
export type GrantScope = (typeof GRANT_SCOPES)[number];

export const FIELD_TIERS = ['INTERNAL', 'CONFIDENTIAL', 'RESTRICTED'] as const;
export type FieldTier = (typeof FIELD_TIERS)[number];

export interface ActionDef {
  readonly label?: string;
  readonly description?: string;
  readonly scopes?: readonly GrantScope[];
  readonly approval?: boolean;
}

export interface FeatureDef {
  readonly name: string;
  readonly description?: string;
  readonly actions: Readonly<Record<string, ActionDef>>;
}

export interface NumberSeriesDef {
  readonly docType: string;
  readonly name: string;
  readonly subtypes?: Readonly<Record<string, string>>;
  readonly yearly?: boolean;
}

export interface MenuEntryDef {
  readonly key: string;
  readonly label: string;
  readonly path: string;
  readonly permission: string;
  readonly icon?: string;
}

export interface ModuleManifest {
  readonly key: string;
  readonly name: string;
  readonly description?: string;
  readonly dependsOn: readonly string[];
  readonly features: Readonly<Record<string, FeatureDef>>;
  readonly numberSeries?: readonly NumberSeriesDef[];
  readonly menu?: readonly MenuEntryDef[];
  readonly defaultGrants?: Readonly<
    Record<string, Readonly<Record<string, GrantScope>>>
  >;
}

export type PermissionKeysOf<M extends ModuleManifest> = {
  [
    F in keyof M['features'] & string
  ]: `${M['key']}.${F}.${keyof M['features'][F]['actions'] & string}`;
}[keyof M['features'] & string];

const KEY_PATTERN = /^[a-z][a-z0-9_]*$/;
const DOC_TYPE_PATTERN = /^[A-Z]{2,5}$/;

export class ManifestError extends Error {
  constructor(moduleKey: string, problem: string) {
    super(`Module manifest "${moduleKey}": ${problem}`);
    this.name = 'ManifestError';
  }
}

export function defineModule<const M extends ModuleManifest>(manifest: M): M {
  const fail = (problem: string): never => {
    throw new ManifestError(manifest.key, problem);
  };

  if (!KEY_PATTERN.test(manifest.key))
    fail(`key "${manifest.key}" must be lower_snake_case`);
  if (manifest.dependsOn.includes(manifest.key))
    fail('a module cannot depend on itself');

  const featureKeys = Object.keys(manifest.features);
  if (featureKeys.length === 0) fail('declares no features');

  for (const featureKey of featureKeys) {
    if (!KEY_PATTERN.test(featureKey))
      fail(`feature "${featureKey}" must be lower_snake_case`);
    const feature = manifest.features[featureKey];
    const actionKeys = Object.keys(feature.actions);
    if (actionKeys.length === 0)
      fail(`feature "${featureKey}" declares no actions`);
    for (const actionKey of actionKeys) {
      if (!KEY_PATTERN.test(actionKey)) {
        fail(`action "${featureKey}.${actionKey}" must be lower_snake_case`);
      }
      const scopes = feature.actions[actionKey].scopes;
      if (scopes && scopes.length === 0)
        fail(`action "${featureKey}.${actionKey}" has an empty scope list`);
    }
  }

  const permissions = new Set<string>(permissionKeys(manifest));

  const seenSeries = new Set<string>();
  for (const series of manifest.numberSeries ?? []) {
    if (!DOC_TYPE_PATTERN.test(series.docType))
      fail(`series "${series.docType}" must be 2-5 capital letters`);
    if (seenSeries.has(series.docType))
      fail(`series "${series.docType}" declared twice`);
    seenSeries.add(series.docType);
    for (const sub of Object.keys(series.subtypes ?? {})) {
      if (!DOC_TYPE_PATTERN.test(sub))
        fail(
          `series "${series.docType}" subtype "${sub}" must be 2-5 capital letters`,
        );
    }
  }

  for (const entry of manifest.menu ?? []) {
    if (!permissions.has(entry.permission)) {
      fail(
        `menu "${entry.key}" needs unknown permission "${entry.permission}"`,
      );
    }
  }

  for (const [role, grants] of Object.entries(manifest.defaultGrants ?? {})) {
    for (const target of Object.keys(grants)) {
      if (target === '*') continue;
      if (!permissions.has(`${manifest.key}.${target}`)) {
        fail(
          `default grant for role "${role}" names unknown action "${target}"`,
        );
      }
    }
  }

  return manifest;
}

export function permissionKeys<M extends ModuleManifest>(
  manifest: M,
): PermissionKeysOf<M>[] {
  const keys: string[] = [];
  for (const [featureKey, feature] of Object.entries(manifest.features)) {
    for (const actionKey of Object.keys(feature.actions)) {
      keys.push(`${manifest.key}.${featureKey}.${actionKey}`);
    }
  }
  return keys as PermissionKeysOf<M>[];
}

export function assertCatalog(
  manifests: readonly ModuleManifest[],
): ModuleManifest[] {
  const byKey = new Map<string, ModuleManifest>();
  for (const m of manifests) {
    if (byKey.has(m.key)) throw new ManifestError(m.key, 'installed twice');
    byKey.set(m.key, m);
  }
  for (const m of manifests) {
    for (const dep of m.dependsOn) {
      if (!byKey.has(dep))
        throw new ManifestError(
          m.key,
          `depends on "${dep}", which is not installed`,
        );
    }
  }

  const ordered: ModuleManifest[] = [];
  const state = new Map<string, 'visiting' | 'done'>();
  const visit = (m: ModuleManifest, path: string[]): void => {
    const s = state.get(m.key);
    if (s === 'done') return;
    if (s === 'visiting')
      throw new ManifestError(
        m.key,
        `dependency cycle: ${[...path, m.key].join(' -> ')}`,
      );
    state.set(m.key, 'visiting');
    for (const dep of m.dependsOn)
      visit(byKey.get(dep) as ModuleManifest, [...path, m.key]);
    state.set(m.key, 'done');
    ordered.push(m);
  };
  for (const m of manifests) visit(m, []);
  return ordered;
}
