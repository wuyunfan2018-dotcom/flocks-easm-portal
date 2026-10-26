# ThreatBook EASM Portal 安装指引（Windows 版 Flocks）

EASM Portal 是装在 Flocks 里的一个场景工作区，包含六个页面：EASM 总览、攻击面、暴露风险、数据泄露、发现与处置、报告与期次。另外还有一个入库工作流，负责把季度 EASM 交付物（资产清单 Excel + 报告 Word）导入成一期快照。

**安装包里只有代码，没有任何客户数据。** 装好后是空的，你导入自己客户的报告就可以用。

---

## 0. 准备

| 需要 | 说明 |
| --- | --- |
| Windows 上已安装的 Flocks | 推荐 **2026.10.13 或更新**。2026.9.23–2026.10.12 也能装，但这些版本每次升级 Flocks 后要重新运行一次安装程序。 |
| Flocks 管理员账号 | 入库、发布和撤回期次只有管理员能做。 |
| 安装包 | 维护人发的 `flocks-easm-portal-<版本>.zip`，或者用方式 B 从 GitHub 获取。 |
| 网络 | 第一次入库时，Flocks 会下载几个 Python 包，默认从 pypi.org 下载。国内网络建议改用阿里云镜像，一键安装会问你。 |

方式 A 不需要另外安装 Python、Node 或 Git。方式 B 需要电脑上装有 Git，并且能访问 GitHub。

---

## 1. 安装（约 5 分钟）

### 方式 A：一键安装（推荐）

1. **先完整解压**：右键 zip →「全部解压缩」，解压到任意目录，比如 `下载\flocks-easm-portal-0.9.4`。路径里有中文、空格都可以。不要在压缩包里直接双击运行。
2. 打开解压出来的文件夹，双击 **`install-windows.cmd`**。
   - 如果出现「Windows 已保护你的电脑」，点「更多信息」→「仍要运行」。
3. 窗口会依次问你四个问题：

   | 问题 | 怎么答 |
   | --- | --- |
   | 现在生成并保存 EASM 加密密钥？[Y/n] | 直接回车。**生成后马上备份**，原因见第 2 节。 |
   | 国内网络建议用阿里云镜像，现在设置？[Y/n] | 国内网络直接回车；能顺畅访问 pypi.org 的话可以输入 `n`。 |
   | 客户名称（例如 ACME Ltd；直接回车跳过） | 输入报告上显示的客户名称。也可以先跳过，以后再填（第 4 节）。 |
   | 现在重启 Flocks 让 EASM 生效？[y/N] | 输入 `y` 回车。重启会中断正在进行的对话和任务；有任务在跑就先回车跳过，稍后按屏幕提示自己重启。 |

4. 看到 `=== 完成 ===` 就装好了，按任意键关闭窗口。窗口里滚过的英文日志可以忽略，以最后的中文提示为准。

### 方式 B：让 Flocks 里的 Rex 帮你装

前提：电脑装了 Git for Windows，并且能访问 GitHub。在 Flocks 对话框里粘贴下面这段：

```
Install the ThreatBook EASM Portal by running exactly this PowerShell (use a 300000 ms timeout), then show me the full output:
$d = Join-Path $HOME '.flocks\workspace\tmp\flocks-easm-portal'; if (Test-Path (Join-Path $d '.git')) { git -C $d pull } else { git clone https://github.com/wuyunfan2018-dotcom/flocks-easm-portal $d }; & (Join-Path $d 'install-windows.cmd') -Yes -NoKey -NoRestart
```

Rex 装完后还有两件事要自己做：按第 2 节设置加密密钥，然后按第 2 节的方法重启 Flocks。Rex 不会替你生成密钥，也不会重启 Flocks。

---

## 2. 加密密钥 `EASM_SECRET_KEY`

