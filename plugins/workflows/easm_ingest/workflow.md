# easm_ingest

> EASM 期次入库工作流：把一期 EASM 交付物（资产清单 xls/xlsx + 季度报告 docx + 可选的登录验证报告 docx），或一份已经转换好的 EASM 数据包 `datapack.json`，写入 `~/.flocks/data/easm.db`，期次状态为 `draft`，并计算与上一期的差异。发布（draft → published）不在本工作流内，由 Reports 页的管理员操作完成。

## 1. 功能概述

`easm_ingest` 是 ThreatBook EASM Portal 唯一的数据入口工作流。

它主要解决三件事：

- 接收一期交付物：从收件目录 `workspace/easm/inbox/<period_id>/` 读取分析师交付物，或直接接收一份 `datapack.json`；也可以把会话里上传的文件路径列表（`source_files`）先复制进收件目录再处理。
- 转换与校验：调用随本工作流安装的转换器 `bin/easm_convert.py` 生成数据包（契约 v1.0），用 `bin/easm-data-pack.schema.json` 做 schema 校验，并读取转换器与报告标题数字的交叉核对结果。
- 入库与差异：把数据包写入 SQLite `easm.db`（每个模块一张表，行内存整条 JSON），期次状态 `draft`；把证据截图复制到 Data Leaks 页的资源目录；与上一期按实体 id 比较得到新增 / 消失 / 持续；最后产出一份入库摘要（可选发到管理员的通道）。

适用场景：

- 管理员在 Flocks「文件目录」把季度交付物上传到 `workspace/easm/inbox/<period_id>/` 后，在 Workflows 页手动运行本工作流。
- 管理员在 Flocks 会话里把交付物作为附件发给 Rex，并说明期次、报告编号与日期；Rex 用 `run_workflow` 运行本工作流，把附件路径放进 `source_files`。
- 已经在别处跑过转换器、手里只有 `datapack.json`（加同级的 `assets/screenshots/`）时，传 `datapack_path` 直接入库。
- 草稿期次核对后发现问题，修正交付物后对同一 `period_id` 重跑（先删后写）。

不做的事：

- 不发布期次（不会把 `periods.status` 改成 `published`），不改已发布期次（除非显式 `force=true`）。
- 不调用任何外部 API，不联网；只读收件目录、写 staging 目录、`easm.db` 和页面资源目录。
- 不打印、不落盘任何密码明文；凭据只以转换器生成的密文 `password_enc`、指纹 `password_fp` 和掩码 `password_masked` 入库。日志与摘要里只允许出现掩码。
- 不把密钥写进工作流目录或数据库。密钥只从环境变量 `EASM_SECRET_KEY` 读。

## 2. 总体流程

工作流按以下顺序执行：

```text
locate_inputs -> convert -> validate -> load_db -> diff -> notify
```

| 顺序 | 节点 | 职责 |
| --- | --- | --- |
| 1 | `locate_inputs` | 解析参数，准备收件目录（可先复制 `source_files`），判定输入模式（datapack / convert），定位各文件并算 sha256。 |
| 2 | `convert` | convert 模式下运行 `bin/easm_convert.py` 生成 `datapack.json`；datapack 模式下直接透传路径。 |
| 3 | `validate` | schema 校验、期次一致性检查、读取交叉核对与告警，计算各模块行数与 `needs_review`。 |
| 4 | `load_db` | 建表（若不存在）、按 `period_id` 先删后写、写 `periods` / 各模块表 / `summary`，复制截图到页面资源目录。 |
| 5 | `diff` | 与上一期按实体 id 比较，写 `period_diff`，把差异摘要写进 `summary.diff_json`。 |
| 6 | `notify` | 生成入库摘要 Markdown 落盘；有 `notify_session_id` 时用 `channel_message` 发给管理员通道。 |

一句话说清：

```text
收件目录里的交付物（或现成的 datapack.json）
  -> 转换成 EASM 数据包
  -> 校验 + 交叉核对
  -> 写入 easm.db（草稿）+ 复制截图
  -> 与上一期比差异
  -> 输出摘要，提示到 Reports 页核对并发布
```

## 3. 输入

### 3.1 输入模式

