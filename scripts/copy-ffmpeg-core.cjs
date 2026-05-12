/**
 * @ffmpeg/core の wasm/js を public/ffmpeg-core にコピーし、同一オリジンから配信する。
 */
const fs = require("fs");
const path = require("path");

const srcCandidates = [
  path.join(__dirname, "../node_modules/@ffmpeg/core/dist/umd"),
  path.join(__dirname, "../node_modules/@ffmpeg/core/dist"),
];
const src = srcCandidates.find((dir) => fs.existsSync(dir));
const dest = path.join(__dirname, "../public/ffmpeg-core");

if (!src) {
  console.error(
    "copy-ffmpeg-core: @ffmpeg/core の dist/umd または dist が見つかりません。npm install を実行してください。"
  );
  process.exit(1);
}

fs.mkdirSync(dest, { recursive: true });
for (const name of fs.readdirSync(src)) {
  fs.copyFileSync(path.join(src, name), path.join(dest, name));
}
console.log("copy-ffmpeg-core: public/ffmpeg-core にコピーしました。");
