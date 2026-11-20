const fs = require("node:fs");
const {execFileSync} = require("node:child_process");
const esbuild = require("esbuild");
const cli = require.resolve("@tailwindcss/cli/package.json").replace(/package.json$/, "dist/index.mjs");
const base = execFileSync(process.execPath, [cli,"-i","base.css","--minify"], {encoding:"utf8",maxBuffer:10000000});
const js = esbuild.buildSync({entryPoints:["reader.jsx"],bundle:true,minify:true,write:false,define:{"process.env.NODE_ENV":'"production"'}}).outputFiles[0].text;
fs.writeFileSync("阅读工作台.html", '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>阅间 · 阅读工作台</title><style>'+base+fs.readFileSync("style.css","utf8")+'</style><div id="root"></div><script>'+js.replace(/<\/script/gi,"<\\/script")+'</script></html>');
