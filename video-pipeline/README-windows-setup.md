# Windows ゲーミングPC セットアップ手順

## 前提
- Windows 11, RTX 4060 Laptop (8GB VRAM)
- NVIDIA Driver 591.59 / CUDA 13.1
- 同一LAN内でMacと接続

## Step 1: ComfyUI インストール

PowerShellを管理者で開いて実行:

```powershell
# 作業ディレクトリ
cd C:\
git clone https://github.com/comfyanonymous/ComfyUI.git
cd ComfyUI

# Python仮想環境 (Python 3.11推奨)
python -m venv venv
.\venv\Scripts\Activate.ps1

# PyTorch (CUDA 12.x)
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121

# ComfyUI依存
pip install -r requirements.txt
```

## Step 2: カスタムノード (ComfyUI Manager)

```powershell
cd C:\ComfyUI\custom_nodes
git clone https://github.com/ltdrdata/ComfyUI-Manager.git
```

## Step 3: 必要モデルのダウンロード

```powershell
cd C:\ComfyUI\models

# SD1.5ベースモデル (IP-Adapter用、軽量)
# checkpoints/
curl -L -o checkpoints/v1-5-pruned-emaonly.safetensors "https://huggingface.co/stable-diffusion-v1-5/stable-diffusion-v1-5/resolve/main/v1-5-pruned-emaonly.safetensors"

# IP-Adapter モデル (服装・髪型変更用)
mkdir -p ipadapter
curl -L -o ipadapter/ip-adapter-plus_sd15.safetensors "https://huggingface.co/h94/IP-Adapter/resolve/main/models/ip-adapter-plus_sd15.safetensors"

# CLIPビジョン
mkdir -p clip_vision
curl -L -o clip_vision/CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors "https://huggingface.co/h94/IP-Adapter/resolve/main/models/image_encoder/model.safetensors"

# ControlNet - OpenPose (ポーズ維持)
mkdir -p controlnet
curl -L -o controlnet/control_v11p_sd15_openpose.safetensors "https://huggingface.co/lllyasviel/ControlNet-v1-1/resolve/main/control_v11p_sd15_openpose.safetensors"

# ControlNet - Inpaint (部分編集)
curl -L -o controlnet/control_v11p_sd15_inpaint.safetensors "https://huggingface.co/lllyasviel/ControlNet-v1-1/resolve/main/control_v11p_sd15_inpaint.safetensors"
```

## Step 4: ComfyUI起動 (APIモード)

```powershell
cd C:\ComfyUI
.\venv\Scripts\Activate.ps1
python main.py --listen 0.0.0.0 --port 8188
```

起動後、ブラウザで `http://localhost:8188` が開けばOK。

## Step 5: IPアドレス確認

PowerShellで:
```powershell
ipconfig | findstr "IPv4"
```
表示されたIPアドレス（例: 192.168.1.xxx）をMac側に伝える。

## Step 6: FaceFusion (CUDA版)

```powershell
cd C:\
git clone https://github.com/facefusion/facefusion.git
cd facefusion
python -m venv venv
.\venv\Scripts\Activate.ps1
python install.py --onnxruntime cuda
```

## ファイアウォール設定

Windowsファイアウォールでポート8188を許可:
```powershell
New-NetFirewallRule -DisplayName "ComfyUI API" -Direction Inbound -Port 8188 -Protocol TCP -Action Allow
```

## VRAM節約Tips
- ComfyUI起動時に `--lowvram` オプションを追加すると8GBでも安定
- 生成解像度は512x768を基準に（1024は8GBだとOOM気味）
- 不要なブラウザタブは閉じる（ChromeがVRAM食う）