| 优先级 | 字段 | 类型 | 用途 |
| --- | --- | --- | --- |
| 1 | `datapack_path` | string | 现成数据包 `datapack.json` 的绝对路径；存在时跳过转换（datapack 模式）。截图从它同级的 `assets/screenshots/` 取。 |
| 2 | 收件目录里的 `datapack.json` | 文件 | `datapack_path` 为空但收件目录里有 `datapack.json` 时，同样走 datapack 模式。 |
| 3 | 收件目录里的原始交付物 | 文件 | 资产清单（`*.xls` / `*.xlsx`，文件名含 `Asset Inventory`，大小写不敏感；找不到就取目录里唯一的 xls/xlsx）、报告（`*.docx`，文件名含 `EASM Report`；找不到就取文件名不含 `Verification` 的唯一 docx）、验证报告（`*.docx`，文件名含 `Verification`，可选）、`narrative.json`（可选）、`previous-summary.json`（可选）。这是 convert 模式。 |
| 4 | `source_files` | string[] | 会话附件或任意本机路径列表；`locate_inputs` 先把它们复制进收件目录（同名覆盖），再按上面 1–3 判定。 |

三种模式互斥，按优先级取第一个命中的。convert 模式缺资产清单或报告时直接失败，错误信息列出收件目录里实际找到的文件名。

### 3.2 参数

| 参数 | 默认 | 说明 |
| --- | --- | --- |
| `period_id` | 必填 | 期次 id，如 `2026Q3`；只允许字母数字和 `_-`。 |
| `report_no` | 必填 | 报告编号（整数）。 |
| `report_date` | 必填 | 报告日期 `YYYY-MM-DD`。 |
| `customer_id` | `customer` | 客户 id。 |
| `customer_name` | `Customer Ltd` | 客户名。 |
| `period_label` | 空 | 期次显示名，如 `Q3 2026 · Report No.1`；为空时交给转换器按 `period_id` 和 `report_no` 生成。 |
| `previous_period_id` | 空 | 上一期 id；为空时依次取 `previous-summary.json` 里的 `period_id`、库里 `report_date` 早于本期的最新一期。 |
| `inbox_dir` | `workspace/easm/inbox/{period_id}` | 收件目录；相对路径相对于 `~/.flocks/workspace/` 解析。 |
| `datapack_path` | 空 | 见 3.1。 |
| `source_files` | `[]` | 见 3.1。 |
| `db_path` | `~/.flocks/data/easm.db` | 目标数据库；测试时可指到临时文件。 |
| `force` | `false` | 为 `true` 时允许覆盖已发布期次（仍然写成 `draft`）。 |
| `rebrand` | 空（如需替换叙事里的旧品牌名，填 `OldBrand:NewBrand`） | 传给转换器 `--rebrand`，只改报告叙事文本里的品牌名。 |
| `notify_session_id` | 空 | 有值时 `notify` 节点把摘要发到该会话绑定的通道。 |

### 3.3 输入样例

```json
{
  "period_id": "2026Q3",
  "report_no": 1,
  "report_date": "2026-09-30",
  "customer_id": "customer",
  "customer_name": "Customer Ltd",
  "previous_period_id": "",
  "inbox_dir": "easm/inbox/2026Q3",
  "datapack_path": "",
  "source_files": [],
  "db_path": "",
  "force": false,
  "rebrand": "",
  "notify_session_id": ""
}
```

## 4. 通用约定（所有节点遵守）

- 所有节点都是 `type="python"`、同步代码；只用标准库加本工作流声明的依赖（`openpyxl`、`xlrd`、`python-docx`、`pillow`、`cryptography`、`jsonschema`），不 import `flocks.*`。
- 路径全部用 `pathlib`，兼容 Windows 与 Linux：
  - `HOME = Path.home()`
  - `WF_DIR = HOME / ".flocks" / "plugins" / "workflows" / "easm_ingest"`，转换器 `WF_DIR / "bin" / "easm_convert.py"`，schema `WF_DIR / "bin" / "easm-data-pack.schema.json"`
  - `WORKSPACE = HOME / ".flocks" / "workspace"`，staging 目录 `WORKSPACE / "easm" / "staging" / period_id`
  - `DEFAULT_DB = HOME / ".flocks" / "data" / "easm.db"`
  - 页面截图目录 `PAGE_SHOTS = HOME / ".flocks" / "plugins" / "contracts" / "webui" / "easm" / "easm-data-leaks" / "assets" / "screenshots"`
  - 摘要文件目录 `WORKSPACE / "outputs" / <YYYY-MM-DD>`（执行时取当天日期）
