# Windows OpenSSH サーバーセットアップ

## 目的
MacのClaude CodeからSSH経由でこのWindows PCのコマンドを実行できるようにする。
FaceFusion等のGPU処理をリモートから呼び出すために必要。

## やること（順番通りに実行）

### 1. OpenSSH サーバーのインストール・有効化

管理者PowerShellで実行:

```powershell
# OpenSSH Server機能を追加
Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0

# サービスを起動+自動起動設定
Start-Service sshd
Set-Service -Name sshd -StartupType Automatic

# ファイアウォール許可（既存ルールがなければ追加）
if (!(Get-NetFirewallRule -Name "OpenSSH-Server-In-TCP" -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -Name "OpenSSH-Server-In-TCP" -DisplayName "OpenSSH Server (sshd)" -Direction Inbound -Protocol TCP -LocalPort 22 -Action Allow
}
```

### 2. デフォルトシェルをPowerShellに変更

```powershell
New-ItemProperty -Path "HKLM:\SOFTWARE\OpenSSH" -Name DefaultShell -Value "C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe" -PropertyType String -Force
```

### 3. SSH公開鍵の設定（パスワードなしログイン）

Mac側の公開鍵をWindows側に登録する。

まずMac側の公開鍵を確認（Macのターミナルで実行、ここではコピペ用に表示）:
```bash
cat ~/.ssh/id_ed25519.pub
# または
cat ~/.ssh/id_rsa.pub
```

Mac側の公開鍵をWindows側の authorized_keys に追加:

```powershell
# ユーザー用 .ssh ディレクトリ作成
$sshDir = "$env:USERPROFILE\.ssh"
if (!(Test-Path $sshDir)) { New-Item -ItemType Directory -Path $sshDir }

# 公開鍵を追記（MAC_PUBLIC_KEY_HERE を実際の公開鍵に置き換える）
Add-Content -Path "$sshDir\authorized_keys" -Value "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAINhw7A+sfbVk2DR93jtVz926X3J9Wev5GpVz66YcBGev kimuratakuya@mac"

# パーミッション設定
icacls "$sshDir\authorized_keys" /inheritance:r /grant "$($env:USERNAME):(F)" /grant "SYSTEM:(F)"
```

注意: Windowsの管理者ユーザーの場合は、authorized_keys の配置場所が異なる:
```powershell
# 管理者ユーザーの場合はこちらに配置
$adminKeys = "C:\ProgramData\ssh\administrators_authorized_keys"
Add-Content -Path $adminKeys -Value "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAINhw7A+sfbVk2DR93jtVz926X3J9Wev5GpVz66YcBGev kimuratakuya@mac"
icacls $adminKeys /inheritance:r /grant "SYSTEM:(F)" /grant "Administrators:(F)"
```

### 4. sshd 再起動

```powershell
Restart-Service sshd
```

### 5. IPアドレスとユーザー名の確認

```powershell
# IPアドレス
ipconfig | findstr "IPv4"

# ユーザー名
$env:USERNAME
```

## 完了条件
- [ ] `Get-Service sshd` で Status が Running
- [ ] ファイアウォールでポート22が許可されている
- [ ] authorized_keys に公開鍵が登録されている
- [ ] IPアドレスとユーザー名を控えた

## 確認後、Mac側で実行するテストコマンド
```bash
ssh USERNAME@192.168.1.38 "echo 'SSH OK' && nvidia-smi"
```
