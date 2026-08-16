# Go Progress Trainer

**中英双语围棋学习系统 / Bilingual Go Learning System**

> Vibe coded with Codex · 本项目以 Vibe Coding 方式由 Codex 完成。

一个为完全零基础学习者设计的长期围棋学习系统。它不按 Day 1 / Day 2 推进，而是使用 **Learning Path + Level + Skill Mastery + 无限随机练习**：每个人按自己的节奏学习、练习、复习，再回到薄弱知识点。

## 当前已实现

- 纯 HTML、CSS、JavaScript；没有框架、没有 npm、没有后端，可直接部署到 GitHub Pages。
- 响应式深色界面，适合桌面和手机浏览器。
- 16 个长期 Level 学习路径，后续没有“毕业”限制，可继续增加 Level。
- Level 0 完整教学与 10 道可即时判定的入门互动题。
- Level 1–2 的完整入门内容：气（Liberty）、一块棋（Group）、打吃（Atari）、提子（Capture）、逃跑与延伸、发现吃子、整块提子、基础追击。
- 真正的随机题目生成：数气、找所有气、Group 判断、找打吃、一步提子、逃跑延伸。题目的棋形和正确答案由规则引擎即时生成和计算。
- `rules.js` 围棋规则引擎：棋块、气、提子、普通自杀、简单劫、合法落子检查。
- 可自由落子的 9×9 / 13×13 / 19×19 实战棋盘，支持黑白轮流、提子、撤销、重做、重开和 Pass。
- 每个 Skill 独立熟练度（0–100）、连对奖励、重复题防刷分、自动解锁、间隔复习优先级与推荐下一步。
- 训练 Session：10 / 20 / 50 / 无限题模式，结束后保存正确率和最需要复习的 Skill。
- 错题本：保存棋盘状态、题型、用户答案、正确答案、错误次数和连续答对次数；连续答对 3 次显示 `Mastered Mistake`。
- Progress、Achievements、Developer Mode、模拟 AI 复盘与本地 `localStorage` 保存。

## 目前支持的随机题型

1. 数一块黑棋的气。
2. 点击所有气。
3. 判断两颗棋是否构成同一块棋。
4. 找到正在被打吃的棋的最后一口气。
5. 点击能一步提子的点。
6. 点击能让被打吃棋延伸逃跑的点。

## 未来预留

- Level 3–15 的完整教学和随机题型（切断、死活、手筋、地盘、布局、收官等）。路径与解锁结构已就绪。
- 本地 AI 对手。
- KataGo / 其他围棋 AI 的 SGF 分析接口。AI Review 页面现有演示，未来接入时应优先解释危险棋块、气、推荐点和可记住的原则，而不是只给胜率。
- 真正的 SGF 上传解析与棋局重放。

## 文件结构

```text
index.html     页面入口
style.css      设计与响应式布局
app.js         页面、交互、训练、实战与应用控制
lessons.js     长期 Learning Path、Skill 与教学内容
rules.js       纯围棋规则引擎
board.js       可触摸的 DOM 围棋棋盘组件
practice.js    随机题目模板与局面生成
progress.js    熟练度、解锁和推荐算法
storage.js     localStorage 状态持久化
tests/         无需安装依赖的规则、随机题、布局和应用流程回归测试
```

## 运行

直接双击 `index.html` 即可使用。页面按依赖顺序加载多个普通 JavaScript 文件，因此 Chrome 的 `file://` 本地文件模式也能运行；也可以通过任何静态文件服务器打开这个目录。

## 自检

如果电脑已安装 Node.js，可在项目目录运行：

```bash
node tests/smoke-test.cjs
```

测试会检查三种棋盘尺寸的交叉点几何、围棋规则、4,400 道随机题、熟练度与解锁、主要页面、训练 Session，以及刷新后的 `localStorage` 恢复。

## GitHub Pages 部署

1. 把本目录全部文件上传到 GitHub 仓库。
2. 打开仓库 **Settings → Pages**。
3. 选择从分支部署（通常为 `main` 分支和 `/root` 目录）。

无需构建步骤。学习数据仅保存在用户当前浏览器的 `localStorage`；清除网站数据或点击 Profile 中的 **Reset Progress** 会清空进度。