- 参数传递：`locate_inputs` 把全部运行参数（含默认值填充后的值）整理成一个小字典 `params` 写到 `outputs["params"]`，后续每条边都映射 `params`，各节点从 `inputs["params"]` 取参数；节点自己的业务输出用扁平字段单独映射。
- 节点失败一律 `raise RuntimeError("<清楚的原因>")`，不要吞异常；但交叉核对不一致不算失败。
- 任何地方都不得打印 `password_enc`、`password_fp` 以外的密码字段，也不得打印 `EASM_SECRET_KEY`。

### 4.1 模块表与数据包路径的对应

| 表名 | 数据包路径 | 说明 |
| --- | --- | --- |
| `domains` | `assets.domains` | |
| `ips` | `assets.ips` | |
| `websites` | `assets.websites` | 保留 `headers` 字段 |
| `services` | `assets.services` | |
| `components` | `assets.components` | |
| `certificates` | `assets.certificates` | |
| `http_configs` | `assets.http_configs` | |
| `mobile_apps` | `assets.mobile_apps` | |
| `wechat_accounts` | `assets.wechat_official_accounts` | 注意表名与数据包键名不同 |
| `wechat_mini_programs` | `assets.wechat_mini_programs` | |
| `login_portals` | `risks.login_portals` | |
| `risky_services` | `risks.risky_services` | 本期可能为空列表 |
| `certificate_risks` | `risks.certificates` | 注意表名与数据包键名不同 |
| `malicious_ip_tags` | `risks.malicious_ip_tags` | 可能为空 |
| `vulnerabilities` | `risks.vulnerabilities` | 可能为空 |
| `dark_web` | `leaks.dark_web` | |
| `files` | `leaks.files` | |
| `code` | `leaks.code` | |
| `credentials` | `leaks.credentials` | 含 `password_enc`（密文）、`password_fp`、`password_masked`，原样入库 |
| `emails` | `leaks.emails` | |
| `findings` | `findings`（顶层） | |

`risks.http_misconfigurations` 是聚合对象不是列表，不建表，放进 `summary.summary_json`。数据包顶层的 `_images` 是转换器的图片统计，不入库。

每条记录都有 `id`（实体 id）、`lifecycle`（`new` / `active` / `updated` / `closed` / `inactive`），大多数有 `severity`。

### 4.2 数据库结构（`load_db` 负责建表，全部 `CREATE ... IF NOT EXISTS`）

```sql
CREATE TABLE IF NOT EXISTS periods (
  period_id TEXT PRIMARY KEY,
  customer_id TEXT, customer_name TEXT,
  report_no INTEGER, report_date TEXT, label TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  previous_period_id TEXT,
  loaded_at TEXT, published_at TEXT, published_by TEXT,
  needs_review INTEGER NOT NULL DEFAULT 0,
  source_json TEXT
);
-- 4.1 里的 21 张模块表，结构完全相同：
CREATE TABLE IF NOT EXISTS <module> (
  period_id TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  lifecycle TEXT, severity TEXT,
  record_json TEXT NOT NULL,
  PRIMARY KEY (period_id, entity_id)
);
CREATE INDEX IF NOT EXISTS idx_<module>_pls ON <module>(period_id, lifecycle, severity);
CREATE TABLE IF NOT EXISTS summary (
  period_id TEXT PRIMARY KEY,
  summary_json TEXT, exposure_json TEXT, narrative_json TEXT, coverage_json TEXT, diff_json TEXT
);
CREATE TABLE IF NOT EXISTS period_diff (
  period_id TEXT NOT NULL, module TEXT NOT NULL, entity_id TEXT NOT NULL, change TEXT NOT NULL,
  PRIMARY KEY (period_id, module, entity_id)
);
CREATE TABLE IF NOT EXISTS findings_overlay (
  entity_id TEXT PRIMARY KEY,
  period_id TEXT,
  customer_status TEXT, owner TEXT, customer_note TEXT,
  overlay_version INTEGER NOT NULL DEFAULT 1,
  updated_by TEXT, updated_at TEXT
);
CREATE TABLE IF NOT EXISTS audit_reveal (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  period_id TEXT, entity_id TEXT, user TEXT, at TEXT, ip TEXT, note TEXT
);
CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL);
```

`findings_overlay` 与 `audit_reveal` 由页面的访问契约写入，本工作流只建表、不写。`schema_version` 为空时插入 `1`。

