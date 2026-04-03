# ComfyUI 髪型・服装変更用ノード追加セットアップ

## 目的
動画内の人物の「髪」と「服」だけをAIで自動セグメントし、その部分だけinpaintingで変更する。顔・背景はそのまま保持する。

## 現状
- ComfyUI: C:\ComfyUI にインストール済み（API起動中、ポート8188）
- IP-Adapter, ControlNet: インストール済み
- RealisticVision V5.1: checkpointsに配置済み
- SAMPreprocessor: 利用可能

## やること

### 1. ComfyUI-Segment-Anything ノード追加

```powershell
cd C:\ComfyUI\custom_nodes
git clone https://github.com/storyicon/comfyui_segment_anything.git
cd comfyui_segment_anything
C:\ComfyUI\venv\Scripts\pip.exe install -r requirements.txt
```

### 2. SAMモデルダウンロード

```powershell
mkdir C:\ComfyUI\models\sams -ErrorAction SilentlyContinue
cd C:\ComfyUI\models\sams
# SAM ViT-B (軽量、8GB VRAM向き)
Invoke-WebRequest -Uri "https://dl.fbaipublicfiles.com/segment_anything/sam_vit_b_01ec64.pth" -OutFile "sam_vit_b_01ec64.pth"
```

### 3. GroundingDINOモデルダウンロード（テキストでセグメント指定用）

```powershell
mkdir C:\ComfyUI\models\grounding-dino -ErrorAction SilentlyContinue
cd C:\ComfyUI\models\grounding-dino
Invoke-WebRequest -Uri "https://huggingface.co/ShilongLiu/GroundingDINO/resolve/main/groundingdino_swint_ogc.pth" -OutFile "groundingdino_swint_ogc.pth"
Invoke-WebRequest -Uri "https://huggingface.co/ShilongLiu/GroundingDINO/resolve/main/GroundingDINO_SwinT_OGC.cfg.py" -OutFile "GroundingDINO_SwinT_OGC.cfg.py"
```

### 4. Inpaint用ControlNetモデル（既にある場合はスキップ）

```powershell
# 確認
if (!(Test-Path C:\ComfyUI\models\controlnet\control_v11p_sd15_inpaint.safetensors)) {
    cd C:\ComfyUI\models\controlnet
    Invoke-WebRequest -Uri "https://huggingface.co/lllyasviel/ControlNet-v1-1/resolve/main/control_v11p_sd15_inpaint.safetensors" -OutFile "control_v11p_sd15_inpaint.safetensors"
}
```

### 5. ComfyUI再起動

```powershell
# 現在のComfyUIプロセスを停止して再起動
Stop-Process -Name python -ErrorAction SilentlyContinue
cd C:\ComfyUI
.\venv\Scripts\python.exe main.py --listen 0.0.0.0 --port 8188 --lowvram
```

## 完了条件
- [ ] comfyui_segment_anything カスタムノードがインストール済み
- [ ] sam_vit_b_01ec64.pth が C:\ComfyUI\models\sams\ に存在
- [ ] groundingdino_swint_ogc.pth が C:\ComfyUI\models\grounding-dino\ に存在
- [ ] ComfyUIを再起動してエラーなし
- [ ] http://localhost:8188 のノード一覧に GroundingDinoSAMSegment が表示される

## 使い方（セットアップ後にMac側で実行）
GroundingDINO + SAM で「hair」「shirt」をテキスト指定してマスク自動生成 → そのマスク領域だけinpaintingで変更する。
