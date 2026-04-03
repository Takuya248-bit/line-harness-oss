import { execFileSync } from "child_process";
import sharp from "sharp";
import fs from "fs";
import path from "path";

const CEREBRAS_KEY = process.env.CEREBRAS_API_KEY;
const PEXELS_KEY = process.env.PEXELS_API_KEY;
const TMP = "/tmp/ig-reel-v3";
const W = 1080, H = 1920, FPS = 30;
fs.mkdirSync(TMP, { recursive: true });

// ネタ定義（店名+一言+Pexels検索クエリ）
const spots = [
  { name:"Revolver Espresso", fact:"ラテアート世界王者の一杯", query:"latte art coffee" },
  { name:"Crate Cafe", fact:"WiFi爆速 ノマドの聖地", query:"coworking cafe laptop" },
  { name:"Satu Satu Coffee", fact:"バリ豆100% 自家焙煎", query:"coffee roasting beans" },
  { name:"The Slow", fact:"プール付き 1杯400円", query:"pool cafe tropical resort" },
  { name:"Machinery Cafe", fact:"工場リノベ IG映え確定", query:"industrial interior cafe" },
];

// 1. LLM（短いテロップ用。ナレーションは別途生成）
console.log("[1/6] プラン生成...");
const res = await fetch("https://api.cerebras.ai/v1/chat/completions", {
  method:"POST", headers:{"Content-Type":"application/json",Authorization:`Bearer ${CEREBRAS_KEY}`},
  body: JSON.stringify({ model:"qwen-3-235b-a22b-instruct-2507", temperature:0.7, max_tokens:512,
    messages:[{role:"user",content:`Instagramリール台本。JSONのみ返して。余計な説明不要。

テーマ: チャングーカフェTOP5
店リスト:
${spots.map((s,i)=>`${i+1}. ${s.name} - ${s.fact}`).join("\n")}

ルール:
- hookText: 15字以内。「知ってた？」「マジで？」系の短い一言
- facts: 画面テロップ用。各15字以内。店名は入れない（別表示する）
- narrationTexts: 読み上げ用。各25字以内。友達に話す感じ、です/ます禁止
- ctaText: 10字以内

良い例: {"hookText":"チャングー行くなら必見","facts":["世界王者のラテアート","WiFi爆速ノマド天国","バリ豆100%焙煎","プール付き1杯400円","工場リノベで超映え"],"narrationTexts":["ラテアートの世界チャンピオンが淹れてくれるよ","WiFi50Mbpsでノマドにはたまらない","豆は全部バリ島産で自家焙煎なんだよね","プール入りながらコーヒー400円とかヤバくない？","廃工場リノベでめっちゃ映えるの"],"ctaText":"全部行ってみて"}

{"hookText":"","facts":["","","","",""],"narrationTexts":["","","","",""],"ctaText":""}`}]
  })
});
const d=await res.json(); let c=d.choices[0].message.content.replace(/[\u200B-\u200D\u2060\uFEFF\u200C]/g,"");
const m=c.match(/\{[\s\S]*\}/); if(m) c=m[0];
const plan=JSON.parse(c);
console.log(`  hook: ${plan.hookText}`);
plan.facts.forEach((f,i)=>console.log(`  ${i+1}. [${spots[i].name}] ${f}`));
console.log(`  CTA: ${plan.ctaText}`);

// 2. Pexels（店ごとに検索）
console.log("\n[2/6] 動画取得...");
const urls=[];
for(const spot of spots){
  try{
    const r=await fetch(`https://api.pexels.com/videos/search?query=${encodeURIComponent(spot.query)}&orientation=portrait&per_page=2`,{headers:{Authorization:PEXELS_KEY}});
    const j=await r.json();
    let found=false;
    for(const v of(j.videos||[])){
      const mp4s=v.video_files.filter(f=>f.file_type==="video/mp4"&&Math.min(f.width,f.height)>=720);
      if(mp4s.length>0&&!found){mp4s.sort((a,b)=>b.width*b.height-a.width*a.height);urls.push(mp4s[0].link);found=true;}
    }
    if(!found) urls.push(null);
  }catch{urls.push(null);}
}
// Hook用にもう1本
try{
  const r=await fetch(`https://api.pexels.com/videos/search?query=bali+street+canggu&orientation=portrait&per_page=1`,{headers:{Authorization:PEXELS_KEY}});
  const j=await r.json();
  const v=(j.videos||[])[0];
  if(v){const mp4s=v.video_files.filter(f=>f.file_type==="video/mp4"&&Math.min(f.width,f.height)>=720);if(mp4s.length)urls.unshift(mp4s[0].link);}
}catch{}
console.log(`  ${urls.filter(Boolean).length}/${spots.length+1}本取得`);

