import type { RepositoryContext } from "../core/repository-context.js";
import { perContext } from "./cache.js";
import { discoverIgnoreRules } from "./ignores.js";

/**
 * Recognition of secret-bearing paths.
 *
 * This is deliberately not a secret scanner. Nothing here opens a file: a path
 * is classified by its name alone, and the only questions asked are whether the
 * repository excludes it and whether it is a committed template. That is enough
 * to explain the risk, and it means no secret value can reach a finding, a
 * report, or a log — there is nothing to leak because nothing is read.
 *
 * Entropy scanning and content inspection are explicitly out of scope for v0.1
 * (docs/DETECTORS.md, `safety.secrets`).
 */

export type SecretPathKind = "environment" | "private-key" | "credential";

export interface SecretPath {
  /** Repository-relative POSIX path. Never accompanied by file contents. */
  path: string;
  kind: SecretPathKind;
  /** Static label from the catalog below; never repository text. */
  label: string;
  /** `true` when the repository's `.gitignore` excludes the path. */
  excluded: boolean;
  /** `true` when the name marks it as a committed template rather than real. */
  template: boolean;
  /** `true` when it sits under a test, fixture, or example directory. */
  fixture: boolean;
}

interface PathRule {
  kind: SecretPathKind;
  label: string;
  pattern: RegExp;
}

/**
 * Names that carry credentials in practice.
 *
 * Conservative on purpose. A pattern that fires on ordinary files would train
 * readers to ignore this check, which is worse than a narrower catalog: `.pub`
 * keys, certificates, and `*.crt` are public by design and are not listed.
 */
const SECRET_PATH_RULES: readonly PathRule[] = [
  { kind: "environment", label: "Environment file", pattern: /(^|\/)\.env(\.[^/]+)?$/ },
  {
    kind: "private-key",
    label: "Private key",
    pattern: /(^|\/)(id_(rsa|dsa|ecdsa|ed25519)|[^/]+\.(pem|key|p12|pfx|jks|keystore|ppk))$/,
  },
  {
    kind: "credential",
    label: "Credential file",
    pattern:
      /(^|\/)(\.netrc|\.pgpass|\.htpasswd|credentials(\.json|\.yml|\.yaml)?|[^/]*service-account[^/]*\.json|[^/]*\.credentials\.json)$/,
  },
];

/** Suffixes that mark a file as a documented template rather than a real secret. */
const TEMPLATE_SUFFIX = /\.(example|sample|template|dist|defaults?|tpl)$/;
/** `.env.example` style names, where the marker is not the final suffix. */
const TEMPLATE_ENV = /(^|\/)\.env\.(example|sample|template|dist|defaults?|local\.example)$/;

/**
 * Source extensions that keep a name like `.env.d.ts` out of the catalog: a
 * declaration or script file named after configuration holds no configuration.
 */
const CODE_SUFFIX = /\.(ts|tsx|js|jsx|mjs|cjs|md|mdx|txt|lock)$/;

/** Locations where a key or credential file is usually a deliberate test asset. */
const FIXTURE_PATH = /(^|\/)(tests?|spec|specs|__tests__|fixtures?|testdata|examples?|samples?|mocks?|stubs?)\//;

/** Probe paths used to ask whether ignore rules cover a category at all. */
export const SECRET_PROBES: Readonly<Record<SecretPathKind, readonly string[]>> = {
  environment: [".env", ".env.local", ".env.production"],
  "private-key": ["private.pem", "server.key", "id_rsa"],
  credential: ["credentials.json", "service-account.json", ".netrc"],
};

/** Enough paths to explain the risk; a longer list adds no information. */
const MAX_SECRET_PATHS = 12;

export function isTemplatePath(relativePath: string): boolean {
  const lower = relativePath.toLowerCase();
  return TEMPLATE_SUFFIX.test(lower) || TEMPLATE_ENV.test(lower);
}

function classify(relativePath: string): PathRule | undefined {
  const lower = relativePath.toLowerCase();
  if (CODE_SUFFIX.test(lower)) return undefined;
  return SECRET_PATH_RULES.find((rule) => rule.pattern.test(lower));
}

/**
 * Secret-bearing paths present in the repository, ordered by path.
 *
 * Presence alone is not a finding: an ignored `.env` is how local configuration
 * is supposed to work, and `.env.example` is documentation. The detector decides
 * from `excluded` and `template`.
 */
export const discoverSecretPaths = perContext(
  async (context: RepositoryContext): Promise<SecretPath[]> => {
    const ignores = await discoverIgnoreRules(context);

    return context.files.all
      .flatMap((file) => {
        const rule = classify(file.path);
        if (rule === undefined) return [];

        // Only the path is used. The file is never opened.
        return [
          {
            path: file.path,
            kind: rule.kind,
            label: rule.label,
            excluded: ignores.excludes(file.path),
            template: isTemplatePath(file.path),
            fixture: FIXTURE_PATH.test(file.path.toLowerCase()),
          },
        ];
      })
      .slice(0, MAX_SECRET_PATHS);
  },
);

/** Secret-bearing paths that are neither excluded nor templates. */
export function exposedSecretPaths(paths: readonly SecretPath[]): SecretPath[] {
  return paths.filter((entry) => !entry.excluded && !entry.template);
}
