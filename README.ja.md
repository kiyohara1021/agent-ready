# agent-ready

**そのリポジトリ、コーディングエージェントを迎える準備はできていますか？**

```bash
npx agent-ready check
```

```text
Agent Readiness: 86 / 100 — Good

Instructions        26 / 30
Automation          20 / 25
Repository Context  24 / 25
Safety              16 / 20

1. [medium] Exclude environment files, private keys and credentials in .gitignore.
2. [low] Enable Dependabot or Renovate so dependency updates arrive as reviewable changes.
3. [low] Document a command to run the project locally.
```

Codex、Claude Code、Cursor などのコーディングエージェントがリポジトリを扱える状態か
どうかを監査する、決定論的な CLI です。解析はローカルのみ・読み取り専用で、LLM も
アカウントもテレメトリも必要ありません。

[English README](README.md)

## デモ

<!--
  デモ GIF のプレースホルダーです。実在するリポジトリで `npx agent-ready check` を
  録画し、docs/assets/demo.gif として保存したうえで、このコメントを
  ![agent-ready check](docs/assets/demo.gif) に置き換えてください。
  録画手順: docs/assets/README.md
-->

_ターミナル GIF は未収録です。下の[出力例](#出力例)は、このリポジトリ自身を解析した
実際の出力をそのまま掲載しています。_

## なぜ必要か

コーディングエージェントが失敗する理由は、たいてい高度なものではなく退屈なものです。
テストコマンドが書かれていない、アーキテクチャの見取り図がない、スコープを絞った指示が
ない、生成物がソースと同じ場所に置かれている——といった類です。

人間なら誰かに聞いて回避できますが、エージェントにはそれができません。だから推測し、
その推測の誤りがそのまま誤ったプルリクエストになります。

`agent-ready` が答えるのは、次の 1 つの問いだけです。

> コーディングエージェントは、このリポジトリを推測に頼らず理解し、検証し、安全に変更
> できるか？

コードを書いたり、`AGENTS.md` を生成したり、リポジトリをプロンプトへ丸ごと詰め込んだり
はしません。埋めるべき欠落を示し、その配点はすべて文書化されたチェックまで追跡できます。

## クイックスタート

```bash
npx agent-ready check
```

パスを指定して解析することもできます。

```bash
npx agent-ready check ../my-project
```

Node.js 22 以上が必要です。グローバルインストールも可能です。

```bash
npm install -g agent-ready
```

オプション:

```text
--format <text|json>   出力形式（既定: text）
--min-score <number>   このスコアを下回ったら終了コード 2 で失敗する
--help                 ヘルプを表示する
--version              バージョンを表示する
```

終了コード: `0` 成功、`1` 実行時エラーまたは引数エラー、`2` `--min-score` 未達。

## 出力例

このリポジトリ自身に対して実行した、実際の出力です。

```text
agent-ready 0.1.0

Agent Readiness: 86 / 100 — Good

Instructions                                          26 / 30
  ✓ AGENTS.md provides project-specific guidance      instructions.agents-md 8/10
  ✓ Setup instructions are documented                 instructions.setup 4/5
  ✓ Test instructions are documented                  instructions.tests 5/5
  ✓ Quality instructions are documented               instructions.quality 5/5
  ✓ Architecture guidance is documented               instructions.architecture 4/5

Automation                                            20 / 25
  ✓ A test command is discoverable                    automation.tests 5/5
  ✓ A lint command is discoverable                    automation.lint 5/5
  ✓ A type-check command is discoverable              automation.typecheck 5/5
  ✓ CI validates changes                              automation.ci 5/5
  ✕ No dependency automation                          automation.dependencies 0/5

Repository Context                                    24 / 25
  ✓ README orients a reader                           context.readme 5/5
  ✓ Architecture context is discoverable              context.architecture 4/5
  ✓ Project identity is clear                         context.metadata 5/5
  ✓ Ignore rules keep irrelevant content out of view  context.ignore 5/5
  ✓ Generated content is separated                    context.generated 5/5

Safety                                                16 / 20
  ✓ Local artifacts are excluded                      safety.gitignore 5/5
  △ Some secret-bearing paths are not excluded        safety.secrets 1/5
  ✓ A security policy exists                          safety.security-policy 5/5
  ✓ Dependencies are locked                           safety.lockfile 5/5

Recommendations

1. [medium] Exclude environment files, private keys and credentials in .gitignore.
2. [low] Enable Dependabot or Renovate so dependency updates arrive as reviewable changes.
3. [low] Document a command to run the project locally.
4. [low] Add a directory map or decision records so design context is easier to follow.

Score: 86/100
```

各行には検出器 ID と配点が併記されるため、どの点がなぜ与えられた／与えられなかったのか
を必ず追跡できます。

## 何をチェックするか

4 カテゴリー・19 個の検出器で構成されています。

| カテゴリー | 配点 | 主なチェック |
|---|---|---|
| **Instructions** | 30 | `AGENTS.md` の有無と内容の具体性、セットアップ・テスト・品質・アーキテクチャの各指示 |
| **Automation** | 25 | テスト／Lint／型チェックコマンドの発見可能性、CI、依存関係の更新自動化 |
| **Repository Context** | 25 | README、アーキテクチャ文書、プロジェクトメタデータ、無視ルール、生成物の分離 |
| **Safety** | 20 | `.gitignore`、シークレットやローカルファイルの除外、セキュリティポリシー、ロックファイル |

対象リポジトリに当てはまらないチェックは `n/a` として報告され、分子と分母の両方から
除外されます。該当しないという理由で減点されることはありません。詳細は
[docs/DETECTORS.md](docs/DETECTORS.md) を参照してください。

## スコアの考え方

スコアは文書化されたヒューリスティックであり、厳密な測定値ではありません。

```text
90–100  Excellent      60–74   Fair          0–39  Poor
75–89   Good           40–59   Needs improvement
```

有用性を支えているのは次の 3 点です。

- **決定論的** — 同じリポジトリ状態なら常に同じスコアになります。
- **追跡可能** — すべての配点が [docs/SCORING.md](docs/SCORING.md) の規則に対応します。
- **ごまかしにくい** — 空ファイルでは加点されません。ファイル内部の実質的なシグナルを
  見ますし、「文書化されたコマンド」とはコードブロックに現れるコマンドを指します。
  散文中で言及されているだけの語は該当しません。

スコアが高くてもエージェントが正しいコードを書く保証にはなりません。エージェントが
推測に頼る理由が減る、ということです。

## CI での利用

準備度が後退したらビルドを失敗させます。

```yaml
- run: npx agent-ready check --min-score 80
```

終了コード `2` は閾値未達を意味します。説明は stderr に出るため、stdout の JSON は
パース可能なままです。閾値はラチェットとして扱い、リポジトリの改善に合わせて引き上げて
ください。

ダッシュボードや独自ゲート向けの機械可読出力:

```bash
npx agent-ready check --format json | jq '.score'
```

JSON レポートはバージョン管理されており（`schemaVersion: 1`）、カテゴリー、検出結果、
推奨事項を含みます。エビデンスにはファイルパスとラベルのみが入り、ファイルの中身は
含まれません。したがってシークレットの値が出力されることはありません。スキーマは
[docs/CLI.md](docs/CLI.md) にあります。

## 対応エコシステム

エコシステムの判定は証拠ベースで、1 つのリポジトリが複数を含んでいても構いません。

Node.js · PHP / Composer · Python · Rust · Go · Ruby · Dart / Flutter · Swift ·
Java（Maven / Gradle）· .NET · Elixir · Make

解析側は `package.json` の存在を前提にしていません。未対応のエコシステムでも、
エコシステムに依存しないチェックはすべて実行されます。

## 類似ツールとの違い

`agent-ready` はリポジトリ内容をパッケージ化するツールの代替ではなく、補完関係にあります。
それらはエージェントに渡す**コンテキストを準備する**ツールであり、`agent-ready` は
エージェントが**作業する場であるリポジトリ自体**を監査します。

| ツール | 主な目的 |
|---|---|
| [Repomix](https://github.com/yamadashy/repomix) | リポジトリ内容を AI 向けにパッケージ化する |
| [Gitingest](https://github.com/cyclotruc/gitingest) | リポジトリを LLM 向けダイジェストに変換する |
| [code2prompt](https://github.com/mufeedvh/code2prompt) | コードベースをプロンプト向けテキストにする |
| **agent-ready** | リポジトリがコーディングエージェントを迎える準備ができているか監査する |

```text
Repomix / Gitingest / code2prompt   リポジトリ → コンテキスト束
agent-ready                         リポジトリ → 準備度の監査
```

併用は理にかなっています。監査で見つかった欠落を埋めてから、パッケージ化する価値のある
リポジトリをパッケージ化してください。

## 安心して使うために

- **ローカル実行** — 解析は手元のマシンで行われ、ソースコードは送信されません。
- **LLM 不要** — 中核の解析に API キー、モデル、ネットワーク通信は必要ありません。
- **読み取り専用** — `check` は対象リポジトリを変更せず、スクリプトの実行、依存関係の
  インストール、コードの実行も行いません。
- **テレメトリなし** — 何も収集せず、作成すべきアカウントもありません。
- **シークレット安全** — 検出結果はリスクの種類と場所のみを報告し、値は出力しません。

## ドキュメント

- [PRODUCT.md](PRODUCT.md) — プロダクトの方向性と非目標
- [docs/CLI.md](docs/CLI.md) — CLI と JSON スキーマの仕様
- [docs/DETECTORS.md](docs/DETECTORS.md) — 各検出器の内容と根拠
- [docs/SCORING.md](docs/SCORING.md) — スコアリングモデル
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — 内部アーキテクチャ
- [AGENTS.md](AGENTS.md) — コントリビューターおよびコーディングエージェント向けの指示
- [CHANGELOG.md](CHANGELOG.md) — リリースノート

## コントリビュート

検出器のヒューリスティックがこのプロジェクトの中心です。コードベース全体を把握しなくても
検出器を 1 つ追加できるよう、意図的に小さく保っています。スコアが実態と合わなかった実在の
リポジトリの報告も、コードと同じくらい価値があります。

進め方は [CONTRIBUTING.md](CONTRIBUTING.md)、コミュニティの期待値は
[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) を参照してください。セキュリティ上の問題は
公開 Issue ではなく [SECURITY.md](SECURITY.md) の手順に従って報告してください。

```bash
npm install
npm run build
npm run lint && npm run typecheck && npm test
```

## ライセンス

[MIT](LICENSE)
