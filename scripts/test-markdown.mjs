import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../study/shared.js", import.meta.url), "utf8");
const context = { location: { hostname: "127.0.0.1" }, window: {} };
vm.runInNewContext(source, context);

const render = context.window.StudyBoard.renderMarkdown;
const adjustIndent = context.window.StudyBoard.adjustMarkdownIndent;
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

console.log("Markdown list tests passed.");
