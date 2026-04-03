# Windows ゲーミングPC: ComfyUI + AI動画編集環境セットアップ

## マシンスペック
- Windows 11 Home, ASUS TUF Gaming F15 FX507VV
- RTX 4060 Laptop (VRAM 8GB), RAM 32GB, SSD 512GB
- NVIDIA Driver 591.59 / CUDA 13.1

## 目的
MacのClaude CodeからHTTP API経由でこのPCのComfyUIを操作し、動画のface swap・服装変更・髪型変更・背景変更を行うパイプラインを構築する。

## やること（順番通りに実行）

### 1. Python 3.11 確認・インストール
- `python --version` で確認。3.11.xでなければ https://www.python.org/downloads/release/python-3119/ からインストール
- PATHに追加されていることを確認

### 2. ComfyUI インストール
```powershell
cd C:\
git clone https://github.com/comfyanonymous/ComfyUI.git
cd C:\ComfyUI
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121
pip install -r requirements.txt
```

### 3. ComfyUI Manager（カスタムノード管理）
```powershell
cd C:\ComfyUI\custom_nodes
git clone https://github.com/ltdrdata/ComfyUI-Manager.git
```

### 4. IP-Adapter カスタムノード
```powershell
cd C:\ComfyUI\custom_nodes
git clone https://github.com/cubiq/ComfyUI_IPAdapter_plus.git
```

### 5. ControlNet カスタムノード
```powershell
cd C:\ComfyUI\custom_nodes
git clone https://github.com/Fannovel16/comfyui_controlnet_aux.git
cd comfyui_controlnet_aux
pip install -r requirements.txt
```

### 6. モデルダウンロード
```powershell
cd C:\ComfyUI\models

# SD1.5 ベースモデル
curl -L -o checkpoints\v1-5-pruned-emaonly.safetensors "https://huggingface.co/stable-diffusion-v1-5/stable-diffusion-v1-5/resolve/main/v1-5-pruned-emaonly.safetensors"

# IP-Adapter Plus (服装・髪型のスタイル転送)
mkdir ipadapter 2>$null
curl -L -o ipadapter\ip-adapter-plus_sd15.safetensors "https://huggingface.co/h94/IP-Adapter/resolve/main/models/ip-adapter-plus_sd15.safetensors"

# CLIP Vision (IP-Adapterが必要とする画像エンコーダ)
mkdir clip_vision 2>$null
curl -L -o clip_vision\CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors "https://huggingface.co/h94/IP-Adapter/resolve/main/models/image_encoder/model.safetensors"

# ControlNet OpenPose (ポーズ維持)
mkdir controlnet 2>$null
curl -L -o controlnet\control_v11p_sd15_openpose.safetensors "https://huggingface.co/lllyasviel/ControlNet-v1-1/resolve/main/control_v11p_sd15_openpose.safetensors"

# ControlNet Inpaint (部分編集)
curl -L -o controlnet\control_v11p_sd15_inpaint.safetensors "https://huggingface.co/lllyasviel/ControlNet-v1-1/resolve/main/control_v11p_sd15_inpaint.safetensors"
```

### 7. FaceFusion インストール (CUDA版)
```powershell
cd C:\
git clone https://github.com/facefusion/facefusion.git
cd C:\facefusion
python -m venv venv
.\venv\Scripts\Activate.ps1
python install.py --onnxruntime cuda
```

### 8. ファイアウォール設定（管理者PowerShell）
```powershell
New-NetFirewallRule -DisplayName "ComfyUI API" -Direction Inbound -Port 8188 -Protocol TCP -Action Allow
```

### 9. ComfyUI起動テスト
```powershell
cd C:\ComfyUI
.\venv\Scripts\Activate.ps1
python main.py --listen 0.0.0.0 --port 8188 --lowvram
```
ブラウザで http://localhost:8188 を開いて画面が表示されればOK。

### 10. IPアドレス確認
```powershell
ipconfig | findstr "IPv4"
```
表示されたLAN側IPアドレス（192.168.x.x）を控える。

## 完了条件
- [ ] ComfyUIが http://0.0.0.0:8188 で起動し、ブラウザからアクセスできる
- [ ] ComfyUI Manager がメニューに表示される
- [ ] FaceFusionが `python run.py --help` でヘルプ表示される
- [ ] `ipconfig` のIPv4アドレスを控えた

## 注意事項
- VRAM 8GBなので `--lowvram` フラグ必須
- 生成解像度は512x768を上限にする（1024はOOM）
- SSD 512GBなので、不要なモデルは都度削除してストレージ管理する
- モデルダウンロードは合計約7GB。空き容量を事前に確認すること
