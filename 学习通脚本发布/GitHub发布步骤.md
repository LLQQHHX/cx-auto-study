# GitHub 发布步骤（一步步照着做）

要传的文件都在 `C:\Users\Nature\Desktop\学习通脚本发布\` 里：

```
学习通脚本发布\
├── cx-auto-study.user.js     ← 脚本本体（81.5 KB）
├── README.md                 ← 仓库首页说明
└── LICENSE                   ← MIT 许可证
```

---

## 第一步：注册 / 登录 GitHub

打开 https://github.com

没账号就点 **Sign up** 注册（邮箱 + 密码 + 用户名）。

**用户名很重要** —— 它会出现在你的仓库地址里，比如用户名是 `miejianguo`，仓库就是
`https://github.com/miejianguo/cx-auto-study`

---

## 第二步：新建仓库

1. 右上角 **+** → **New repository**
2. 填写：

| 字段 | 填什么 |
|---|---|
| **Repository name** | `cx-auto-study` |
| **Description** | `学习通（超星）自动刷课 Tampermonkey 脚本` |
| **Public / Private** | 选 **Public**（Private 别人看不到也装不了） |
| **Add a README file** | **勾上** |
| **Add .gitignore** | 不选 |
| **Choose a license** | 选 **MIT License** |

3. 点 **Create repository**

---

## 第三步：上传脚本文件

进入刚建好的仓库页面：

1. 点 **Add file** → **Upload files**
2. 把 `cx-auto-study.user.js` 从文件夹拖到上传区域
3. 下方 **Commit changes** 直接点确认

> 如果第三步选 license 时已经自动生成了 LICENSE 文件，就不用再传了。
> 如果没有，同样用 Upload files 把 `LICENSE` 拖上去。

---

## 第四步：替换 README

1. 在仓库首页点 `README.md` 文件名
2. 右上角 **铅笔图标**（Edit this file）
3. 全选内容删掉
4. 打开你本地 `C:\Users\Nature\Desktop\学习通脚本发布\README.md`，全选复制
5. 粘进去
6. 下方 **Commit changes** 确认

**README 里有一处链接需要改：**

```markdown
**方式 A（推荐）**：点击仓库里的 [cx-auto-study.user.js](./cx-auto-study.user.js)
```

这个 `./cx-auto-study.user.js` 是相对路径，在 GitHub 页面上会自动指向文件页，**不用改**。

---

## 第五步：拿到安装链接（关键）

**别人装脚本要用 raw 链接，不是普通页面链接。**

1. 在仓库里点开 `cx-auto-study.user.js`
2. 右上角有个 **Raw** 按钮，点它
3. 浏览器地址栏变成这样：

```
https://raw.githubusercontent.com/miejianguo/cx-auto-study/main/cx-auto-study.user.js
```

**把这个链接发出去，别人点开会自动弹出 Tampermonkey 安装页。**

---

## 第六步（可选）：发布 Release

Release 会在仓库右侧显示一个「Releases」区块，看起来更正式，也方便记录版本。

1. 仓库首页右侧点 **Releases** → **Create a new release**
2. 填写：

| 字段 | 填什么 |
|---|---|
| **Choose a tag** | 输入 `v49` → 点 **Create new tag** |
| **Release title** | `v49 首个公开版本` |
| **Describe this release** | 简单写做了什么，见下面模板 |

3. 把 `cx-auto-study.user.js` 拖到下方 **Attach binaries** 区域
4. 点 **Publish release**

**Release 说明模板（直接复制改）：**

```markdown
## 首个公开版本

### 功能
- 自动播放视频，2x 起，任务点不通过自动降速重播（2 → 1.5 → 1.25 → 1）
- 自动答视频弹题（答错换选项，穷举到答对）
- 自动切章节测验、答题、提交、确认、点下一节
- 空章节 / 本节无测验 自动跳过
- 切后台回来自动恢复，不会误判卡死

### 安装
拖动 `cx-auto-study.user.js` 到浏览器窗口，点「安装」。

### 说明
章节测验为随机作答，正确率不保证。
```

---

## 第七步（可选但推荐）：发布到 Greasy Fork

Greasy Fork 是最大的油猴脚本站，很多人是通过它找脚本的。

1. 打开 https://greasyfork.org
2. 用 GitHub 账号登录
3. 右上角用户名 → **发布脚本**
4. 填脚本地址（就是把第五步那个 raw 链接粘进去），它会自动读取 `@name` 等信息
5. 选语言、分类、许可证
6. 提交

**发布后 Greasy Fork 会给你生成一个安装页，比 raw 链接对普通用户友好得多。**

---

## 上传后检查清单

- [ ] 仓库是 **Public**
- [ ] 仓库里有 `cx-auto-study.user.js`、`README.md`、`LICENSE`
- [ ] 点 Raw 能看到脚本原文
- [ ] 用一个没装过脚本的浏览器测试：点 raw 链接 → 自动弹出 Tampermonkey 安装页 → 安装成功
- [ ] 打开学习通课程页 → 右上角出现 `📚 刷课 v49` 面板

---

## 后续更新版本

改了脚本之后：

1. 修改本地 `cx-auto-study.user.js` 里的 `@version`（比如 49.0 → 49.1）
2. 仓库里点开该文件 → 铅笔图标 → 全选替换 → Commit
3. 重新发一个 Release（tag `v49.1`）

**Tampermonkey 会根据 `@version` 判断有没有新版本。但只有在 `@updateURL` / `@downloadURL` 指向 raw 地址时才会自动提示更新**，目前脚本里没写这两行，所以更新需要用户手动重装。

要加自动更新，在脚本头部加：

```js
// @updateURL    https://raw.githubusercontent.com/miejianguo/cx-auto-study/main/cx-auto-study.user.js
// @downloadURL  https://raw.githubusercontent.com/miejianguo/cx-auto-study/main/cx-auto-study.user.js
```

---

## 常见问题

**Q：上传后中文文件名变乱码？**
用 `cx-auto-study.user.js` 这种英文文件名就不会有问题。脚本内部的 `@name` 保持中文不影响。

**Q：别人点了 raw 链接没反应？**
对方没装 Tampermonkey，或者浏览器不认识 `.user.js`。让他先装扩展。

**Q：能不能不公开？**
Private 仓库的 raw 链接需要登录才能访问，别人装不了。要分享就必须 Public。

**Q：会不会被 DMCA 或平台投诉？**
有可能。超星这类平台偶尔会投诉 GitHub 上的刷课脚本。建议：
- README 里保留免责声明
- 不要宣传成「破解」「刷分」，只描述为「前端自动化学习项目」
- 如果真被投诉删库，可以换到 Greasy Fork 或自建托管