## 5. 模块逻辑

### 5.1 locate_inputs：解析参数与定位输入

这个节点回答：

- 这次跑的是 datapack 模式还是 convert 模式？
- 各输入文件在哪、哈希是多少？

处理逻辑：

1. 读参数并填默认值：`period_id` 必须匹配 `^[A-Za-z0-9_-]+$`，`report_no` 转 int，`report_date` 必须匹配 `^\d{4}-\d{2}-\d{2}$`；缺必填项直接失败。`customer_id` 默认 `customer`，`customer_name` 默认 `Customer Ltd`，`rebrand` 默认 空（如需替换叙事里的旧品牌名，填 `OldBrand:NewBrand`），`force` 转 bool，`db_path` 为空时用 `DEFAULT_DB`。
2. 解析 `inbox_dir`：空则 `WORKSPACE / "easm" / "inbox" / period_id`；相对路径相对于 `WORKSPACE`。`mkdir(parents=True, exist_ok=True)`。
3. `source_files` 非空时，逐个 `shutil.copy2` 到收件目录（不存在的路径记入 `skipped_sources`，不失败）。
4. 判定模式：`datapack_path` 非空且文件存在 → `mode="datapack"`；否则收件目录里有 `datapack.json` → `mode="datapack"` 且 `datapack_path` 指向它；否则 `mode="convert"`，按 3.1 的规则定位 `inventory_path`、`report_path`、`verification_path`（可选）、`narrative_path`（可选）、`previous_summary_path`（可选）。convert 模式缺 inventory 或 report → `RuntimeError`，消息里列出目录中的文件名。
5. 对每个定位到的文件算 sha256 和大小，收进 `files` 列表（`role`、`path`、`sha256`、`bytes`）。
6. `previous_period_id` 为空且 `previous_summary_path` 存在时，从该 JSON 的 `period_id` 取值填入 `params`。

工具/模型：Python 规则，不调用工具。

输出：

| 字段 | 说明 |
| --- | --- |
| `params` | 填充默认值后的全部参数字典：`period_id, report_no, report_date, customer_id, customer_name, period_label, previous_period_id, inbox_dir, db_path, force, rebrand, notify_session_id` |
| `mode` | `datapack` / `convert` |
| `datapack_path` | datapack 模式下的路径，convert 模式为空串 |
| `inventory_path` / `report_path` / `verification_path` / `narrative_path` / `previous_summary_path` | 绝对路径字符串，缺省为空串 |
| `files` | 文件清单（含 sha256） |
| `copied_sources` / `skipped_sources` | `source_files` 的处理结果 |

常见修改点：文件名匹配规则；收件目录默认位置。

### 5.2 convert：运行转换器

这个节点回答：数据包在哪。

处理逻辑：

1. `mode == "datapack"`：`outputs["datapack_path"] = inputs["datapack_path"]`，`staging_dir` 取其父目录，`convert_skipped = True`，`convert_log = ""`，直接结束。
2. `mode == "convert"`：
   - 检查 `os.environ.get("EASM_SECRET_KEY")` 非空，否则 `RuntimeError("EASM_SECRET_KEY is not set; passwords must be encrypted before loading")`。
   - `staging_dir = WORKSPACE / "easm" / "staging" / period_id`，存在则先 `shutil.rmtree` 再重建。
   - 组装命令：`[sys.executable, str(WF_DIR / "bin" / "easm_convert.py"), "--inventory", inventory_path, "--report", report_path, "--out", str(staging_dir), "--customer-id", ..., "--customer-name", ..., "--period-id", ..., "--report-no", str(report_no), "--report-date", ...]`；`verification_path` 非空时加 `--verification`；`previous_summary_path` 非空时加 `--previous-summary`；`period_label` 非空加 `--period-label`；`previous_period_id` 非空加 `--previous-period-id`；`rebrand` 非空加 `--rebrand`。
   - `subprocess.run(cmd, capture_output=True, text=True, env=dict(os.environ), timeout=1500)`。返回码非 0 → `RuntimeError`，消息带 stderr 最后 40 行。
   - 确认 `staging_dir / "datapack.json"` 存在，否则失败。
   - `convert_log` 取 stdout 最后 4000 字符；`convert_report_path = staging_dir / "convert-report.md"`（存在时）。

工具/模型：Python 规则 + 子进程，不调用 Flocks 工具。

