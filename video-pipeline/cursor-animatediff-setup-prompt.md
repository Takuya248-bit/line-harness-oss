# ComfyUI AnimateDiff セットアップ

## 目的
元動画の「動き（ポーズ）」だけを使い、参照画像の人物で新しい動画を生成する。
フレーム間の一貫性を保つためにAnimateDiffが必要。

## マシンスペック
- RTX 4060 Laptop (VRAM 8GB)
- ComfyUI: C:\ComfyUI（起動中）
- RealisticVision V5.1, IP-Adapter Plus, ControlNet OpenPose: インストール済み

## やること

### 1. AnimateDiff Evolved カスタムノード

```powershell
cd C:\ComfyUI\custom_nodes
git clone https://github.com/Kosinkadink/ComfyUI-AnimateDiff-Evolved.git
cd ComfyUI-AnimateDiff-Evolved
C:\ComfyUI\venv\Scripts\pip.exe install -r requirements.txt
```

### 2. AnimateDiff モーションモデル

```powershell
mkdir C:\ComfyUI\models\animatediff_models -ErrorAction SilentlyContinue
cd C:\ComfyUI\models\animatediff_models

# v3 adapter (SD1.5用、軽量)
Invoke-WebRequest -Uri "https://huggingface.co/guoyww/animatediff/resolve/main/v3_sd15_adapter.ckpt" -OutFile "v3_sd15_adapter.ckpt"

# mm_sd_v15_v2 モーションモジュール
Invoke-WebRequest -Uri "https://huggingface.co/guoyww/animatediff/resolve/main/mm_sd_v15_v2.ckpt" -OutFile "mm_sd_v15_v2.ckpt"
```

### 3. Video Helper Suite（動画入出力ノード）

```powershell
cd C:\ComfyUI\custom_nodes
git clone https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite.git
cd ComfyUI-VideoHelperSuite
C:\ComfyUI\venv\Scripts\pip.exe install -r requirements.txt
```

### 4. ComfyUI再起動

```powershell
Stop-Process -Name python -ErrorAction SilentlyContinue
Start-Sleep -Seconds 3
cd C:\ComfyUI
.\venv\Scripts\python.exe main.py --listen 0.0.0.0 --port 8188 --lowvram
```

## 完了条件
- [ ] ComfyUI-AnimateDiff-Evolved がcustom_nodesに存在
- [ ] ComfyUI-VideoHelperSuite がcustom_nodesに存在
- [ ] v3_sd15_adapter.ckpt と mm_sd_v15_v2.ckpt が animatediff_models/ に存在
- [ ] ComfyUI再起動後、ノード一覧に ADE_AnimateDiffLoaderWithContext が表示される
- [ ] エラーなく起動完了

## セットアップ後のパイプライン（Mac側で実行）
元動画 → OpenPose抽出 → AnimateDiff + IP-Adapter + ControlNet → 参照人物の動画生成