// 3. TTS
console.log("\n[3/5] TTS生成...");
const voices=[];
const texts=[plan.hookText,...(plan.narrationTexts||plan.facts)];
for(let i=0;i<texts.length;i++){
  const o=path.join(TMP,`v${i}.mp3`);
  try{execFileSync("edge-tts",["--voice","ja-JP-NanamiNeural","--text",texts[i],"--write-media",o],{timeout:15000,stdio:"pipe"});voices.push(o);}
  catch{voices.push(null);}
}
console.log(`  ${voices.filter(Boolean).length}/${texts.length}本`);

// probeDuration: ffprobeで音声ファイルの長さを取得
function probeDuration(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    const out = execFileSync("ffprobe", ["-v","quiet","-show_entries","format=duration","-of","csv=p=0", filePath], {encoding:"utf8"});
    return parseFloat(out.trim()) || null;
  } catch { return null; }
}

// generateWhoosh: lavfiでsine sweepのSFXを生成
function generateWhoosh(outPath) {
  execFileSync("ffmpeg",["-y","-f","lavfi","-i","sine=frequency=800:duration=0.3",
    "-af","afade=t=in:st=0:d=0.05,afade=t=out:st=0.2:d=0.1,aformat=sample_rates=44100",
    outPath],{stdio:"pipe"});
}

// 4. テロップ画像生成(sharp SVG overlay)
console.log("\n[4/5] テロップ画像生成...");
function textSvg(text, fontSize, y, opts={}) {
  const {num, accent="#00BCD4", boxBg="rgba(0,0,0,0.6)"} = opts;
  const lines = [];
  const maxChar = fontSize > 50 ? 12 : 14;
  for(let i=0;i<text.length;i+=maxChar) lines.push(text.slice(i,i+maxChar));

  const lineH = fontSize * 1.5;
  const pad = 40;
  const totalH = lines.length * lineH + pad * 2;
  // 画面幅いっぱいの帯スタイル（左右30pxマージン）
  const boxW = W - 60;
  const boxX = 30;
  const boxY = y - pad;
  const textStartY = y + lineH * 0.75;

  let svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">`;
  // Band background
  svg += `<rect x="${boxX}" y="${boxY}" width="${boxW}" height="${totalH}" rx="20" fill="${boxBg}"/>`;
  // Text
  lines.forEach((l, i) => {
    svg += `<text x="${W/2}" y="${textStartY + i*lineH}" text-anchor="middle" font-size="${fontSize}" font-weight="900" fill="white" font-family="sans-serif">${l.replace(/&/g,"&amp;").replace(/</g,"&lt;")}</text>`;
  });
  // Number badge + shop name (左上)
  if(num != null) {
    const {shopName=""} = opts;
    svg += `<rect x="30" y="60" width="100" height="100" rx="20" fill="${accent}" opacity="0.9"/>`;
    svg += `<text x="80" y="130" text-anchor="middle" font-size="60" font-weight="900" fill="white" font-family="sans-serif">${String(num).padStart(2,"0")}</text>`;
    if(shopName) {
      svg += `<text x="150" y="125" font-size="32" font-weight="900" fill="white" font-family="sans-serif" style="text-shadow:1px 1px 3px rgba(0,0,0,0.8)">${shopName.replace(/&/g,"&amp;").replace(/</g,"&lt;")}</text>`;
    }
  }
  svg += `</svg>`;
  return Buffer.from(svg);
}