输出：

| 字段 | 说明 |
| --- | --- |
| `datapack_path` | 数据包绝对路径 |
| `staging_dir` | 数据包所在目录 |
| `convert_skipped` | 是否跳过了转换 |
| `convert_log` | 转换器 stdout 尾部 |
| `convert_report_path` | 转换报告路径，可能为空串 |
| `params` | 透传 |

常见修改点：转换器参数；超时时间。

### 5.3 validate：schema 校验与交叉核对

这个节点回答：这份数据包能不能入库，要不要人工复核。

处理逻辑：

1. 读取 `datapack.json` 和 `WF_DIR / "bin" / "easm-data-pack.schema.json"`，用 `jsonschema.Draft202012Validator`（若 schema 无 `$schema` 声明就用 `jsonschema.validate` 的默认校验器）校验；有错误 → `RuntimeError`，消息带前 5 条错误的路径与信息。
2. 一致性：`datapack["period"]["id"] != period_id` → 失败；`datapack["customer"]["id"] != customer_id` → 记入 `warnings`（不失败）。
3. 交叉核对：`mismatches = [c for c in datapack.get("cross_checks", []) if not c.get("match")]`；`warnings = list(datapack.get("warnings", []))`。
4. 按 4.1 的对应表统计每张表的行数 `counts`（缺的路径按 0）；同时统计各模块 `lifecycle` 分布 `lifecycle_counts`。
5. `needs_review = bool(mismatches)`。

工具/模型：Python 规则。

输出：

| 字段 | 说明 |
| --- | --- |
| `datapack_path` | 透传 |
| `schema_ok` | `True` |
| `needs_review` | bool |
| `mismatches` | 交叉核对不一致列表 |
| `warnings` | 告警列表（字符串） |
| `counts` | `{表名: 行数}` |
| `lifecycle_counts` | `{表名: {lifecycle: n}}` |
| `narrative_path` | 透传（可能为空串） |
| `params` | 透传 |

常见修改点：哪些不一致算 `needs_review`。

### 5.4 load_db：写入 SQLite 与复制截图

这个节点回答：草稿期次进库了没有，行数对不对。

处理逻辑：

1. `db_path` 取 `params["db_path"]`；父目录 `mkdir(parents=True, exist_ok=True)`；`sqlite3.connect`；执行 4.2 的全部建表语句；`schema_version` 为空时插入 1。
2. 查 `periods` 里是否已有该 `period_id`：状态为 `published` 且 `force` 为假 → `RuntimeError("period <id> is published; refuse to overwrite without force=true")`。
3. 读 `datapack.json`；若 `narrative_path` 非空且文件存在，用它替换 `datapack["narrative"]`，并把 `"narrative overridden by narrative.json"` 加进 warnings。
4. 一个事务内：
   - 删除该 `period_id` 在全部 21 张模块表、`summary`、`period_diff` 中的旧行，删除 `periods` 旧行。
   - 插入 `periods`：`customer_id`、`customer_name`、`report_no`、`report_date`、`label`（取 `datapack["period"]["label"]`）、`status='draft'`、`previous_period_id`（`params` 优先，其次 `datapack["period"]["previous_period_id"]`）、`loaded_at`（UTC ISO 秒）、`published_at=NULL`、`needs_review`、`source_json`（`json.dumps(datapack.get("sources", []))`）。
   - 逐表 `executemany("INSERT OR REPLACE ...")`：`entity_id = rec["id"]`，`lifecycle = rec.get("lifecycle")`，`severity = rec.get("severity")`，`record_json = json.dumps({**rec, "period_id": period_id}, ensure_ascii=False)`。
   - 插入 `summary`：`summary_json = json.dumps({"assets": ..., "risks": ..., "leaks": ..., "counts": counts, "lifecycle_counts": ..., "previous_summary": datapack.get("previous_summary"), "http_misconfigurations": datapack["risks"].get("http_misconfigurations"), "cross_checks": ..., "warnings": ..., "scope": datapack.get("scope"), "sources": ..., "generator": datapack.get("generator"), "schema_version": datapack.get("schema_version")})`，`exposure_json`、`narrative_json`、`coverage_json` 分别取对应段；`diff_json` 先留 NULL。
   - 提交。
