# Fork開発セットアップ手順

このプロジェクトを元リポジトリからForkして開発を進めるための手順です。

## 前提条件

- GitHubアカウントを持っていること
- Gitがインストールされていること
- 現在のプロジェクトがGitリポジトリとして初期化されていないこと

## 手順

### 1. GitHubでForkを作成

1. ブラウザで https://github.com/komura-c/music-waves-visualizer を開く
2. 右上の「Fork」ボタンをクリック
3. Fork先のアカウント/組織を選択してForkを作成

### 2. ローカルリポジトリの初期化

現在のプロジェクトディレクトリで以下を実行：

```bash
# Gitリポジトリを初期化
git init

# すべてのファイルをステージング
git add .

# 初回コミット
git commit -m "Initial commit: Fork from komura-c/music-waves-visualizer"

# Forkしたリポジトリをoriginとして追加（YOUR_USERNAMEを自分のGitHubユーザー名に置き換え）
git remote add origin https://github.com/YOUR_USERNAME/music-waves-visualizer.git

# メインブランチを設定（通常はmainまたはmaster）
git branch -M main

# Forkしたリポジトリにプッシュ
git push -u origin main
```

### 3. 元リポジトリをupstreamとして追加

元のリポジトリの更新を取り込めるように、upstreamリモートを追加：

```bash
# 元のリポジトリをupstreamとして追加
git remote add upstream https://github.com/komura-c/music-waves-visualizer.git

# リモート設定を確認
git remote -v
```

以下のように表示されればOK：
```
origin    https://github.com/YOUR_USERNAME/music-waves-visualizer.git (fetch)
origin    https://github.com/YOUR_USERNAME/music-waves-visualizer.git (push)
upstream  https://github.com/komura-c/music-waves-visualizer.git (fetch)
upstream  https://github.com/komura-c/music-waves-visualizer.git (push)
```

### 4. 元リポジトリの更新を取り込む（必要に応じて）

元のリポジトリに更新があった場合、以下の手順で取り込めます：

```bash
# upstreamの最新情報を取得
git fetch upstream

# 現在のブランチにupstreamの変更をマージ
git merge upstream/main
# または upstream/master（元のリポジトリのメインブランチ名に合わせる）

# コンフリクトが発生した場合は解決してからコミット
# 解決後、自分のリポジトリにプッシュ
git push origin main
```

## 開発フロー

### 新機能の追加

1. 新しいブランチを作成
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. コードを編集・追加

3. 変更をコミット
   ```bash
   git add .
   git commit -m "Add: 機能の説明"
   ```

4. 自分のForkにプッシュ
   ```bash
   git push origin feature/your-feature-name
   ```

5. GitHub上でPull Requestを作成（必要に応じて元リポジトリにPRを作成することも可能）

### メインブランチにマージ

```bash
# メインブランチに切り替え
git checkout main

# 機能ブランチをマージ
git merge feature/your-feature-name

# プッシュ
git push origin main
```

## 注意事項

- 元のリポジトリへのクレジットは必ずREADME.mdに記載してください
- 大きな変更を加える場合は、元のリポジトリのライセンスを確認してください
- Forkしたリポジトリは独立して管理できるため、元のリポジトリとは異なる方向に進化させることができます