const overlays = [];
// Hook overlay (テロップ下1/3)
overlays.push(await sharp(textSvg(plan.hookText, 52, H * 0.72)).png().toBuffer());
// Fact overlays (テロップ下1/3 + 店名)
for(let i=0;i<plan.facts.length;i++){
  overlays.push(await sharp(textSvg(plan.facts[i], 44, H * 0.72, {num:i+1, shopName:spots[i]?.name})).png().toBuffer());
}
// CTA overlay
const ctaSvg = Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#004D40"/><stop offset="100%" stop-color="#00BCD4"/></linearGradient></defs>
  <rect width="${W}" height="${H}" fill="url(#bg)" opacity="0.85"/>
  <text x="${W/2}" y="${H/2-40}" text-anchor="middle" font-size="48" font-weight="900" fill="white" font-family="sans-serif">${plan.ctaText.replace(/&/g,"&amp;").replace(/</g,"&lt;").slice(0,20)}</text>
  <text x="${W/2}" y="${H/2+30}" text-anchor="middle" font-size="48" font-weight="900" fill="white" font-family="sans-serif">${(plan.ctaText.length>20?plan.ctaText.slice(20):"").replace(/&/g,"&amp;").replace(/</g,"&lt;")}</text>
  <rect x="${W/2-200}" y="${H/2+80}" width="400" height="70" rx="35" fill="#06C755"/>
  <text x="${W/2}" y="${H/2+125}" text-anchor="middle" font-size="28" font-weight="900" fill="white" font-family="sans-serif">プロフィールのリンクから</text>