5. 截图：`src = Path(datapack_path).parent / "assets" / "screenshots"`；存在时 `dst = PAGE_SHOTS / period_id`，先删旧 `dst` 再 `shutil.copytree(src, dst)`；统计文件数。`src` 不存在则 `screenshots_copied = 0`。
6. 回读每张表 `COUNT(*)` 得到 `rows_inserted`，与 `counts` 逐表比较，不一致 → `RuntimeError`。

工具/模型：Python 规则（sqlite3、shutil）。

输出：

| 字段 | 说明 |
| --- | --- |
| `db_path` | 实际写入的数据库路径 |
| `period_id` | 期次 |
| `period_status` | `draft` |
| `rows_inserted` | `{表名: 行数}` |
| `screenshots_copied` | 复制的截图文件数 |
| `screenshots_dir` | 目标目录，未复制时为空串 |
| `needs_review` / `mismatches` / `warnings` / `counts` | 透传 |
| `params` | 透传 |

常见修改点：表结构（改了要同步改页面 handler 与查询工具）；截图目标目录。

### 5.5 diff：期次差异

这个节点回答：相比上一期，每个模块新增了什么、消失了什么。

处理逻辑：

1. `previous_period_id = params["previous_period_id"]`；为空时查 `periods` 里 `report_date < 本期 report_date` 的最新一期；仍为空则 `diff_mode = "none"`。
2. 对 4.1 里的每张模块表：`cur = {entity_id}`（本期），`prev = {entity_id}`（上一期，若上一期在库里有该表的行）。
   - `prev` 非空：`new = cur - prev`，`gone = prev - cur`，`kept = cur & prev`；批量写入 `period_diff(period_id, module, entity_id, change)`（先删本期该模块旧行）；模块摘要 `{"mode": "detail", "new": n, "gone": n, "kept": n}`。
   - `prev` 为空（上一期没有明细，例如上一期只有报告没有资产清单）：不写 `period_diff`；模块摘要 `{"mode": "kpi_only"}`，指标级对比由页面从 `summary.previous_summary` 读取。
3. `diff_mode`：全部模块 detail → `detail`；全部 kpi_only → `kpi_only`；混合 → `mixed`；无上一期 → `none`。
4. `UPDATE summary SET diff_json = ? WHERE period_id = ?`，内容 `{"previous_period_id": ..., "mode": diff_mode, "modules": {...}}`。

工具/模型：Python 规则。

输出：

| 字段 | 说明 |
| --- | --- |
| `previous_period_id` | 实际用于比较的上一期，可能为空串 |
| `diff_mode` | `detail` / `kpi_only` / `mixed` / `none` |
| `diff_summary` | `{表名: 模块摘要}` |
| `db_path`、`period_id`、`rows_inserted`、`screenshots_copied`、`needs_review`、`mismatches`、`warnings` | 透传 |
| `params` | 透传 |

常见修改点：上一期的选取规则。

### 5.6 notify：入库摘要

这个节点回答：管理员下一步该看什么。

处理逻辑：

1. 生成 Markdown 摘要 `summary_markdown`：标题「EASM ingest — <customer_name> — <period_id> (Report No.<report_no>, <report_date>)」；一行状态「status: draft, needs_review: yes/no, mode: datapack|convert」；表格「模块 / 行数」（`rows_inserted`）；交叉核对不一致明细（每条 `item: datapack=<n> report=<n>`）；告警列表；差异摘要（`diff_mode` 与各模块 new/gone/kept）；截图数；最后一句「Open the Reports page to review this draft, then Publish.」。摘要里不得出现任何密码字段。
2. 写文件 `WORKSPACE / "outputs" / <今天日期> / f"easm_ingest_{period_id}_{HHMMSS}.md"`（`mkdir(parents=True, exist_ok=True)`）。
3. `params["notify_session_id"]` 非空时：`r = tool.run_safe("channel_message", session_id=..., message=summary_markdown)`；`notify_sent = r["success"]`，`notify_error = r["error"]`。为空时 `notify_sent = False`，`notify_error = "no notify_session_id"`。

工具/模型：Tool: `channel_message`（可选）。

输出：

| 字段 | 说明 |
| --- | --- |
| `status` | 固定 `draft_loaded` |
| `period_id` / `db_path` | 透传 |
| `needs_review` | bool |
| `rows_inserted` | `{表名: 行数}` |
| `diff_mode` / `diff_summary` | 透传 |
| `summary_markdown` | 摘要正文 |
| `report_path` | 摘要文件路径 |
| `notify_sent` / `notify_error` | 通道发送结果 |

