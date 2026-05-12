# Fork Setup Guide

How to fork this project and set up development.

## Prerequisites

- GitHub account
- Git installed

## Steps

### 1. Fork on GitHub

1. Open https://github.com/komura-c/music-waves-visualizer
2. Click "Fork"
3. Select your account/organization

### 2. Initialize Local Repository

```bash
git init
git add .
git commit -m "Initial commit: Fork from komura-c/music-waves-visualizer"
git remote add origin https://github.com/YOUR_USERNAME/music-waves-visualizer.git
git branch -M main
git push -u origin main
```

### 3. Add Upstream

```bash
git remote add upstream https://github.com/komura-c/music-waves-visualizer.git
git remote -v
```

### 4. Pull Updates from Upstream

```bash
git fetch upstream
git merge upstream/main
git push origin main
```

## Development Flow

```bash
git checkout -b feature/your-feature
# ... edit ...
git add .
git commit -m "Add: feature description"
git push origin feature/your-feature
```

---

## 日本語

### Forkの作成

1. https://github.com/komura-c/music-waves-visualizer を開く
2. 「Fork」ボタンをクリック
3. 自分のアカウントを選択

### ローカル初期化

上記の手順2を参照。`YOUR_USERNAME` を自分のGitHubユーザー名に置き換えてください。

### 元リポジトリの更新を取り込む

上記の手順4を参照。`upstream/main` は元リポジトリのブランチ名に合わせてください。