- **作用**：入库时，报告里「泄露凭据」的密码先用这把密钥加密，再写进数据库。在页面上点 **Reveal** 时再解密，每次都记一条审计日志。没有密钥，入库会报错 `EASM_SECRET_KEY is not set`。
- **一台 Flocks 一把**，不要和同事共用，也不要发到聊天、邮件或代码仓库。
- **一定要备份**：密钥丢了，已入库的密码就再也显示不出来，其他数据不受影响。换了密钥也是一样，旧期次的密码会解不开。

一键安装已经帮你生成。如果用了方式 B，或者跳过了这一步，在 **PowerShell** 里运行下面两行，生成并保存密钥：

```powershell
$b = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
[Environment]::SetEnvironmentVariable('EASM_SECRET_KEY', [Convert]::ToBase64String($b).Replace('+','-').Replace('/','_'), 'User')
```

国内网络建议同时设置 Python 包镜像（一键安装时选了「是」就不用再设）：

```powershell
[Environment]::SetEnvironmentVariable('FLOCKS_UV_DEFAULT_INDEX', 'https://mirrors.aliyun.com/pypi/simple', 'User')
```

查看密钥（用于备份，只在你自己的电脑上执行）：

```powershell
[Environment]::GetEnvironmentVariable('EASM_SECRET_KEY','User')
```

**设置完必须这样重启 Flocks**，否则 Flocks 读不到刚设置的内容：

1. 关闭所有已经打开的命令行或 PowerShell 窗口；
2. 新开一个 PowerShell；
3. 运行 `flocks restart`。

> 原因：Windows 的环境变量只对设置之后新启动的程序生效。从旧窗口重启的 Flocks 读不到新密钥。

---

## 3. 打开 Portal

1. 浏览器打开 Flocks，刷新一下页面。
2. 点**顶部的工作区切换框**，选择 **EASM Portal**，它排在 Agent 工作区下面。左侧会出现「EASM 总览」「攻击面」「暴露风险」「数据泄露」「发现与处置」「报告与期次」六个页面。
3. 第一次打开时，每页都显示 *No period is available yet*。这是正常的，因为还没有导入数据。

没看到 EASM Portal？看第 6 节。

---

## 4. 导入第一期报告

1. **放文件**：在资源管理器地址栏输入下面的路径并回车（这个文件夹由安装程序创建好了）：

   ```
   %USERPROFILE%\.flocks\workspace\easm\inbox
   ```

   在里面按期次新建一个文件夹，例如 `2026Q3`，只能用字母、数字、`-` 和 `_`。然后把这一期的交付物放进去：

   | 文件 | 是否必需 | 程序怎么认出它 |
   | --- | --- | --- |
   | 资产清单 Excel（`.xls` / `.xlsx`） | 必需 | 文件名含 `Asset Inventory`，或者文件夹里只有这一个 Excel |
   | EASM 报告 Word（`.docx`） | 必需 | 文件名含 `EASM Report`，或者除验证报告外只有这一个 Word |
   | 登录验证报告（`.docx`） | 可选 | 文件名含 `Verification` 或「验证」 |

   文件夹里不要放别的 Excel 或 Word。入库前最好把这些文件在 Word/Excel 里关掉。

