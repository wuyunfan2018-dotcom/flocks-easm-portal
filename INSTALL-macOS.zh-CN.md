# ThreatBook EASM Portal 安装指引（macOS 版 Flocks）

适用于 MacBook Air / Pro 等 Mac 电脑，Apple 芯片和 Intel 芯片都可以。Portal 装好以后的用法和 Windows 版完全一样。

> Windows 指引里的 `install-windows.cmd` 和 PowerShell 命令在 Mac 上**不能用**，请按本页操作。

**安装包里只有代码，没有任何客户数据。** 装好后是空的，你导入自己客户的报告就可以用。

---

## 0. 准备

| 需要 | 说明 |
| --- | --- |
| Mac 上已安装的 Flocks | 推荐 **2026.10.13 或更新**，用官方安装脚本装的（会有 `~/.local/bin/flocks`）。2026.9.23–2026.10.12 也能装，但这些版本每次升级 Flocks 后要重新运行一次安装。 |
| Flocks 管理员账号 | 入库、发布和撤回期次只有管理员能做。 |
| 安装包 | 方式 A 直接从 GitHub 下载；方式 B 用维护人发的 `flocks-easm-portal-<版本>.zip`。 |
| 网络 | 第一次入库时，Flocks 会下载几个 Python 包，默认从 pypi.org 下载。国内网络建议改用阿里云镜像，见第 2 节。 |

不需要安装 Xcode、Git 或 Python。下面的命令用的是 Flocks 自带的 Python，也不用 `git`：在没装开发者工具的 Mac 上，系统自带的 `git` 和 `python3` 会弹窗要求安装 Xcode 命令行工具。

---

## 1. 安装（约 5 分钟）

### 方式 A：让 Flocks 里的 Rex 帮你装（能访问 GitHub 时推荐）

在 Flocks 对话框里粘贴下面这段。如果 Rex 请求运行命令的权限，点允许：

```
Install the ThreatBook EASM Portal by running exactly this in the shell (use a 300000 ms timeout), then show me the full output and do nothing else (do not restart Flocks, do not create any key):
set -e; d="$HOME/.flocks/workspace/tmp"; mkdir -p "$d"; cd "$d"; curl -fsSL -o easm.zip https://github.com/wuyunfan2018-dotcom/flocks-easm-portal/archive/refs/heads/main.zip; rm -rf flocks-easm-portal-main; unzip -q easm.zip; cd flocks-easm-portal-main; PY="$(dirname "$(readlink "$HOME/.local/bin/flocks")")/python"; if [ ! -x "$PY" ]; then echo "ERROR: Flocks Python not found: ~/.local/bin/flocks is missing or not a symlink" >&2; exit 1; fi; EASM_WRAPPER=1 "$PY" install.py
```

输出里有 6 行 `build …: ready`，并且没有 `Traceback`、`ERROR` 或 `WARNING`，就说明装好了。第一次安装或升级版本时还会看到几行 `Hub record … written`；同一版本再装一次时没有这几行，是正常的。

然后做第 2 节。**密钥要你自己在「终端」里设置，不要让 Rex 代劳。**

### 方式 B：用维护人发的 zip

1. 先把 zip 放到「下载」文件夹里。微信收到的文件默认不在「下载」里：在微信里右键文件 →「在访达中显示」，再拖到「下载」。
   然后在「下载」里双击 zip，会解压出文件夹 `flocks-easm-portal-0.9.4`。如果「下载」里已经有同名文件夹，先把旧的移到废纸篓再双击；否则新解压的会叫 `flocks-easm-portal-0.9.4 2`，下面的命令会装成旧的那份。
2. 打开「终端」：按 ⌘ + 空格，输入「终端」或 `Terminal`，回车。
3. 粘贴下面这行，回车：

   ```bash
   cd ~/Downloads/flocks-easm-portal-0.9.4 && "$(dirname "$(readlink ~/.local/bin/flocks)")/python" install.py
   ```

   - 如果弹出「“终端”想访问“下载”文件夹中的文件」，点「好」。点了「不允许」会报 `Operation not permitted`，要到「系统设置 → 隐私与安全性 → 文件和文件夹 → 终端」里打开「下载文件夹」后再试。
   - 文件夹不在「下载」里时分两步：先输入 `cd `（cd 加一个空格），把文件夹拖进终端窗口，回车；再粘贴下面这行，回车：

   ```bash
   "$(dirname "$(readlink ~/.local/bin/flocks)")/python" install.py
   ```

