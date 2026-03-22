/**
 * @ffmpeg/core の wasm/js を public/ffmpeg-core にコピーし、同一オリジンから配信する。
 */
const fs = require("fs");
const path = require("path");

const src = path.join(__dirname, "../node_modules/@ffmpeg/core/dist");
const dest = path.join(__dirname, "../public/ffmpeg-core");

if (!fs.existsSync(src)) {
  console.error(
    "copy-ffmpeg-core: node_modules/@ffmpeg/core/dist が見つかりません。npm ci を実行してください。"
  );
  process.exit(1);
}

fs.mkdirSync(dest, { recursive: true });
for (const name of fs.readdirSync(src)) {
  fs.copyFileSync(path.join(src, name), path.join(dest, name));
}
console.log("copy-ffmpeg-core: public/ffmpeg-core にコピーしました。");