常见修改点：摘要格式；通知渠道。

## 6. 输出

工作流最终输出以下字段：

| 字段 | 类型 | 含义 |
| --- | --- | --- |
| `status` | string | `draft_loaded` |
| `period_id` | string | 入库的期次 |
| `db_path` | string | 数据库路径 |
| `needs_review` | bool | 交叉核对有不一致时为 true |
| `rows_inserted` | object | 每张表的行数 |
| `diff_mode` | string | `detail` / `kpi_only` / `mixed` / `none` |
| `diff_summary` | object | 每个模块的差异摘要 |
| `summary_markdown` | string | 入库摘要 |
| `report_path` | string | 摘要文件路径 |
| `notify_sent` | bool | 是否已发通道消息 |

文件落盘：摘要写 `~/.flocks/workspace/outputs/<YYYY-MM-DD>/`；数据包与截图写 `~/.flocks/workspace/easm/staging/<period_id>/`；数据库写 `~/.flocks/data/easm.db`；截图副本写 Data Leaks 页的 `assets/screenshots/<period_id>/`。不写项目代码目录。

## 7. 发布与配置

- 手动运行：Workflows 页运行，填 3.2 的参数。这是标准路径。
- 会话触发：Rex 通过 `run_workflow` 运行 `~/.flocks/plugins/workflows/easm_ingest/workflow.json`，附件路径放进 `source_files`。
- API：不发布为 API 服务（客户实例上只有管理员能入库，不给外部调用入口）。
- Syslog / Kafka / Webhook / Schedule：不支持，`config.json` 里不要保留这些触发器示例。
- 依赖：`metadata.requirements` 声明 `openpyxl>=3.1`、`xlrd>=2.0`、`python-docx>=1.1`、`pillow>=10`、`cryptography>=42`、`jsonschema>=4`；`metadata.node_timeout_s` 设为 1800（转换 16 张 sheet 和几十张截图可能需要几分钟）。
- 密钥：`EASM_SECRET_KEY` 只放在运行 Flocks 的进程环境里；不进 `config.json`、`workflow.md`、`workflow.json`。

## 8. 如何修改这个工作流

| 修改目标 | 优先改哪里 |
| --- | --- |
| 输入文件名规则、收件目录 | `locate_inputs` |
| 转换器参数、超时 | `convert` |
| 校验严格度、`needs_review` 规则 | `validate` |
| 表结构、截图目录 | `load_db`（同时改页面 handler、访问契约和查询工具） |
| 上一期选取、差异口径 | `diff` |
| 摘要格式、通知渠道 | `notify` |
| 依赖包、超时 | `workflow.json` 的 `metadata` |
| 流程结构 | 先改本文，再重新生成 `workflow.json` |

基本原则：改了输入字段要同步改样例输入；改了表结构要同步改所有读库的代码；任何时候不要把密钥或密码明文写进工作流目录。

## 9. 验证

最小验证：

1. datapack 模式：`datapack_path` 指向一份已知数据包，`db_path` 指向临时文件，跑完后各表行数与该数据包的 `convert-report.md` 一致，`periods.status = 'draft'`，`summary` 表有一行且四段 JSON 非空。
2. convert 模式：收件目录放入真实交付物，设置 `EASM_SECRET_KEY`，跑完后 `staging/<period_id>/datapack.json` 存在，`credentials` 表的 `record_json` 含 `password_enc` 且不含任何明文密码字段。
3. 边界：收件目录为空时 `locate_inputs` 失败并列出目录内容；对已发布期次重跑且 `force=false` 时 `load_db` 拒绝；`EASM_SECRET_KEY` 缺失时 `convert` 拒绝。
4. 重跑同一 `period_id` 两次，行数不翻倍。
5. 上一期无明细时 `diff_mode = kpi_only`，`period_diff` 无该期行。

验收清单：

- [ ] 三种输入模式都能被正确识别。
- [ ] 每个节点职责单一，输出字段下游都能读到；每条边都有非空 `mapping`，`params` 逐边透传。
- [ ] 各表行数与数据包一致；重跑不翻倍；已发布期次受保护。
- [ ] 截图复制到页面资源目录，路径按期次分目录。
- [ ] 摘要文件写到 outputs 目录；有通道时消息送达。
- [ ] 工作流目录、日志、摘要里没有密钥和密码明文。