判断是否装好的方法同方式 A。窗口里最后的英文 *Next steps* 可以忽略，按本指引继续。

---

## 2. 加密密钥和镜像（在「终端」里做，必须）

- **密钥 `EASM_SECRET_KEY` 的作用**：入库时，报告里「泄露凭据」的密码先用它加密，再写进数据库。在页面上点 **Reveal** 时再解密，每次都记审计日志。没有密钥，入库会报错 `EASM_SECRET_KEY is not set`。
- **一台 Flocks 一把**，不要和同事共用，也不要发到聊天、邮件或代码仓库。**所以请自己在终端里生成，不要让 Rex 生成。**
- **一定要备份**：密钥丢了，已入库的密码就再也显示不出来，其他数据不受影响。换了密钥也是一样。

先运行 `echo $SHELL`。显示 `/bin/zsh`（2019 年以后的 Mac 默认都是）就按下面做；显示 `/bin/bash` 的话看本节最后的说明。

在「终端」里粘贴下面两行，回车。第一行生成密钥并写进 `~/.zshrc`，已经有就不动；第二行设置阿里云镜像，能顺畅访问 pypi.org 的话可以不粘贴。两行都不会把密钥显示出来：

```bash
grep -q 'EASM_SECRET_KEY' ~/.zshrc 2>/dev/null || printf '\nexport EASM_SECRET_KEY=%s\n' "$(openssl rand -base64 32 | tr '+/' '-_')" >> ~/.zshrc
grep -q 'FLOCKS_UV_DEFAULT_INDEX' ~/.zshrc 2>/dev/null || printf '\nexport FLOCKS_UV_DEFAULT_INDEX=https://mirrors.aliyun.com/pypi/simple\n' >> ~/.zshrc
```

备份密钥：运行下面这行，把 `EASM_SECRET_KEY=` 后面的整串存进密码管理器。整串一共 44 个字符，**最后的 `=` 也是密钥的一部分**：

```bash
grep EASM_SECRET_KEY ~/.zshrc
```

**然后这样重启 Flocks**，否则 Flocks 读不到刚设置的内容：

1. 完全退出「终端」：在终端里按 ⌘Q；
2. 重新打开「终端」；
3. 运行 `flocks restart`。如果提示 `command not found: flocks`，改为运行 `~/.local/bin/flocks restart`。

> 原因：新设置只对之后打开的终端生效，Flocks 会继承启动它的那个终端的设置。

**用 bash 的老 Mac**（`echo $SHELL` 显示 `/bin/bash`）：不要把上面命令里的 `~/.zshrc` 直接换掉，改为粘贴下面三行。第一行保证新建的 `~/.bash_profile` 仍会读取原来的 `~/.profile` 和 `~/.bashrc`，否则 `flocks` 命令可能就找不到了：

```bash
[ -f ~/.bash_profile ] || printf '[ -f ~/.profile ] && . ~/.profile\n[ -f ~/.bashrc ] && . ~/.bashrc\n' > ~/.bash_profile
grep -q 'EASM_SECRET_KEY' ~/.bash_profile 2>/dev/null || printf '\nexport EASM_SECRET_KEY=%s\n' "$(openssl rand -base64 32 | tr '+/' '-_')" >> ~/.bash_profile
grep -q 'FLOCKS_UV_DEFAULT_INDEX' ~/.bash_profile 2>/dev/null || printf '\nexport FLOCKS_UV_DEFAULT_INDEX=https://mirrors.aliyun.com/pypi/simple\n' >> ~/.bash_profile
```

备份密钥用 `grep EASM_SECRET_KEY ~/.bash_profile`。之后同样完全退出终端、重新打开，再运行 `flocks restart`。

---

## 3. 打开 Portal

