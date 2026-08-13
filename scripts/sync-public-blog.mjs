import { mkdir, readdir, unlink, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const SOURCE_ORIGIN = new URL(process.env.BLOG_SOURCE_ORIGIN || "https://rurusaika-home.rurusaika-official.chatgpt.site");
const REPOSITORY_ROOT = process.cwd();
const OUTPUT_ROOT = path.resolve(REPOSITORY_ROOT, "static", "blog");
const ASSET_ROOT = path.join(OUTPUT_ROOT, "assets");
const MAX_ASSET_BYTES = 8 * 1024 * 1024;
const CURL = process.platform === "win32" ? "curl.exe" : "curl";
const execFileAsync = promisify(execFile);
const RESPONSE_MARKER = Buffer.from("\n__RUWEB_CONTENT_TYPE__:");
const IMAGE_EXTENSIONS = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/gif", "gif"],
]);

if (SOURCE_ORIGIN.protocol !== "https:") throw new Error("BLOG_SOURCE_ORIGIN must use HTTPS.");
if (!OUTPUT_ROOT.startsWith(`${REPOSITORY_ROOT}${path.sep}`)) throw new Error("Static blog output escaped the repository.");

async function fetchWithCurl(url) {
  const { stdout } = await execFileAsync(CURL, [
    "--silent", "--show-error", "--fail-with-body", "--location",
    "--max-time", "30",
    "--user-agent", "Mozilla/5.0 (compatible; RuruSaikaBlogSync/1.0; +https://rurusaika.github.io/)",
    "--header", "Accept: application/json, image/*;q=0.9",
    "--header", "Origin: https://rurusaika.github.io",
    "--write-out", `${RESPONSE_MARKER.toString()}%{content_type}`,
    String(url),
  ], { encoding: "buffer", maxBuffer: 16 * 1024 * 1024, windowsHide: true });
  const markerIndex = stdout.lastIndexOf(RESPONSE_MARKER);
  if (markerIndex < 0) throw new Error(`Could not read the response metadata: ${url}`);
  return {
    body: stdout.subarray(0, markerIndex),
    contentType: stdout.subarray(markerIndex + RESPONSE_MARKER.length).toString("utf8").trim().toLowerCase(),
  };
}

async function fetchJson(pathname) {
  const response = await fetchWithCurl(new URL(pathname, SOURCE_ORIGIN));
  if (!response.contentType.includes("application/json")) throw new Error(`Expected JSON from ${pathname}.`);
  return JSON.parse(response.body.toString("utf8"));
}

function collectAssetIds(markdown) {
  const ids = new Set();
  const value = String(markdown || "");
  for (const match of value.matchAll(/asset:\/\/([a-f0-9-]+)/gi)) ids.add(match[1].toLowerCase());
  for (const match of value.matchAll(/\/api\/study\/assets\/([a-f0-9-]+)/gi)) ids.add(match[1].toLowerCase());
  return ids;
}

function rewriteAssetUrls(markdown, assetPaths) {
  return String(markdown || "")
    .replace(/asset:\/\/([a-f0-9-]+)/gi, (value, id) => assetPaths.get(id.toLowerCase()) || value)
    .replace(/\/api\/study\/assets\/([a-f0-9-]+)/gi, (value, id) => assetPaths.get(id.toLowerCase()) || value);
}

async function downloadAsset(id) {
  const response = await fetchWithCurl(new URL(`/api/study/assets/${id}`, SOURCE_ORIGIN));
  const contentType = response.contentType.split(";", 1)[0].trim();
  const extension = IMAGE_EXTENSIONS.get(contentType);
  if (!extension) throw new Error(`Unsupported mirrored asset type for ${id}: ${contentType || "unknown"}`);
  const bytes = response.body;
  if (!bytes.length || bytes.length > MAX_ASSET_BYTES) throw new Error(`Invalid mirrored asset size for ${id}: ${bytes.length}`);
  return { bytes, fileName: `${id}.${extension}`, publicPath: `/static/blog/assets/${id}.${extension}` };
}

const listPayload = await fetchJson("/api/study/posts?limit=100");
if (!Array.isArray(listPayload.posts)) throw new Error("The public post list is invalid.");

const posts = [];
for (const item of listPayload.posts) {
  if (!item?.slug) throw new Error("A published post is missing its slug.");
  const detail = await fetchJson(`/api/study/posts/${encodeURIComponent(item.slug)}`);
  if (!detail?.post || detail.post.status === "draft") throw new Error(`The public post payload is invalid: ${item.slug}`);
  posts.push(detail.post);
}

const assetIds = new Set();
posts.forEach((post) => collectAssetIds(post.content).forEach((id) => assetIds.add(id)));
const downloadedAssets = await Promise.all([...assetIds].sort().map(downloadAsset));
const assetPaths = new Map(downloadedAssets.map((asset) => [asset.fileName.replace(/\.[^.]+$/, ""), asset.publicPath]));

const snapshot = {
  schemaVersion: 1,
  source: SOURCE_ORIGIN.origin,
  homepageSort: listPayload.homepageSort === "published_at" ? "published_at" : "updated_at",
  posts: posts.map((post) => ({ ...post, content: rewriteAssetUrls(post.content, assetPaths) })),
};

await mkdir(ASSET_ROOT, { recursive: true });
for (const asset of downloadedAssets) await writeFile(path.join(ASSET_ROOT, asset.fileName), asset.bytes);
await writeFile(path.join(OUTPUT_ROOT, "posts.json"), `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");

const expectedAssets = new Set(downloadedAssets.map((asset) => asset.fileName));
for (const fileName of await readdir(ASSET_ROOT)) {
  if (/^[a-f0-9-]+\.(?:jpg|png|webp|gif)$/i.test(fileName) && !expectedAssets.has(fileName)) {
    await unlink(path.join(ASSET_ROOT, fileName));
  }
}
console.log(`Mirrored ${posts.length} published post(s) and ${downloadedAssets.length} asset(s).`);
