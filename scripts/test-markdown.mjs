import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../study/shared.js", import.meta.url), "utf8");
const context = { location: { hostname: "127.0.0.1" }, window: {} };
vm.runInNewContext(source, context);

const render = context.window.StudyBoard.renderMarkdown;
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

console.log("Markdown nested-list tests passed.");