1. 浏览器打开 Flocks，刷新一下页面。
2. 点**顶部的工作区切换框**，选择 **EASM Portal**，它排在 Agent 工作区下面。左侧会出现「EASM 总览」「攻击面」「暴露风险」「数据泄露」「发现与处置」「报告与期次」六个页面。
3. 第一次打开时，每页都显示 *No period is available yet*。这是正常的，因为还没有导入数据。

---

## 4. 导入第一期报告

1. **放文件**：在「终端」里运行下面这行，「访达」会打开收件箱。`.flocks` 是隐藏文件夹，用命令打开最省事：

   ```bash
   open ~/.flocks/workspace/easm/inbox
   ```

   在里面按期次新建一个文件夹，例如 `2026Q3`，只能用字母、数字、`-` 和 `_`。然后把这一期的交付物拖进去：

   | 文件 | 是否必需 | 程序怎么认出它 |
   | --- | --- | --- |
   | 资产清单 Excel（`.xls` / `.xlsx`） | 必需 | 文件名含 `Asset Inventory`，或者文件夹里只有这一个 Excel |
   | EASM 报告 Word（`.docx`） | 必需 | 文件名含 `EASM Report`，或者除验证报告外只有这一个 Word |
   | 登录验证报告（`.docx`） | 可选 | 文件名含 `Verification` 或「验证」 |

   文件夹里不要放别的 Excel 或 Word。

2. **客户名称**（只需设置一次）：设置后，入库会自动带上客户名称；不设置的话，第一期会显示为占位名 *Customer Ltd*。在「终端」里粘贴下面三行，回车。把 `acme` 和 `ACME Ltd` 换成你的客户，名称里可以有 `'` 和 `%`；有英文双引号 `"` 时写成 `\"`。**不要用「文本编辑」写这个文件**，它会把引号改成中文弯引号，文件就读不了了：

   ```bash
   cat > ~/.flocks/workspace/easm/ingest-defaults.json <<'EOF'
   { "customer_id": "acme", "customer_name": "ACME Ltd" }
   EOF
   ```

3. **运行入库**：打开 Portal 的 **「报告与期次」** 页。
   - 还没有任何一期时，管理员会看到 **Load the first period** 卡片；
   - 已有数据时，表单在页面下方 **Period lifecycle (admin)** 卡片的底部。

   在 **Run ingest** 表单里填三项，其余留空，点 **Run ingest**：

   | 输入框 | 例子 |
   | --- | --- |
   | Period id | `2026Q3`（和第 1 步的文件夹同名） |
   | Report no. | `8` |
   | Report date YYYY-MM-DD | `2026-09-29` |

   一般 1–5 分钟，第一次要下载依赖会慢一些。显示 `success` 后页面会自动刷新。也可以在 Flocks 对话里把文件作为附件发给 Rex，说：「把这些文件作为 EASM 2026Q3、第 8 期、报告日期 2026-09-29 入库」。

4. **检查并发布**：入库后是**草稿**，只有管理员能看到。在「报告与期次」页看交叉核对和告警，没问题就点 **Publish period**，在确认框里确认。发布只是改本机数据库里的状态，**不会上传到任何地方**；发错了点 **Unpublish** 撤回。

---

## 5. 日常维护

| 场景 | 怎么做 |
| --- | --- |
| EASM 出新版本 | 再做一次第 1 节（方式 A 或 B）。数据、截图、收件箱都会保留。 |
| Flocks 升级 | Flocks 2026.10.13 及以后**什么都不用做**。更早的版本：升级后重新安装一次。 |
| 暂时隐藏 Portal | 顶部切换框 →「场景管理」→ ThreatBook EASM 卡片 →「停用」。以后点「启用」恢复。 |
| 卸载 | 在终端运行下面这行，然后 `flocks restart`。easm.db、截图和收件箱都会保留。方式 B 装的，把 `cd` 后面换成你解压出来的文件夹。<br>`cd ~/.flocks/workspace/tmp/flocks-easm-portal-main && "$(dirname "$(readlink ~/.local/bin/flocks)")/python" install.py --uninstall` |

> ⚠️ **不要在「场景管理」里点 EASM 的「卸载」**。那会把整个页面目录删掉，包括里面的**证据截图**。要卸载请用上面的命令。