2. **客户名称**（只需设置一次，一键安装时填过就跳过）：设置后，入库会自动带上客户名称。不设置的话，客户名会沿用上一期，第一期则显示为占位名 *Customer Ltd*。设置方法：
   - 打开记事本，粘贴：`{ "customer_id": "acme", "customer_name": "ACME Ltd" }`（换成你的客户）；
   - 「另存为」时把「保存类型」选成「所有文件」，文件名填 `ingest-defaults.json`，编码选「UTF-8」；
   - 保存到 `%USERPROFILE%\.flocks\workspace\easm\`；
   - 在资源管理器「查看」里勾选「文件扩展名」，确认文件名不是 `ingest-defaults.json.txt`。

3. **运行入库**：打开 Portal 的 **「报告与期次」** 页。
   - 还没有任何一期时，管理员会看到 **Load the first period** 卡片；
   - 已有数据时，表单在页面下方 **Period lifecycle (admin)** 卡片的底部。

   在 **Run ingest** 表单里填三项，其余留空，点 **Run ingest**：

   | 输入框 | 例子 |
   | --- | --- |
   | Period id | `2026Q3`（和第 1 步的文件夹同名） |
   | Report no. | `8` |
   | Report date YYYY-MM-DD | `2026-09-29` |

   表单下方会显示运行状态，一般 1–5 分钟，第一次要下载依赖会慢一些。显示 `success` 后页面会自动刷新。

   也可以在 Flocks 对话里把文件作为附件发给 Rex，说：「把这些文件作为 EASM 2026Q3、第 8 期、报告日期 2026-09-29 入库」。

4. **检查并发布**：入库后是**草稿**，只有管理员能看到。在「报告与期次」页看交叉核对和告警，没问题就点 **Publish period**，在弹出的确认框里确认。如果这一期带有 *Needs review* 标记，确认框会特别提示，确认即表示你已经复核过。
   - 发布只是把本机数据库里这一期的状态改成「已发布」，让成员账号也能看到，**不会上传到任何地方**。
   - 发错了，同一位置点 **Unpublish** 撤回。

---

## 5. 日常维护

| 场景 | 怎么做 |
| --- | --- |
| EASM 出新版本 | 解压新 zip，再双击一次 `install-windows.cmd`。数据、截图、收件箱都会保留。 |
| Flocks 升级 | Flocks 2026.10.13 及以后**什么都不用做**。更早的版本：升级后重新运行一次安装程序。 |
| 暂时隐藏 Portal | 顶部切换框 →「场景管理」→ ThreatBook EASM 卡片 →「停用」。以后点「启用」恢复。 |
| 卸载 | 在解压目录的空白处按住 Shift 右键 →「在终端中打开」（Windows 10 叫「在此处打开 PowerShell 窗口」），运行 `.\install-windows.cmd -Uninstall`，然后重启 Flocks。easm.db、截图和收件箱都会保留。 |
| 客户自己登录查看 | 需要 Flocks Pro 的成员账号。成员只能看到已发布的期次，不能入库或发布；在已发布的期次里可以点 Reveal 查看泄露的密码，每次都记审计日志。 |

> ⚠️ **不要在「场景管理」里点 EASM 的「卸载」**。那会把整个页面目录删掉，包括里面的**证据截图**。要卸载请用上面的 `-Uninstall` 命令。

---

## 6. 常见问题

| 现象 | 原因与处理 |
| --- | --- |
| 双击后提示 `install.py was not found`，或者窗口一闪就没了 | 没有先完整解压。右键 zip →「全部解压缩」，再到解压出来的文件夹里双击。 |
| 提示脚本「未进行数字签名」或「禁止运行脚本」 | 公司策略不允许运行 PowerShell 脚本。可以找 IT 处理，或者改用 Flocks 自带的 Python 直接运行：在 PowerShell 里执行 `Get-Content $env:USERPROFILE\.local\bin\flocks.cmd`，第二行引号里的就是 python.exe 的路径；在解压目录里运行 `& "这个路径" install.py`。然后按第 2 节手动设置密钥并重启。 |
| 提示「没有找到 Flocks」 | 先安装并启动一次 Flocks，再运行安装程序。 |
| 顶部切换框里没有 EASM Portal | 依次试：① 新开 PowerShell 运行 `flocks restart`，或者在 Flocks「工具清单」页点右上角的刷新按钮，再刷新浏览器；② 在「场景管理」里确认 ThreatBook EASM 是「启用」状态；③ 再双击一次 `install-windows.cmd`。 |
| 入库报 `EASM_SECRET_KEY is not set` | 没有设置密钥，或者 Flocks 不是从新窗口重启的。按第 2 节处理。 |
| 入库报 `convert mode requires asset inventory …` 或 `… EASM Report docx …` | 收件箱里的文件没被认出来，按第 4 节第 1 步检查文件名和文件夹名，错误信息里会列出它看到的文件。 |
| 入库卡在下载依赖，或者报网络错误 | 检查网络和公司代理。国内网络按第 2 节设置阿里云镜像，然后在新窗口里 `flocks restart`，再运行一次入库。 |
| 点 Reveal 提示 `Password reveal is not available on this instance (encryption key not configured)` | Flocks 进程里没有密钥。按第 2 节在新窗口里 `flocks restart`。 |
| 点 Reveal 提示 `Password cannot be decrypted with the key configured on this instance` | 现在的密钥不是入库时用的那把，常见于换了电脑或重新生成过密钥。换回原来的密钥，然后重启 Flocks。 |
| 页面空白或显示构建错误 | 再双击一次 `install-windows.cmd`，它会重新构建全部页面。 |
| 交叉核对显示 mismatch | 数据和报告标题里的数字对不上，常见原因是报告笔误或表格里有重复行。核对后仍然可以发布，告警会一直保留在「报告与期次」页。 |
| 换电脑或重装系统 | 先运行 `flocks stop`，再带走：① `%USERPROFILE%\.flocks\data\` 下的 `easm.db`，以及同名的 `easm.db-wal`、`easm.db-shm`（如果有）；② 证据截图目录 `%USERPROFILE%\.flocks\plugins\contracts\webui\easm\easm-data-leaks\assets\screenshots\`；③ 密钥；④（可选）`%USERPROFILE%\.flocks\workspace\easm\`。在新电脑上装好 EASM、设好**同一把**密钥，然后 `flocks stop`，把文件放回原处（目标位置已有的 easm.db* 先删掉），最后 `flocks start`。 |

---

## 7. 安全须知

- 客户数据只在本机，不要上传到网盘或 GitHub，也不要发到群里。具体位置：
  - 数据库：`%USERPROFILE%\.flocks\data\easm.db`
  - 证据截图：`%USERPROFILE%\.flocks\plugins\contracts\webui\easm\easm-data-leaks\assets\screenshots\`
  - 原始交付物：`%USERPROFILE%\.flocks\workspace\easm\`
- 密钥和数据库要分开保管。
- 安装包每次打包都会自动扫描，确保不含客户名称、域名、报告编号、截图或密钥。

---

## 附：安装程序改动了哪些地方

Flocks 2026.10.13 及以后，所有改动都在你的 Windows 账号目录 `%USERPROFILE%\.flocks\` 下，不改 Flocks 自己的安装目录。2026.9.23–2026.10.12 的 Flocks 例外：安装程序还会把场景套件登记到 Flocks 安装目录里的 `.flocks\flockshub\`，所以这些版本升级 Flocks 后要重装。

| 位置 | 内容 |
| --- | --- |
| `plugins\contracts\webui\easm\` | 六个页面 |
| `plugins\contracts\access\easm\` | 访问契约：查看密码（Reveal，带审计）、客户处理状态、发布期次 |
| `plugins\workflows\easm_ingest\` | 入库工作流 |
| `plugins\skills\easm-ingest\` | 让 Rex 在对话里入库的技能 |
| `workspace\easm\inbox\` | 收件箱（空文件夹） |
| `hub-extensions\threatbook-easm\` | 场景套件的 Hub 目录 |
| `plugins\tasks\threatbook_easm_hub.py`、`plugins\tools\python\threatbook_easm_hub_tools.py` | 约 40 行的启动脚本。Flocks 每次启动时用它登记上面的 Hub 目录，所以 Flocks 升级后 Portal 不会消失 |
| `plugins\components\easm-portal\`、`data\hub\installed.json` | 让「场景管理」显示「已安装」 |
| `plugins\contracts\webui\.workspace-state.json` | 把 EASM 工作区设为启用 |
| 用户环境变量 `EASM_SECRET_KEY`、`FLOCKS_UV_DEFAULT_INDEX`，以及 `workspace\easm\ingest-defaults.json` | 只有在你同意或填写时才会写入；已经存在的不会改动 |
