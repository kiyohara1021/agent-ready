import type { RepositoryContext } from "../core/repository-context.js";
import { perContext } from "./cache.js";
import type { CommandKind } from "./commands.js";

/**
 * Discovery of configured quality tooling.
 *
 * A checked-in linter or type-checker configuration proves that validation
 * exists even when no document mentions it. That is the difference between
 * "undocumented" (a warning) and "absent" (a failure) for
 * `instructions.quality`.
 */

export interface QualityTool {
  /** Tool name, e.g. `ESLint`. Never a raw file excerpt. */
  label: string;
  kinds: readonly CommandKind[];
  /** Repository-relative path of the configuration that proved it. */
  path: string;
}

const CONFIG_MAX_BYTES = 32 * 1024;

/** Configuration lives at the root or one directory down in practice. */
const MAX_CONFIG_DEPTH = 2;

interface ConfigRule {
  label: string;
  kinds: readonly CommandKind[];
  /** Lowercased basename, or a lowercased prefix when `prefix`. */
  name: string;
  prefix?: boolean;
}

const CONFIG_RULES: readonly ConfigRule[] = [
  { label: "ESLint", kinds: ["lint"], name: "eslint.config.", prefix: true },
  { label: "ESLint", kinds: ["lint"], name: ".eslintrc", prefix: true },
  { label: "Biome", kinds: ["lint"], name: "biome.json", prefix: true },
  { label: "Prettier", kinds: ["lint"], name: ".prettierrc", prefix: true },
  { label: "Prettier", kinds: ["lint"], name: "prettier.config.", prefix: true },
  { label: "Stylelint", kinds: ["lint"], name: ".stylelintrc", prefix: true },
  { label: "TypeScript", kinds: ["typecheck"], name: "tsconfig.json" },
  { label: "Ruff", kinds: ["lint"], name: "ruff.toml" },
  { label: "Ruff", kinds: ["lint"], name: ".ruff.toml" },
  { label: "Flake8", kinds: ["lint"], name: ".flake8" },
  { label: "Pylint", kinds: ["lint"], name: ".pylintrc" },
  { label: "mypy", kinds: ["typecheck"], name: "mypy.ini" },
  { label: "mypy", kinds: ["typecheck"], name: ".mypy.ini" },
  { label: "Pyright", kinds: ["typecheck"], name: "pyrightconfig.json" },
  { label: "PHPStan", kinds: ["typecheck"], name: "phpstan.neon", prefix: true },
  { label: "PHPStan", kinds: ["typecheck"], name: "phpstan.dist.neon" },
  { label: "Psalm", kinds: ["typecheck"], name: "psalm.xml", prefix: true },
  { label: "PHP CS Fixer", kinds: ["lint"], name: ".php-cs-fixer", prefix: true },
  { label: "Laravel Pint", kinds: ["lint"], name: "pint.json" },
  { label: "PHP_CodeSniffer", kinds: ["lint"], name: "phpcs.xml", prefix: true },
  { label: "golangci-lint", kinds: ["lint"], name: ".golangci.", prefix: true },
  { label: "RuboCop", kinds: ["lint"], name: ".rubocop.yml" },
  { label: "Dart analyzer", kinds: ["lint", "typecheck"], name: "analysis_options.yaml" },
  { label: "SwiftLint", kinds: ["lint"], name: ".swiftlint.yml" },
  { label: "Clippy", kinds: ["lint"], name: "clippy.toml" },
  { label: "rustfmt", kinds: ["lint"], name: "rustfmt.toml" },
  { label: "rustfmt", kinds: ["lint"], name: ".rustfmt.toml" },
  { label: "detekt", kinds: ["lint"], name: "detekt.yml" },
  { label: "Checkstyle", kinds: ["lint"], name: "checkstyle.xml" },
  { label: "markdownlint", kinds: ["lint"], name: ".markdownlint", prefix: true },
  { label: "yamllint", kinds: ["lint"], name: ".yamllint", prefix: true },
];

/**
 * `pyproject.toml` commonly configures Python tooling inline instead of in
 * dedicated files, so its tool sections are matched as text.
 */
const PYPROJECT_SECTIONS: readonly { label: string; kinds: readonly CommandKind[]; section: string }[] = [
  { label: "Ruff", kinds: ["lint"], section: "[tool.ruff" },
  { label: "Black", kinds: ["lint"], section: "[tool.black" },
  { label: "isort", kinds: ["lint"], section: "[tool.isort" },
  { label: "Flake8", kinds: ["lint"], section: "[tool.flake8" },
  { label: "mypy", kinds: ["typecheck"], section: "[tool.mypy" },
  { label: "Pyright", kinds: ["typecheck"], section: "[tool.pyright" },
];

function basename(relativePath: string): string {
  const segments = relativePath.split("/");
  return (segments[segments.length - 1] ?? "").toLowerCase();
}

function matchesRule(name: string, rule: ConfigRule): boolean {
  return rule.prefix === true ? name.startsWith(rule.name) : name === rule.name;
}

/**
 * Quality tooling the repository has configured, ordered by {@link CONFIG_RULES}
 * and deduplicated by tool.
 */
export const discoverQualityTooling = perContext(
  async (context: RepositoryContext): Promise<QualityTool[]> => {
    const candidates = context.files.filter(
      (file) => file.path.split("/").length <= MAX_CONFIG_DEPTH,
    );

    const found = new Map<string, QualityTool>();
    for (const rule of CONFIG_RULES) {
      if (found.has(rule.label)) continue;
      const match = candidates.find((file) => matchesRule(basename(file.path), rule));
      if (match) {
        found.set(rule.label, { label: rule.label, kinds: rule.kinds, path: match.path });
      }
    }

    const pyproject = await context.readTextFile("pyproject.toml", CONFIG_MAX_BYTES);
    if (pyproject !== undefined) {
      const lowered = pyproject.toLowerCase();
      for (const rule of PYPROJECT_SECTIONS) {
        if (found.has(rule.label) || !lowered.includes(rule.section)) continue;
        found.set(rule.label, { label: rule.label, kinds: rule.kinds, path: "pyproject.toml" });
      }
    }

    return [...found.values()];
  },
);
