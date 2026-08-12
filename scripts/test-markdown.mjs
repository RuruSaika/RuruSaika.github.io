import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const vendorSource = await readFile(new URL("../static/vendor/markdown-it/markdown-it.umd.min.js", import.meta.url), "utf8");
const source = await readFile(new URL("../study/shared.js", import.meta.url), "utf8");
const context = { location: { hostname: "127.0.0.1" }, atob };
context.window = context;
context.self = context;
context.globalThis = context;
vm.runInNewContext(vendorSource, context);
vm.runInNewContext(source, context);

const render = context.StudyBoard.renderMarkdown;
const adjustIndent = context.StudyBoard.adjustMarkdownIndent;
const compact = (value) => value.replace(/\s+/g, "");

assert.equal(compact(render(`
- parent
  - child
    1. grandchild
  - child two
- sibling
`)), compact(`
<ul><li>parent
<ul><li>child
<ol><li>grandchild</li></ol>
</li><li>child two</li></ul>
</li><li>sibling</li></ul>
`));

assert.equal(compact(render(`
1. ordered parent
   * nested bullet
   * nested sibling
2. ordered sibling
`)), compact(`
<ol><li>ordered parent
<ul><li>nested bullet</li><li>nested sibling</li></ul>
</li><li>ordered sibling</li></ol>
`));

assert.equal(compact(render(`
- first
  - nested

Paragraph after the list.
`)), compact(`
<ul><li>first<ul><li>nested</li></ul></li></ul>
<p>Paragraph after the list.</p>
`));

const continuationList = render(`
- 顺序寻址：
  通过程序计数器形成下一条指令地址
- 跳跃寻址：
  通过转移类指令实现
  是否发生转移由条件码决定，转移方式分为：
  1. 绝对转移
  2. 相对转移
`);
assert.match(continuationList, /顺序寻址：<br>\s*通过程序计数器/);
assert.match(continuationList, /通过转移类指令实现<br>\s*是否发生转移/);
assert.equal(compact(continuationList), compact(`
<ul>
<li>顺序寻址：
<br>通过程序计数器形成下一条指令地址</li>
<li>跳跃寻址：
<br>通过转移类指令实现
<br>
是否发生转移由条件码决定，转移方式分为：
<ol><li>绝对转移</li><li>相对转移</li></ol>
</li>
</ul>
`));

const looseContinuationList = render(`
- 跳跃寻址：

  通过转移类指令实现
  是否发生转移由条件码决定，转移方式分为：
  1. 绝对转移
  2. 相对转移
`);
assert.match(looseContinuationList, /<li>\s*<p>跳跃寻址：<\/p>\s*<p>通过转移类指令实现<br>\s*是否发生转移由条件码决定，转移方式分为：<\/p>\s*<ol>/);
assert.match(looseContinuationList, /<ol>\s*<li>绝对转移<\/li>\s*<li>相对转移<\/li>\s*<\/ol>/);

const featureHtml = render(`
# 一级标题

普通段落包含 **粗体**、*斜体*、~~删除线~~、\`行内代码\` 和 [外链](https://example.com)。

> 引用
>
> - 引用内列表

3. 从三开始
4. 下一项

| 左对齐 | 居中 | 右对齐 |
| :--- | :---: | ---: |
| A | B | C |

- [x] 已完成
- [ ] 未完成

---

\`\`\`js
const value = "<safe>";
\`\`\`

[参考链接]: https://example.org "标题"
[引用式链接][参考链接]

<div class="note"><strong>HTML 内容</strong></div>
`);
assert.match(featureHtml, /<h2>一级标题<\/h2>/);
assert.match(featureHtml, /<strong>粗体<\/strong>/);
assert.match(featureHtml, /<em>斜体<\/em>/);
assert.match(featureHtml, /<s>删除线<\/s>/);
assert.match(featureHtml, /target="_blank" rel="noreferrer"/);
assert.match(featureHtml, /<blockquote>/);
assert.match(featureHtml, /<ol start="3">/);
assert.match(featureHtml, /<table>/);
assert.match(featureHtml, /class="task-list-item"/);
assert.match(featureHtml, /type="checkbox" disabled checked/);
assert.match(featureHtml, /<hr>/);
assert.match(featureHtml, /<code class="language-js">/);
assert.match(featureHtml, /&lt;safe&gt;/);
assert.match(featureHtml, /href="https:\/\/example\.org"/);
assert.match(featureHtml, /<div class="note"><strong>HTML 内容<\/strong><\/div>/);

const markHtml = render("普通 ==高亮 **粗体**== 文字，`==代码==`，未闭合 ==原样保留。");
assert.match(markHtml, /<mark>高亮 <strong>粗体<\/strong><\/mark>/);
assert.match(markHtml, /<code>==代码==<\/code>/);
assert.match(markHtml, /未闭合 ==原样保留/);
assert.doesNotMatch(render("空标记 ==== 不高亮"), /<mark>/);
assert.doesNotMatch(render("\\==转义标记=="), /<mark>/);

const rawHtml = render(`<details open><summary>展开</summary><p class="note" data-kind="demo">HTML 内容</p></details>`);
assert.match(rawHtml, /<details open><summary>展开<\/summary><p class="note" data-kind="demo">HTML 内容<\/p><\/details>/);

const imageHtml = render("![示例](asset://123e4567-e89b-12d3-a456-426614174000)");
assert.match(imageHtml, /src="https:\/\/rurusaika-home\.rurusaika-official\.chatgpt\.site\/api\/study\/assets\/123e4567-e89b-12d3-a456-426614174000"/);
assert.match(imageHtml, /loading="lazy"/);
assert.match(imageHtml, /decoding="async"/);

const indented = adjustIndent("- parent\n- child", 0, 16);
assert.equal(indented.value, "  - parent\n  - child");
assert.equal(indented.selectionStart, 2);
assert.equal(indented.selectionEnd, 20);

const restored = adjustIndent(indented.value, indented.selectionStart, indented.selectionEnd, true);
assert.equal(restored.value, "- parent\n- child");
assert.equal(restored.selectionStart, 0);
assert.equal(restored.selectionEnd, 16);

const cursorIndented = adjustIndent("- item", 2, 2);
assert.equal(cursorIndented.value, "  - item");
assert.equal(cursorIndented.selectionStart, 4);
assert.equal(cursorIndented.selectionEnd, 4);

const tabOutdented = adjustIndent("\t- item", 3, 3, true);
assert.equal(tabOutdented.value, "- item");
assert.equal(tabOutdented.selectionStart, 2);
assert.equal(tabOutdented.selectionEnd, 2);

console.log("Markdown rendering tests passed.");