</svg>`);
overlays.push(await sharp(ctaSvg).png().toBuffer());

// 5. 動画合成
console.log("\n[5/6] 動画合成...");
const clips=[];
for(let i=0;i<Math.min(urls.length,7);i++){
  const cp=path.join(TMP,`c${i}.mp4`);
  if(!fs.existsSync(cp)){
    try{const r=await fetch(urls[i],{signal:AbortSignal.timeout(30000)});fs.writeFileSync(cp,Buffer.from(await r.arrayBuffer()));}catch{continue;}
  }
  clips.push(cp);
}

const DC=5;
const segs=[];

for(let i=0;i<plan.facts.length+2;i++){
  // TTS音声長でクリップ尺を動的決定（CTAはDC固定）
  let dur;
  if(i > plan.facts.length) {
    dur = DC;
  } else {
    const ttsLen = probeDuration(voices[i]);
    dur = ttsLen != null ? Math.max(ttsLen + 0.5, 2) : 2;
  }
  const clipIdx=i%clips.length;
  const overlayPath=path.join(TMP,`ov${i}.png`);
  fs.writeFileSync(overlayPath, overlays[i]);
  
  const segSilent=path.join(TMP,`s${i}-s.mp4`);
  const segFinal=path.join(TMP,`s${i}.mp4`);
  
  if(i < plan.facts.length+1 && clips.length > 0) {
    // Video clip + overlay
    execFileSync("ffmpeg",["-y","-stream_loop","-1","-i",clips[clipIdx],"-i",overlayPath,
      "-filter_complex",`[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}[bg];[bg][1:v]overlay=0:0[out]`,
      "-map","[out]","-t",String(dur),"-r",String(FPS),"-an","-c:v","libx264","-pix_fmt","yuv420p",segSilent],{stdio:"pipe"});
  } else {
    // CTA: gradient bg from overlay
    execFileSync("ffmpeg",["-y","-loop","1","-i",overlayPath,
      "-vf",`scale=${W}:${H},format=yuv420p`,
      "-t",String(dur),"-r",String(FPS),"-an","-c:v","libx264","-pix_fmt","yuv420p",segSilent],{stdio:"pipe"});
  }
  
  // Add audio
  const vp=voices[i]||null;
  const segWithAudio=path.join(TMP,`s${i}-a.mp4`);
  if(vp&&fs.existsSync(vp)){
    execFileSync("ffmpeg",["-y","-i",segSilent,"-i",vp,"-filter_complex",`[1:a]aformat=sample_rates=44100:channel_layouts=stereo,apad=whole_dur=${dur}[a1]`,"-map","0:v","-map","[a1]","-t",String(dur),"-c:v","copy","-c:a","aac","-b:a","192k",segWithAudio],{stdio:"pipe"});
  } else {
    execFileSync("ffmpeg",["-y","-i",segSilent,"-f","lavfi","-i","anullsrc=r=44100:cl=stereo","-filter_complex",`[1:a]atrim=0:${dur},asetpts=PTS-STARTPTS[a1]`,"-map","0:v","-map","[a1]","-t",String(dur),"-c:v","copy","-c:a","aac","-b:a","192k",segWithAudio],{stdio:"pipe"});
  }

  // Add whoosh SFX to Hook/Fact segments (末尾0.3秒にオーバーレイ)
  if(i <= plan.facts.length) {
    const whooshPath=path.join(TMP,`whoosh${i}.mp3`);
    generateWhoosh(whooshPath);
    const whooshDelay=Math.max(0, dur - 0.3);
    execFileSync("ffmpeg",["-y","-i",segWithAudio,"-i",whooshPath,
      "-filter_complex",`[1:a]adelay=${Math.round(whooshDelay*1000)}|${Math.round(whooshDelay*1000)},volume=0.3[sfx];[0:a][sfx]amix=inputs=2:duration=first[aout]`,
      "-map","0:v","-map","[aout]","-t",String(dur),"-c:v","copy","-c:a","aac","-b:a","192k",segFinal],{stdio:"pipe"});
  } else {
    fs.copyFileSync(segWithAudio, segFinal);
  }
  segs.push(segFinal);
  console.log(`  seg${i} done (${dur}s)`);
}

// Concat with xfade crossfade (0.3s between segments)
const XFADE=0.3;
const concatOut=path.join(TMP,"concat.mp4");
const segDurs=segs.map(s=>probeDuration(s)||3);

if(segs.length===1){
  fs.copyFileSync(segs[0],concatOut);
} else {
  const fc=[];
  let prevV="0:v", prevA="0:a";
  for(let i=1;i<segs.length;i++){
    const offset=segDurs.slice(0,i).reduce((a,d)=>a+d,0)-i*XFADE;
    const vOut=i===segs.length-1?"vout":`vx${i}`;
    const aOut=i===segs.length-1?"aout":`ax${i}`;
    fc.push(`[${prevV}][${i}:v]xfade=transition=fade:duration=${XFADE}:offset=${offset.toFixed(4)}[${vOut}]`);
    fc.push(`[${prevA}][${i}:a]acrossfade=d=${XFADE}:c1=tri:c2=tri[${aOut}]`);
    prevV=vOut; prevA=aOut;
  }
  const args=["-y"];
  for(const s of segs) args.push("-i",s);
  args.push("-filter_complex",fc.join(";"),"-map","[vout]","-map","[aout]","-c:v","libx264","-pix_fmt","yuv420p","-c:a","aac","-b:a","192k",concatOut);
  execFileSync("ffmpeg",args,{stdio:"pipe"});
}

// BGM
const bgmDir="/Users/kimuratakuya/line-harness/ig-auto-poster/scripts/bgm";
const bgmFiles=fs.existsSync(bgmDir)?fs.readdirSync(bgmDir).filter(f=>f.endsWith(".mp3")||f.endsWith(".m4a")):[];
const totalDur=segDurs.reduce((a,d)=>a+d,0)-(segs.length-1)*XFADE;
const final=path.join(TMP,"final.mp4");

if(bgmFiles.length>0){
  execFileSync("ffmpeg",["-y","-i",concatOut,"-i",path.join(bgmDir,bgmFiles[0]),"-filter_complex",
    `[0:a]aformat=sample_rates=44100:channel_layouts=stereo[voice];[1:a]volume=0.18,aloop=loop=-1:size=${44100*30},aformat=sample_rates=44100:channel_layouts=stereo,atrim=0:${totalDur},asetpts=PTS-STARTPTS[bgm];[voice][bgm]amix=inputs=2:duration=first[aout]`,
    "-map","0:v","-map","[aout]","-c:v","copy","-c:a","aac","-t",String(totalDur),final],{stdio:"pipe"});
} else {
  fs.copyFileSync(concatOut,final);
}

const sz=(fs.statSync(final).size/1024/1024).toFixed(1);
console.log(`\n完成！ ${final} (${sz}MB, ${totalDur.toFixed(1)}秒 / ${segs.length}セグ)`);