---

## 6. 常见问题

| 现象 | 原因与处理 |
| --- | --- |
| 方式 A 报 `ERROR: Flocks Python not found`，或方式 B 报 `no such file or directory: …/python` | Flocks 不是用官方脚本装的，`~/.local/bin/flocks` 不存在或不是链接。在终端运行 `head -1 "$(command -v flocks)"`，`#!` 后面那一段就是 Flocks 自带的 Python。进入安装包文件夹后运行 `"这个路径" install.py`。 |
| 弹窗要求安装「命令行开发者工具」，或报 `xcrun: error` | 运行了系统自带的 `git` 或 `python3`。点「取消」关掉弹窗，原样使用本指引的命令。 |
| 顶部切换框里没有 EASM Portal | 依次试：① 重新打开终端，运行 `flocks restart`，或者在 Flocks「工具清单」页点右上角的刷新按钮，再刷新浏览器；② 在「场景管理」里确认 ThreatBook EASM 是「启用」状态；③ 重新安装一次。 |
| 入库报 `EASM_SECRET_KEY is not set` | 密钥没写进 `~/.zshrc`，或者 Flocks 不是从新打开的终端重启的。按第 2 节处理。在新终端里运行 `[ -n "$EASM_SECRET_KEY" ] && echo 已设置 \|\| echo 未设置` 可以检查。 |
| 入库报 `convert mode requires …` | 收件箱里的文件没被认出来，按第 4 节第 1 步检查文件名和文件夹名。 |
| 入库卡在下载依赖，或者报网络错误 | 按第 2 节设置阿里云镜像，退出并重新打开终端后 `flocks restart`，再运行一次入库。 |
| 点 Reveal 提示 `… encryption key not configured` | Flocks 进程里没有密钥。按第 2 节重新打开终端后 `flocks restart`。 |
| 点 Reveal 提示 `Password cannot be decrypted with the key configured on this instance` | 现在的密钥不是入库时用的那把。先运行 `sed -i '' '/EASM_SECRET_KEY/d' ~/.zshrc` 删掉现在的密钥，再用下一行「换电脑」里的 `read` 命令写回原来的密钥，然后重新打开终端，运行 `flocks restart`。 |
| 换电脑 | 先运行 `flocks stop`，再带走：`~/.flocks/data/` 下的 `easm.db`（以及 `easm.db-wal`、`easm.db-shm`，如果有）、证据截图目录 `~/.flocks/plugins/contracts/webui/easm/easm-data-leaks/assets/screenshots/`、密钥，可选 `~/.flocks/workspace/easm/`。`.flocks` 在访达里是隐藏的，可以在终端运行 `open ~/.flocks/data` 打开，或者在访达里按 ⇧⌘.（Shift+Command+句号）显示隐藏文件夹。<br>在新电脑上装好 EASM 后**不要**运行第 2 节的生成命令，改为运行下面这行，粘贴原来的密钥后回车（输入时不显示）：<br>`read -rs "k?粘贴原来的密钥后回车："; printf '\nexport EASM_SECRET_KEY=%s\n' "$k" >> ~/.zshrc; unset k`<br>然后重新打开终端，`flocks stop`，把文件放回原处（目标位置已有的 `easm.db*` 先删掉），再 `flocks start`。 |

---

## 7. 安全须知

- 客户数据只在本机，不要上传到网盘或 GitHub，也不要发到群里。具体位置：
  - 数据库：`~/.flocks/data/easm.db`
  - 证据截图：`~/.flocks/plugins/contracts/webui/easm/easm-data-leaks/assets/screenshots/`
  - 原始交付物：`~/.flocks/workspace/easm/`
- 密钥保存在 `~/.zshrc` 和你的密码管理器里，不要截图或外发，也不要把 `~/.zshrc` 发给别人。从终端启动的程序（包括 Flocks，以及 Rex 替你运行的命令）都能读到这个密钥，所以不要让 Rex 显示、打印或转发它。
- 安装包每次打包都会自动扫描，确保不含客户名称、域名、报告编号、截图或密钥。
